-- Sprint 2: requests (housekeeping/maintenance/laundry), full lifecycle with
-- claiming — DHOP_Build_Spec.md §8.1, §14.3.
--
-- Unlike `stays` (no direct staff INSERT policy — check-in's guard/atomicity
-- needs a service-role route), a request's invariants are simple enough for
-- RLS to express directly: a guest can insert/read their own stay's
-- requests, staff can read/update requests in their branch. No Edge
-- Function/service-role route needed for the common path.

create table requests (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade, -- denormalized for RLS, same pattern as stays
  type text not null check (type in ('housekeeping', 'maintenance', 'laundry', 'concierge')),
  state text not null default 'submitted'
    check (state in ('submitted', 'claimed', 'in_progress', 'done', 'confirmed', 'cancelled', 'reopened')),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  note text,
  claimed_by uuid references staff(id) on delete set null,
  submitted_at timestamptz not null default now(),
  claimed_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index requests_branch_id_idx on requests(branch_id);
create index requests_stay_id_idx on requests(stay_id);
-- Department-pool queries filter on (branch, type, state) together — e.g.
-- "housekeeping's open queue" — far more often than any single column alone.
create index requests_branch_type_state_idx on requests(branch_id, type, state);

-- branch_id is derived here, never trusted from the client — a guest INSERT
-- only proves ownership of stay_id (see the RLS policy below), and without
-- this trigger a crafted payload could set branch_id to a different hotel's
-- id, which is exactly the cross-tenant leak §13's "RLS on every table, no
-- exceptions" principle exists to rule out structurally. SECURITY DEFINER so
-- this works uniformly regardless of caller (guest, staff, service role),
-- not just because the guest's own stay happens to be RLS-visible to them.
create or replace function public.set_request_branch_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select branch_id into new.branch_id from stays where id = new.stay_id;
  return new;
end;
$$;

create trigger requests_set_branch_id
  before insert on requests
  for each row
  execute function public.set_request_branch_id();

alter table requests enable row level security;

create policy "guest can view own stay's requests"
  on requests for select
  using (is_guest() and stay_id = guest_stay_id());

-- Only full/limited trust can submit requests (§4.4 capability matrix) —
-- post_stay is receipt/feedback only.
create policy "guest can create requests for own stay"
  on requests for insert
  with check (
    is_guest()
    and stay_id = guest_stay_id()
    and guest_tier() in ('full', 'limited')
  );

-- Lets the guest act on the state machine's guest-facing transitions
-- (done -> confirmed / reopened, §8.1) without a service-role round trip.
-- Which transitions are actually valid is enforced in application code via
-- canTransition() before this fires, same as every other state machine in
-- this schema — RLS's job here is scoping (own stay only), not validating
-- the transition graph.
create policy "guest can update own stay's requests"
  on requests for update
  using (is_guest() and stay_id = guest_stay_id())
  with check (stay_id = guest_stay_id());

create policy "staff can view requests in own branch scope"
  on requests for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "staff can update requests in own branch scope"
  on requests for update
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

-- Realtime (§14.4): "Broadcast from Database" via realtime.send(), not
-- postgres_changes — this local Supabase build only runs the replication
-- pipeline for Broadcast (`realtime.messages`), confirmed by testing; a
-- postgres_changes subscription reports SUBSCRIBED but never delivers a
-- single event, silently. Broadcasts here are deliberately content-free
-- (just the row id) — the same "signal, then the client re-reads through
-- its own RLS-scoped connection" pattern check-in's outcome-B live upgrade
-- already uses (packages/shared/src/realtime-broadcast.ts), not a shortcut
-- that leaks row data outside RLS. `private => false`: the topic name embeds
-- an unguessable UUID and the payload carries nothing sensitive, so this is
-- the same trust level as that existing broadcast, not a new exposure.
create or replace function public.broadcast_request_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  evt text = case when tg_op = 'INSERT' then 'request_submitted' else 'request_updated' end;
begin
  perform realtime.send(jsonb_build_object('id', new.id), evt, 'requests:branch:' || new.branch_id::text, false);
  perform realtime.send(jsonb_build_object('id', new.id), evt, 'requests:stay:' || new.stay_id::text, false);
  return new;
end;
$$;

create trigger requests_broadcast_change
  after insert or update on requests
  for each row
  execute function public.broadcast_request_change();

create or replace function public.broadcast_room_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status is distinct from old.status then
    perform realtime.send(
      jsonb_build_object('id', new.id),
      'room_status_changed',
      'rooms:branch:' || new.branch_id::text,
      false
    );
  end if;
  return new;
end;
$$;

create trigger rooms_broadcast_status_change
  after update on rooms
  for each row
  execute function public.broadcast_room_status_change();
