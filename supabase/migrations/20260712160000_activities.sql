-- Activities & Facilities Booking (§10 [P2]). Two build-ready requirements from the spec:
-- (1) double-booking prevention is transactional, not visual — enforced below by locking the
-- slot row (`for update`) inside book_activity_slot() before counting confirmed bookings against
-- capacity, so two simultaneous claims on the last spot serialize instead of racing.
-- (2) cancellation/no-show policy fields live on the activity from day one
-- (cancellation_cutoff_minutes, deposit_forfeiture_percent) even though this P2 UI only reads
-- them to decide whether to log a late-cancellation event — actually forfeiting a deposit still
-- goes through the existing staff-only forfeit_deposit() RPC from 20260712140000_deposits.sql,
-- a human decision, not an automatic one.

create table activities (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  description text not null default '',
  duration_minutes integer not null check (duration_minutes > 0),
  default_capacity integer not null check (default_capacity > 0),
  price_minor_units integer not null default 0 check (price_minor_units >= 0),
  requires_deposit boolean not null default false,
  deposit_amount_minor_units integer not null default 0 check (deposit_amount_minor_units >= 0),
  cancellation_cutoff_minutes integer not null default 60 check (cancellation_cutoff_minutes >= 0),
  deposit_forfeiture_percent integer not null default 0 check (deposit_forfeiture_percent between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index activities_branch_id_idx on activities(branch_id);

create table activity_slots (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  starts_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now()
);

create index activity_slots_activity_id_idx on activity_slots(activity_id);
create index activity_slots_branch_id_starts_at_idx on activity_slots(branch_id, starts_at);

create table activity_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references activity_slots(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  stay_id uuid not null references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  guest_count integer not null default 1 check (guest_count > 0),
  state text not null default 'confirmed' check (state in ('confirmed', 'cancelled', 'no_show', 'completed')),
  deposit_id uuid references deposits(id) on delete set null,
  staff_assigned_id uuid references staff(id) on delete set null,
  cancel_reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index activity_bookings_slot_id_idx on activity_bookings(slot_id);
create index activity_bookings_stay_id_idx on activity_bookings(stay_id);
create index activity_bookings_branch_id_idx on activity_bookings(branch_id);

-- One atomic claim per call. The `for update` lock on the slot row is what makes this safe
-- under concurrency — a second caller racing for the same slot blocks here until the first
-- caller's transaction commits or rolls back, then re-reads a capacity count that already
-- reflects the first booking. Without this lock, two simultaneous reads of "3 of 4 booked"
-- could both decide there's room and both insert, overselling the slot.
create or replace function public.book_activity_slot(p_slot_id uuid, p_guest_count integer default 1)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_stay_id uuid;
  v_activity_id uuid;
  v_branch_id uuid;
  v_capacity integer;
  v_booked integer;
  v_active boolean;
  v_booking_id uuid;
begin
  if not is_guest() then
    raise exception 'guests only';
  end if;
  if p_guest_count is null or p_guest_count < 1 then
    raise exception 'invalid guest count';
  end if;

  v_stay_id := guest_stay_id();

  select s.activity_id, s.branch_id, s.capacity, a.active
    into v_activity_id, v_branch_id, v_capacity, v_active
  from activity_slots s
  join activities a on a.id = s.activity_id
  where s.id = p_slot_id
  for update of s;

  if not found then
    raise exception 'slot not found';
  end if;
  if not v_active then
    raise exception 'activity no longer offered';
  end if;

  select coalesce(sum(guest_count), 0) into v_booked
  from activity_bookings
  where slot_id = p_slot_id and state = 'confirmed';

  if v_booked + p_guest_count > v_capacity then
    raise exception 'slot full';
  end if;

  insert into activity_bookings (slot_id, activity_id, stay_id, branch_id, guest_count, state)
  values (p_slot_id, v_activity_id, v_stay_id, v_branch_id, p_guest_count, 'confirmed')
  returning id into v_booking_id;

  perform realtime.send(
    jsonb_build_object('booking_id', v_booking_id, 'slot_id', p_slot_id),
    'booking_created',
    'activities:branch:' || v_branch_id,
    false
  );

  return v_booking_id;
end;
$$;

grant execute on function public.book_activity_slot(uuid, integer) to authenticated;

-- Guest-callable cancellation. Past the activity's cancellation cutoff, this still cancels the
-- booking (a guest can always give up their spot) but logs a security_events row flagging a
-- late cancellation for staff to review manually — actually forfeiting the deposit is a human
-- decision via the existing forfeit_deposit() RPC, not automated here.
create or replace function public.cancel_activity_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_stay_id uuid;
  v_slot_starts_at timestamptz;
  v_cutoff_minutes integer;
  v_branch_id uuid;
  v_state text;
begin
  if not is_guest() then
    raise exception 'guests only';
  end if;

  select b.stay_id, b.state, b.branch_id, s.starts_at, a.cancellation_cutoff_minutes
    into v_stay_id, v_state, v_branch_id, v_slot_starts_at, v_cutoff_minutes
  from activity_bookings b
  join activity_slots s on s.id = b.slot_id
  join activities a on a.id = b.activity_id
  where b.id = p_booking_id
  for update of b;

  if not found or v_stay_id != guest_stay_id() then
    raise exception 'booking not found';
  end if;
  if v_state != 'confirmed' then
    raise exception 'booking already % ', v_state;
  end if;

  update activity_bookings
  set state = 'cancelled', cancel_reason = p_reason, cancelled_at = now()
  where id = p_booking_id;

  if now() > v_slot_starts_at - make_interval(mins => v_cutoff_minutes) then
    insert into security_events (branch_id, event_type, metadata)
    values (v_branch_id, 'late_activity_cancellation', jsonb_build_object('booking_id', p_booking_id));
  end if;

  perform realtime.send(
    jsonb_build_object('booking_id', p_booking_id),
    'booking_cancelled',
    'activities:branch:' || v_branch_id,
    false
  );
end;
$$;

grant execute on function public.cancel_activity_booking(uuid, text) to authenticated;

alter table activities enable row level security;
alter table activity_slots enable row level security;
alter table activity_bookings enable row level security;

create policy "anyone can browse active activities in own branch"
  on activities for select
  using (
    (is_guest() and branch_id = (select branch_id from stays where id = guest_stay_id()))
    or staff_branch_id() = branch_id
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "anyone can browse slots in own branch"
  on activity_slots for select
  using (
    (is_guest() and branch_id = (select branch_id from stays where id = guest_stay_id()))
    or staff_branch_id() = branch_id
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "guest can view own stay's bookings"
  on activity_bookings for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "staff can view branch bookings"
  on activity_bookings for select
  using (
    staff_branch_id() = branch_id
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

-- Matches the role matrix (§5.5): reception/concierge get "view" only, branch_manager/owner get
-- full control (assign staff, mark no-show/completed) — mirrors the same gating deposits' RPCs
-- use for the roles that can actually move money or override a guest-facing state.
create policy "branch manager can manage branch bookings"
  on activity_bookings for update
  using (
    staff_role_key() in ('branch_manager', 'owner')
    and (branch_id = staff_branch_id()
         or branch_id in (select id from branches where organization_id = staff_organization_id()))
  );
