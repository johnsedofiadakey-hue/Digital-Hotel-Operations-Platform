-- Three related §17/§13/§7.2 [P2] items, bundled because they share the same "give reception a
-- head start before the guest physically arrives" theme:
--   (1) Guest profile memory (§13) — opt-in at checkout, until a deletion request (Act 843).
--   (2) Reservation entry, P1-lite (§17 open item #4: "recommended yes, it's cheap; the full
--       booking calendar stays P3") — manual reservation rows so an "arriving today" list works.
--   (3) Contactless pre-registration (§7.2) — explicitly scoped down: the spec says "Phase 1
--       check-in happens at the desk (60-second flow, §3.2)," so this does NOT replace the desk
--       check-in or write directly into `stays`. It lets a guest fill in their name/phone/notes
--       ahead of arrival via a token-scoped link; reception sees it as a pre-filled hint on the
--       existing check-in flow, not an auto-check-in. The token lookup/write happens through a
--       Next.js Route Handler using the service-role client (same trust-boundary pattern as
--       `/r/[room_key]`, the QR-scan entry point) — never a direct anon-key RLS read, since a
--       reservation row carries a guest's name/phone and a guessable-token SELECT policy would
--       otherwise sit behind the same broad `grant select ... to anon` every table gets.

create table guests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  phone text not null,
  full_name text not null,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, phone)
);

alter table stays add column guest_id uuid references guests(id) on delete set null;

create table reservations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  room_category_id uuid references room_categories(id) on delete set null,
  guest_name text not null,
  phone text,
  party_size integer not null default 1 check (party_size > 0),
  arrival_date date not null,
  departure_date date not null,
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'checked_in', 'cancelled', 'no_show')),
  registration_token uuid not null default gen_random_uuid(),
  pre_registration jsonb,
  pre_registered_at timestamptz,
  created_by_staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  check (departure_date > arrival_date)
);

create index reservations_branch_id_arrival_idx on reservations(branch_id, arrival_date);
create unique index reservations_registration_token_idx on reservations(registration_token);

-- Guest-callable, self-authorizing (mirrors book_activity_slot()'s shape): writes/updates the
-- caller's own org's guest row keyed on phone, then links the current stay to it. No tier gate —
-- this is opt-in profile data, not money or a live-bill read.
create or replace function public.opt_in_guest_profile(p_phone text, p_full_name text, p_marketing_opt_in boolean default false)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_stay_id uuid;
  v_branch_id uuid;
  v_org_id uuid;
  v_guest_id uuid;
begin
  if not is_guest() then
    raise exception 'guests only';
  end if;
  if p_phone is null or length(trim(p_phone)) = 0 or p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'phone and name required';
  end if;

  v_stay_id := guest_stay_id();
  select branch_id into v_branch_id from stays where id = v_stay_id;
  select organization_id into v_org_id from branches where id = v_branch_id;

  insert into guests (organization_id, phone, full_name, marketing_opt_in)
  values (v_org_id, trim(p_phone), trim(p_full_name), p_marketing_opt_in)
  on conflict (organization_id, phone)
  do update set full_name = excluded.full_name, marketing_opt_in = excluded.marketing_opt_in
  returning id into v_guest_id;

  update stays set guest_id = v_guest_id where id = v_stay_id;

  return v_guest_id;
end;
$$;

grant execute on function public.opt_in_guest_profile(text, text, boolean) to authenticated;

-- Act 843 deletion right. Anonymizes rather than deletes the row outright so past-stay
-- aggregate stats survive (same "identity doesn't, stats do" rule the Sprint 5 retention purge
-- already applies to `stays.last_names`/`phone`) — reception+/branch_manager/owner only, scoped
-- to their own org.
create or replace function public.delete_guest_profile(p_guest_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if staff_role_key() not in ('reception', 'branch_manager', 'owner') then
    raise exception 'not authorized';
  end if;

  update guests
  set full_name = '[deleted]', phone = concat('deleted-', id::text), marketing_opt_in = false
  where id = p_guest_id and organization_id = staff_organization_id();
end;
$$;

grant execute on function public.delete_guest_profile(uuid) to authenticated;

alter table guests enable row level security;
alter table reservations enable row level security;

create policy "staff can view guest profiles in own org"
  on guests for select
  using (organization_id = staff_organization_id());

create policy "guest can view own linked profile"
  on guests for select
  using (is_guest() and id = (select guest_id from stays where id = guest_stay_id()));

create policy "front-of-house can view branch reservations"
  on reservations for select
  using (
    staff_role_key() in ('reception', 'concierge', 'branch_manager', 'owner')
    and (branch_id = staff_branch_id()
         or branch_id in (select id from branches where organization_id = staff_organization_id()))
  );

create policy "reception can create branch reservations"
  on reservations for insert
  with check (
    staff_role_key() in ('reception', 'branch_manager', 'owner')
    and (branch_id = staff_branch_id()
         or branch_id in (select id from branches where organization_id = staff_organization_id()))
  );

create policy "reception can update branch reservations"
  on reservations for update
  using (
    staff_role_key() in ('reception', 'branch_manager', 'owner')
    and (branch_id = staff_branch_id()
         or branch_id in (select id from branches where organization_id = staff_organization_id()))
  );
