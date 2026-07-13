-- Sprint 5: SLA monitor, data retention, session hygiene —
-- DHOP_Build_Spec.md §8.1, §13, §14.6.
--
-- All three sweeps here need zero external credentials to build or test —
-- they're pure Postgres + pg_cron (see 20260711190000_payments.sql's
-- expire_stale_pending_payments() for the pattern this follows). The
-- "notify department/branch manager" steps are the same security_events
-- stub already used throughout this project for "notify X" — real push/SMS
-- delivery is Sprint 5's notification-fanout piece, which genuinely does
-- need FCM/Hubtel/Twilio credentials that don't exist (see HANDOVER.md).

-- =========================================================================
-- SLA monitor (§8.1). Defaults are hardcoded, not per-branch-configurable —
-- there's no branch-settings table to hold an override, and the spec's own
-- defaults are what's specified; configurability is a clearly separable
-- follow-up, not silently dropped scope.
-- =========================================================================

alter table requests add column sla_breach_1_at timestamptz;
alter table requests add column sla_breach_2_at timestamptz;

create or replace function public.sla_sweep()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_claim_minutes int;
  v_done_minutes int;
begin
  -- Unclaimed requests past their claim SLA.
  for r in
    select * from requests
    where state in ('submitted', 'reopened')
  loop
    v_claim_minutes := case
      when r.type = 'housekeeping' then 15
      when r.type = 'maintenance' and r.priority = 'urgent' then 15
      when r.type = 'maintenance' then 30
      when r.type = 'laundry' then 30
      else 30
    end;

    if r.sla_breach_1_at is null and r.submitted_at < now() - (v_claim_minutes || ' minutes')::interval then
      update requests set sla_breach_1_at = now() where id = r.id;
      insert into security_events (branch_id, event_type, metadata)
      values (r.branch_id, 'sla_breach_claim', jsonb_build_object('request_id', r.id, 'type', r.type, 'priority', r.priority));
    elsif r.sla_breach_1_at is not null and r.sla_breach_2_at is null
      and r.submitted_at < now() - (2 * v_claim_minutes || ' minutes')::interval then
      update requests set sla_breach_2_at = now() where id = r.id;
      insert into security_events (branch_id, event_type, metadata)
      values (r.branch_id, 'sla_breach_claim_escalated', jsonb_build_object('request_id', r.id, 'type', r.type, 'priority', r.priority));
    end if;
  end loop;

  -- Claimed-but-not-done requests past their done SLA (housekeeping only has
  -- a stated done SLA in §8.1 — 45 min; other types don't specify one, so
  -- only housekeeping is checked here, not extrapolated.)
  for r in
    select * from requests
    where state in ('claimed', 'in_progress') and type = 'housekeeping'
  loop
    v_done_minutes := 45;
    if r.sla_breach_1_at is null and r.submitted_at < now() - (v_done_minutes || ' minutes')::interval then
      update requests set sla_breach_1_at = now() where id = r.id;
      insert into security_events (branch_id, event_type, metadata)
      values (r.branch_id, 'sla_breach_done', jsonb_build_object('request_id', r.id, 'type', r.type));
    elsif r.sla_breach_1_at is not null and r.sla_breach_2_at is null
      and r.submitted_at < now() - (2 * v_done_minutes || ' minutes')::interval then
      update requests set sla_breach_2_at = now() where id = r.id;
      insert into security_events (branch_id, event_type, metadata)
      values (r.branch_id, 'sla_breach_done_escalated', jsonb_build_object('request_id', r.id, 'type', r.type));
    end if;
  end loop;
end;
$$;

create extension if not exists pg_cron;
select cron.schedule('sla-sweep', '* * * * *', 'select public.sla_sweep();');

-- =========================================================================
-- Session-expiry sweep (§14.6). guest_sessions carries no expiry column of
-- its own by design (§4.6 — expiry is always computed live from
-- stay.checkout_due, so extensions/late-checkout propagate automatically
-- with nothing per-session to update). This sweep is the cleanup pass:
-- revoke sessions whose stay's real expiry has passed, so the "connected
-- devices" list a guest sees doesn't accumulate stale entries forever.
-- =========================================================================

create or replace function public.expire_stale_guest_sessions()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update guest_sessions gs
  set revoked_at = now()
  from stays s
  where gs.stay_id = s.id
    and gs.revoked_at is null
    and (
      (s.state = 'active' and s.checkout_due is not null and s.checkout_due < now() - interval '24 hours')
      or (s.state in ('checked_out', 'force_closed') and s.closed_at < now() - interval '48 hours')
    );
end;
$$;

select cron.schedule('expire-stale-guest-sessions', '*/15 * * * *', 'select public.expire_stale_guest_sessions();');

-- =========================================================================
-- Retention purge (§13 — Ghana Data Protection Act 2012, Act 843). Runs
-- daily. Chat threads and ID documents aren't in this purge because neither
-- feature is built yet (see HANDOVER.md) — nothing to retrofit there yet,
-- and the spec's own reasoning for shipping this early ("retrofitting
-- retention onto live data is miserable") argues for adding those rules
-- the same migration that adds the tables, not preemptively here.
-- =========================================================================

create or replace function public.retention_purge()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Audit log: 2 years.
  delete from audit_log where created_at < now() - interval '2 years';

  -- Security events: 1 year.
  delete from security_events where created_at < now() - interval '1 year';

  -- Guest name/phone on a stay: 12 months post-checkout, then anonymized —
  -- "stay stats survive, identity doesn't." The stay row itself is never
  -- deleted (folios/orders/requests reference it and folio/receipt records
  -- have their own 6-year retention, longer than this).
  update stays
  set last_names = '{}', phone = null
  where state in ('checked_out', 'force_closed')
    and closed_at < now() - interval '12 months'
    and (last_names != '{}' or phone is not null);

  -- Folio/receipt/payment records: 6 years (Ghana tax record-keeping).
  -- Nothing to delete in practice for a very long time — included so the
  -- rule exists in code now rather than being retrofitted later, per the
  -- spec's own stated reasoning for shipping this job in P1.
  delete from folio_lines where posted_at < now() - interval '6 years';
  delete from payments where created_at < now() - interval '6 years';
end;
$$;

select cron.schedule('retention-purge', '0 3 * * *', 'select public.retention_purge();'); -- 03:00 daily
