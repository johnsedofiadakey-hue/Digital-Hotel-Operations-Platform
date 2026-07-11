-- DHOP Sprint 1 schema: organizations/branches/rooms, the stay lifecycle,
-- guest sessions, staff/roles, audit log, security events.
-- See DHOP_Build_Spec.md §3, §4, §6, §13, §14.3 for the flows this encodes.
--
-- Scope note: this migration covers the Sprint 1 spine (auth + stay lifecycle
-- + room board). Requests, orders, folios, and activities arrive in the
-- Sprint 2/3 migrations, once F&B and department portals are being built.
--
-- Guest auth model (§14.5, §14.6): guests are NOT Supabase Auth users. A guest
-- session is a signed JWT (minted by an Edge Function on QR scan / second-device
-- login), carrying custom claims: app_role='guest', stay_id, tier. It is signed
-- with the project's JWT secret so PostgREST/RLS can verify it via auth.jwt()
-- exactly like a normal Supabase Auth token, without the throwaway-account
-- cleanup problem a real Auth user per guest would create.
--
-- Staff use real Supabase Auth (PIN/OTP/password per §5.1-5.3), linked via
-- staff.user_id -> auth.users.id.

create extension if not exists pgcrypto;

-- =========================================================================
-- Organizations / Branches / Room hierarchy
-- =========================================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table room_categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  request_priority_default text not null default 'normal'
    check (request_priority_default in ('normal', 'high', 'urgent')),
  created_at timestamptz not null default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  category_id uuid not null references room_categories(id) on delete restrict,
  -- Opaque, unguessable, static per room (printed once on the tent card).
  -- 16 bytes hex = 128 bits entropy. See §4.2 — rotation happens at the
  -- session layer, never by reissuing this key.
  room_key text not null unique default encode(gen_random_bytes(16), 'hex'),
  label text not null, -- human-facing room number, e.g. "204"
  status text not null default 'vacant_clean'
    check (status in ('vacant_clean', 'vacant_dirty', 'occupied', 'occupied_dnd', 'out_of_order')),
  created_at timestamptz not null default now()
);

create index rooms_branch_id_idx on rooms(branch_id);

-- =========================================================================
-- Roles / Staff
-- =========================================================================

create table roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  scope text not null check (scope in ('branch', 'organization', 'platform'))
);

insert into roles (key, scope) values
  ('kitchen', 'branch'),
  ('housekeeping', 'branch'),
  ('maintenance', 'branch'),
  ('reception', 'branch'),
  ('concierge', 'branch'),
  ('finance', 'branch'),
  ('dept_manager', 'branch'),
  ('branch_manager', 'branch'),
  ('owner', 'organization'),
  ('super_admin', 'platform');

create table staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid not null references organizations(id) on delete cascade,
  -- null for organization-scoped roles (owner) that aren't tied to one branch
  branch_id uuid references branches(id) on delete cascade,
  role_id uuid not null references roles(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index staff_user_id_idx on staff(user_id);
create index staff_branch_id_idx on staff(branch_id);

-- PIN hashes for shared-tablet tap-in (§5.1). Uniqueness of the *plaintext*
-- PIN within a branch is enforced at the application layer (an Edge Function
-- checks the new PIN against existing active PINs via crypt() before
-- inserting) — a bcrypt hash's random salt makes a DB-level uniqueness
-- constraint on the hash itself meaningless.
create table staff_pins (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index staff_pins_branch_id_idx on staff_pins(branch_id) where revoked_at is null;

-- =========================================================================
-- Stays (the atom of guest identity — see §3)
-- =========================================================================

create table stays (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete restrict,
  branch_id uuid not null references branches(id) on delete cascade, -- denormalized for RLS
  state text not null default 'active'
    check (state in ('reserved', 'active', 'checked_out', 'force_closed', 'no_show')),
  last_names text[] not null default '{}',
  phone text,
  checkin_at timestamptz,
  checkout_due timestamptz,
  closed_at timestamptz,
  closed_reason text,
  device_cap int not null default 5,
  created_at timestamptz not null default now()
);

create index stays_room_id_idx on stays(room_id);
create index stays_branch_id_idx on stays(branch_id);

-- This IS the check-in guard from §3.2: a room can never have two active
-- stays at once. Attempting to check in over a stale active stay fails at
-- the database level, not just in application logic.
create unique index one_active_stay_per_room on stays(room_id) where state = 'active';

-- =========================================================================
-- Guest sessions (device-level access to a stay — §4.6)
-- =========================================================================

create table guest_sessions (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  tier text not null check (tier in ('full', 'limited', 'post_stay')),
  device_label text not null default 'Unknown device',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index guest_sessions_stay_id_idx on guest_sessions(stay_id);

-- =========================================================================
-- Audit log & security events (§13)
-- =========================================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  branch_id uuid references branches(id) on delete set null,
  actor_staff_id uuid references staff(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_branch_id_idx on audit_log(branch_id);

create table security_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index security_events_branch_id_idx on security_events(branch_id);

-- =========================================================================
-- Helper functions (used inside RLS policies below) — defined after the
-- tables they query.
-- =========================================================================

create or replace function public.guest_stay_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'stay_id', '')::uuid
$$;

create or replace function public.guest_tier()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'tier'
$$;

create or replace function public.is_guest()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'app_role') = 'guest', false)
$$;

-- SECURITY DEFINER: these read the `staff` table on behalf of the caller.
-- Without DEFINER, RLS on `staff` would apply while evaluating RLS on other
-- tables that call these functions, which is confusing at best. Fixed
-- search_path prevents search-path hijacking in a SECURITY DEFINER function.

create or replace function public.staff_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from staff where user_id = auth.uid() and active limit 1
$$;

create or replace function public.staff_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from staff where user_id = auth.uid() and active limit 1
$$;

create or replace function public.staff_role_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.key from staff s
  join roles r on r.id = s.role_id
  where s.user_id = auth.uid() and s.active
  limit 1
$$;

-- =========================================================================
-- Row Level Security — enabled on every table, no exceptions (§13)
-- =========================================================================

alter table organizations enable row level security;
alter table branches enable row level security;
alter table room_categories enable row level security;
alter table rooms enable row level security;
alter table roles enable row level security;
alter table staff enable row level security;
alter table staff_pins enable row level security;
alter table stays enable row level security;
alter table guest_sessions enable row level security;
alter table audit_log enable row level security;
alter table security_events enable row level security;

-- --- organizations ---

create policy "staff can view own organization"
  on organizations for select
  using (id = staff_organization_id());

-- --- branches ---

create policy "staff can view branches in own organization"
  on branches for select
  using (
    id = staff_branch_id()
    or organization_id = staff_organization_id()
  );

-- --- room_categories ---

create policy "staff can view categories in own branch scope"
  on room_categories for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "guest can view own room's category"
  on room_categories for select
  using (
    is_guest()
    and id = (
      select category_id from rooms
      where id = (select room_id from stays where id = guest_stay_id())
    )
  );

-- --- rooms ---

create policy "staff can view rooms in own branch scope"
  on rooms for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "staff can update rooms in own branch scope"
  on rooms for update
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "guest can view own current room"
  on rooms for select
  using (
    is_guest()
    and id = (select room_id from stays where id = guest_stay_id())
  );

-- Room lookup by room_key on scan (outcome resolution, §4.3) happens through
-- a SECURITY DEFINER Edge Function using the service-role client, not through
-- this anon-scoped policy set — an unauthenticated scanner has no stay_id yet.

-- --- staff ---

create policy "staff can view self"
  on staff for select
  using (user_id = auth.uid());

create policy "staff can view colleagues in own branch"
  on staff for select
  using (branch_id = staff_branch_id());

create policy "owners can view all staff in own organization"
  on staff for select
  using (
    organization_id = staff_organization_id()
    and staff_role_key() in ('owner', 'branch_manager')
  );

-- --- staff_pins ---

create policy "managers can view pins in own branch"
  on staff_pins for select
  using (
    branch_id = staff_branch_id()
    and staff_role_key() in ('branch_manager', 'owner')
  );

-- --- roles ---

create policy "authenticated staff can view role list"
  on roles for select
  using (staff_organization_id() is not null);

-- --- stays ---

create policy "staff can view stays in own branch scope"
  on stays for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "staff can update stays in own branch scope"
  on stays for update
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "guest can view own stay"
  on stays for select
  using (is_guest() and id = guest_stay_id());

-- Check-in, force-close, room-move, and checkout all go through an Edge
-- Function (service role) so the transitions in §3.2 — guard checks, folio
-- settlement, session downgrade — happen atomically. No direct staff INSERT
-- policy is needed here for that reason.

-- --- guest_sessions ---

create policy "guest can view own stay's sessions"
  on guest_sessions for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "guest can revoke own stay's sessions"
  on guest_sessions for update
  using (is_guest() and stay_id = guest_stay_id())
  with check (stay_id = guest_stay_id());

create policy "staff can view sessions for stays in own branch"
  on guest_sessions for select
  using (
    stay_id in (
      select id from stays
      where branch_id = staff_branch_id()
         or branch_id in (select id from branches where organization_id = staff_organization_id())
    )
  );

-- --- audit_log ---

create policy "managers can view audit log for own branch"
  on audit_log for select
  using (
    (branch_id = staff_branch_id() or organization_id = staff_organization_id())
    and staff_role_key() in ('branch_manager', 'owner')
  );

-- --- security_events ---

create policy "managers can view security events for own branch"
  on security_events for select
  using (
    branch_id = staff_branch_id()
    and staff_role_key() in ('branch_manager', 'owner')
  );

-- Writes to audit_log/security_events happen exclusively via the
-- service-role client (Edge Functions, triggers) — RLS is bypassed for that
-- role by design, so no INSERT policy is defined for the anon/authenticated
-- roles on either table.
