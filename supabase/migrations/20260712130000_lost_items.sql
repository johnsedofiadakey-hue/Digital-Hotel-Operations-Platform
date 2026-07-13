-- Lost item reporting (§7.3 [P2]) + housekeeping's lost & found log
-- (§8.3 [P2]) — one table serves both directions: a guest reporting
-- something they lost, or housekeeping logging something they physically
-- found (which may never get a guest report at all). `stay_id` is nullable
-- for exactly that second case.

create table lost_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  stay_id uuid references stays(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  reported_by text not null check (reported_by in ('guest', 'staff')),
  description text not null check (char_length(description) between 1 and 1000),
  status text not null default 'reported' check (status in ('reported', 'found', 'returned', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lost_items_branch_id_idx on lost_items(branch_id);
create index lost_items_stay_id_idx on lost_items(stay_id);

-- Same branch_id-from-stay derivation as chat_messages/feedback/requests —
-- only relevant when a guest reports (stay_id is set); a staff-logged
-- found-item entry supplies branch_id directly since there's no stay to
-- derive it from.
create or replace function public.set_lost_item_branch_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stay_id is not null then
    select branch_id into new.branch_id from stays where id = new.stay_id;
  end if;
  return new;
end;
$$;

create trigger lost_items_set_branch_id
  before insert on lost_items
  for each row
  execute function public.set_lost_item_branch_id();

create or replace function public.touch_lost_item_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lost_items_touch_updated_at
  before update on lost_items
  for each row
  execute function public.touch_lost_item_updated_at();

alter table lost_items enable row level security;

-- A guest might realize they lost something after checkout — reporting
-- isn't gated to full trust or an active stay the way spending money is.
create policy "guest can view own stay's lost items"
  on lost_items for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "guest can report a lost item for own stay"
  on lost_items for insert
  with check (is_guest() and stay_id = guest_stay_id() and reported_by = 'guest');

create policy "staff can view lost items in own branch scope"
  on lost_items for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

-- Staff both log found items directly (reported_by = 'staff', no stay_id)
-- and update status as items move through reported -> found -> returned.
create policy "staff can create lost item entries in own branch scope"
  on lost_items for insert
  with check (
    reported_by = 'staff'
    and (branch_id = staff_branch_id()
         or branch_id in (select id from branches where organization_id = staff_organization_id()))
  );

create policy "staff can update lost items in own branch scope"
  on lost_items for update
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );
