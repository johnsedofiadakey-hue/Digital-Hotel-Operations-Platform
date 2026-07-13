-- Tipping — DHOP_Build_Spec.md §7.3 [P2]: "pay-now by nature, available at
-- both trust tiers." A separate table from `payments`/`checkout_settlements`
-- rather than shoehorning it into either: a tip isn't attached to an order
-- (unlike `payments`) and it's a repeatable action during the stay, not a
-- one-shot end-of-stay settlement (unlike `checkout_settlements`). Same
-- self-authorizing-RPC + service-role-resolves-the-outcome shape as both
-- of those, because the reasoning is identical — this is money, so it
-- can't be a direct RLS insert (§1 non-negotiable #3).

alter table folio_lines drop constraint folio_lines_source_check;
alter table folio_lines add constraint folio_lines_source_check
  check (source in ('order', 'service', 'adjustment', 'tip'));

create table tips (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  provider_ref text not null unique,
  state text not null default 'pending' check (state in ('pending', 'success', 'failed')),
  amount_minor_units int not null check (amount_minor_units > 0),
  raw_payload jsonb,
  initiated_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index tips_pending_initiated_idx on tips(state, initiated_at) where state = 'pending';

create or replace function public.initiate_tip(p_amount_minor_units int)
returns table (tip_id uuid, provider_ref text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stay_id uuid = guest_stay_id();
  v_branch_id uuid;
  v_ref text;
  v_tip_id uuid;
begin
  if not is_guest() or guest_tier() not in ('full', 'limited') then
    raise exception 'not authorized';
  end if;
  if p_amount_minor_units is null or p_amount_minor_units <= 0 then
    raise exception 'invalid amount';
  end if;

  select branch_id into v_branch_id from stays where id = v_stay_id and state = 'active';
  if v_branch_id is null then
    raise exception 'stay not active';
  end if;

  v_ref = 'dhop_tip_' || replace(gen_random_uuid()::text, '-', '');
  insert into tips (stay_id, branch_id, provider_ref, amount_minor_units)
  values (v_stay_id, v_branch_id, v_ref, p_amount_minor_units)
  returning id into v_tip_id;

  return query select v_tip_id, v_ref;
end;
$$;

revoke execute on function public.initiate_tip(int) from public, anon;
grant execute on function public.initiate_tip(int) to authenticated;

create or replace function public.resolve_tip_outcome(p_provider_ref text, p_outcome text, p_raw jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tip record;
  v_folio_id uuid;
begin
  if p_outcome not in ('success', 'failed') then
    raise exception 'invalid outcome %', p_outcome;
  end if;

  select * into v_tip from tips where provider_ref = p_provider_ref for update;
  if v_tip.id is null then
    return 'unknown_reference';
  end if;
  if v_tip.state != 'pending' then
    return 'already_resolved';
  end if;

  update tips set state = p_outcome, raw_payload = p_raw, resolved_at = now() where id = v_tip.id;

  if p_outcome = 'failed' then
    return 'failed';
  end if;

  insert into folios (stay_id, branch_id) values (v_tip.stay_id, v_tip.branch_id)
  on conflict (stay_id) do nothing;
  select id into v_folio_id from folios where stay_id = v_tip.stay_id;

  -- settled = true: paid via Paystack at the moment it succeeded, same as
  -- a pay-now order's folio line (20260711190000_payments.sql).
  insert into folio_lines (folio_id, branch_id, source, description, amount_minor_units, flagged, settled)
  values (v_folio_id, v_tip.branch_id, 'tip', 'Tip', v_tip.amount_minor_units, false, true);

  perform realtime.send(jsonb_build_object('tip_id', v_tip.id), 'folio_updated', 'folio:stay:' || v_tip.stay_id::text, false);

  return 'done';
end;
$$;

revoke execute on function public.resolve_tip_outcome(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_tip_outcome(text, text, jsonb) to service_role;

alter table tips enable row level security;

create policy "guest can view own tips"
  on tips for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "staff can view tips in own branch scope"
  on tips for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );
