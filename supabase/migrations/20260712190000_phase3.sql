-- Phase 3 [P3], built at explicit user request overriding the spec's own "do not build it
-- early" guidance for these items. Three pieces:
--   (1) Workload-balanced auto-assignment (§8.1) for requests.
--   (2) Redirect automation (§7.4) — happy guests nudged to a public review link.
--   (3) A booking calendar (§10/§17's "master calendar"/"full booking calendar") combining
--       activity bookings and reservations into one staff-facing view.
-- (3) needs no new schema — it's a read-only aggregate over tables that already exist
-- (activity_bookings, activity_slots, reservations) — so this migration only covers (1) and (2).

-- --- (1) Workload-balanced auto-assignment ---
-- On submission, a request is auto-assigned to whichever active staff member in the matching
-- department (branch-scoped) currently has the fewest open (claimed/in_progress) requests —
-- ties broken by staff.id for determinism. This does NOT remove the pool: `claimed_by` is still
-- a plain column any branch-scoped staff UPDATE can change (existing RLS policy, unchanged), so
-- reassignment/"I'll take this one instead" still works exactly as before. If no staff exists in
-- the matching department, the request is left `submitted` (unclaimed) exactly like today — this
-- is an assignment optimization on top of the pool, not a replacement for it.
create or replace function public.department_role_key(p_request_type text)
returns text
language sql immutable
as $$
  select case p_request_type
    when 'housekeeping' then 'housekeeping'
    when 'laundry' then 'housekeeping'
    when 'maintenance' then 'maintenance'
    when 'concierge' then 'concierge'
    else null
  end;
$$;

create or replace function public.auto_assign_request()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role_key text;
  v_staff_id uuid;
begin
  v_role_key := department_role_key(new.type);
  if v_role_key is null then
    return new;
  end if;

  select s.id into v_staff_id
  from staff s
  join roles r on r.id = s.role_id
  left join requests open_r on open_r.claimed_by = s.id and open_r.state in ('claimed', 'in_progress')
  where s.branch_id = new.branch_id
    and s.active
    and r.key = v_role_key
  group by s.id
  order by count(open_r.id) asc, s.id asc
  limit 1;

  if v_staff_id is not null then
    new.claimed_by := v_staff_id;
    new.state := 'claimed';
    new.claimed_at := now();
  end if;

  return new;
end;
$$;

create trigger requests_auto_assign
  before insert on requests
  for each row
  execute function public.auto_assign_request();

-- --- (2) Redirect automation ---
-- Nullable per-branch review links. FeedbackForm.tsx shows a "leave us a review" nudge only
-- when rating >= 4 AND at least one URL is configured — an unconfigured branch just gets the
-- private-feedback-only behavior it already had, no broken/placeholder links shown to a guest.
alter table branches add column google_review_url text;
alter table branches add column tripadvisor_review_url text;

-- Guests had no SELECT policy on `branches` at all before this — needed so the guest portal can
-- read wifi_info/directions/house_rules (already added, §7.1) and now the review URLs, scoped
-- strictly to the guest's own stay's branch.
--
-- SECURITY DEFINER, same reasoning as staff_branch_id()/staff_organization_id() above: `stays`
-- already has a staff policy whose USING clause queries `branches` (branch scope-by-org check).
-- A plain (non-DEFINER) subquery on `stays` here would re-trigger RLS on `stays`, which
-- re-queries `branches`, which re-evaluates THIS policy — infinite recursion between the two
-- tables. Caught by testing (a direct guest SELECT on `branches` errored with "infinite
-- recursion detected in policy for relation stays"), fixed by routing the stay->branch lookup
-- through a SECURITY DEFINER function so it bypasses RLS on `stays` entirely, exactly like the
-- staff helpers already do for the same structural reason.
create or replace function public.guest_branch_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select branch_id from stays where id = guest_stay_id()
$$;

create policy "guest can view own stay's branch"
  on branches for select
  using (is_guest() and id = guest_branch_id());
