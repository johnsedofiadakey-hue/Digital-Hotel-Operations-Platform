-- Sprint 3: menus, cart -> orders, charge-to-room folio lines —
-- DHOP_Build_Spec.md §7.3, §8.2, §9.1, §14.3.
--
-- Pay-now (Paystack) is Sprint 4 — every order this sprint is charge-to-room,
-- full trust only (§4.4, §9.1). Money is the one place this schema departs
-- from the `requests` table's "RLS-direct write" pattern: placing an order
-- touches four tables (orders, order_items, folios, folio_lines) and must
-- price server-side, never trust a client-submitted amount — exactly the
-- kind of atomicity/authorization complexity §1's non-negotiable #3
-- ("nothing that touches money is reachable without full trust") calls out.
-- So order placement is a single SECURITY DEFINER RPC, not a direct insert.

create table menu_sections (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  -- null = visible to every room category; set = only guests staying in
  -- that category see this section (§7.3 "menu (per room category)").
  room_category_id uuid references room_categories(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references menu_sections(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade, -- denormalized for RLS, same pattern as everywhere else
  name text not null,
  description text,
  price_minor_units int not null check (price_minor_units >= 0), -- pesewas
  available boolean not null default true, -- the sold-out toggle (§8.3)
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index menu_items_section_id_idx on menu_items(section_id);
create index menu_items_branch_id_idx on menu_items(branch_id);

create table orders (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  kitchen_state text not null default 'placed'
    check (kitchen_state in ('placed', 'acknowledged', 'preparing', 'ready', 'delivered')),
  payment_state text not null default 'charge_to_room'
    check (payment_state in ('charge_to_room', 'pending', 'paid', 'failed', 'refunded')),
  paystack_ref text unique, -- Sprint 4
  total_minor_units int not null default 0 check (total_minor_units >= 0),
  placed_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index orders_branch_id_idx on orders(branch_id);
create index orders_stay_id_idx on orders(stay_id);
-- Kitchen queue query: "this branch's not-yet-delivered orders."
create index orders_branch_kitchen_state_idx on orders(branch_id, kitchen_state);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  -- Snapshotted at order time — editing/removing a menu item later must
  -- never rewrite an already-placed order's history.
  name text not null,
  quantity int not null check (quantity > 0),
  unit_price_minor_units int not null check (unit_price_minor_units >= 0)
);

create index order_items_order_id_idx on order_items(order_id);

-- One folio per stay (§8.2, §9). Not created at check-in — lazily
-- get-or-created by place_charge_to_room_order() the first time it's
-- needed, via `on conflict (stay_id) do nothing`. A stay with no orders and
-- no other folio-line source never needed a folio row to exist.
create table folios (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null unique references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table folio_lines (
  id uuid primary key default gen_random_uuid(),
  folio_id uuid not null references folios(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  source text not null check (source in ('order', 'service', 'adjustment')),
  order_id uuid references orders(id) on delete set null,
  description text not null,
  amount_minor_units int not null, -- negative for adjustments/refund lines
  -- "charge-to-room posts at placement, flagged until delivered" (§8.2) —
  -- cleared by the trigger below when the order's kitchen_state reaches
  -- 'delivered'. Always false for non-order line sources.
  flagged boolean not null default false,
  posted_at timestamptz not null default now()
);

create index folio_lines_folio_id_idx on folio_lines(folio_id);

-- =========================================================================
-- place_charge_to_room_order — the only way an order gets created.
-- Authenticated-callable (guests call it directly, like a normal RLS-scoped
-- write would be), but SECURITY DEFINER: the authorization check is done
-- *inside* the function against auth.jwt()-derived claims
-- (is_guest()/guest_tier()/guest_stay_id(), same helpers RLS already uses),
-- not trusted from any argument — there is no p_stay_id parameter for
-- exactly that reason. Prices are looked up from menu_items server-side;
-- p_items only ever supplies (menu_item_id, quantity).
-- =========================================================================

create or replace function public.place_charge_to_room_order(p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stay_id uuid = guest_stay_id();
  v_branch_id uuid;
  v_order_id uuid;
  v_total int = 0;
  v_folio_id uuid;
  item jsonb;
  v_menu_item record;
  v_qty int;
begin
  if not is_guest() or guest_tier() <> 'full' then
    raise exception 'not authorized';
  end if;
  if v_stay_id is null then
    raise exception 'no active session';
  end if;

  select branch_id into v_branch_id from stays where id = v_stay_id and state = 'active';
  if v_branch_id is null then
    raise exception 'stay not active';
  end if;

  insert into orders (stay_id, branch_id, kitchen_state, payment_state, total_minor_units)
  values (v_stay_id, v_branch_id, 'placed', 'charge_to_room', 0)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_qty = (item ->> 'quantity')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;

    select id, name, price_minor_units into v_menu_item
    from menu_items
    where id = (item ->> 'menu_item_id')::uuid
      and branch_id = v_branch_id
      and available;

    if v_menu_item.id is null then
      raise exception 'menu item unavailable';
    end if;

    insert into order_items (order_id, menu_item_id, name, quantity, unit_price_minor_units)
    values (v_order_id, v_menu_item.id, v_menu_item.name, v_qty, v_menu_item.price_minor_units);

    v_total = v_total + v_qty * v_menu_item.price_minor_units;
  end loop;

  if v_total <= 0 then
    raise exception 'empty order';
  end if;

  update orders set total_minor_units = v_total where id = v_order_id;

  insert into folios (stay_id, branch_id) values (v_stay_id, v_branch_id)
  on conflict (stay_id) do nothing;
  select id into v_folio_id from folios where stay_id = v_stay_id;

  insert into folio_lines (folio_id, branch_id, source, order_id, description, amount_minor_units, flagged)
  values (v_folio_id, v_branch_id, 'order', v_order_id, 'F&B order', v_total, true);

  perform realtime.send(jsonb_build_object('id', v_order_id), 'order_placed', 'orders:branch:' || v_branch_id::text, false);
  perform realtime.send(jsonb_build_object('id', v_order_id), 'order_placed', 'orders:stay:' || v_stay_id::text, false);
  perform realtime.send(jsonb_build_object('order_id', v_order_id), 'folio_updated', 'folio:stay:' || v_stay_id::text, false);

  return v_order_id;
end;
$$;

revoke execute on function public.place_charge_to_room_order(jsonb) from public, anon;
grant execute on function public.place_charge_to_room_order(jsonb) to authenticated;

-- Delivery closes the "flagged" loop (§8.2).
create or replace function public.clear_folio_line_flag_on_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.kitchen_state = 'delivered' and old.kitchen_state is distinct from 'delivered' then
    update folio_lines set flagged = false where order_id = new.id;
  end if;
  return new;
end;
$$;

create trigger orders_clear_folio_flag
  after update on orders
  for each row
  execute function public.clear_folio_line_flag_on_delivery();

-- Realtime (§14.4, §4b) — Broadcast from Database, not postgres_changes
-- (confirmed non-functional on this local build — see HANDOVER.md §4b).
-- Content-free pings; every subscriber re-reads through its own RLS-scoped
-- connection.

create or replace function public.broadcast_order_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id), 'order_updated', 'orders:branch:' || new.branch_id::text, false);
  perform realtime.send(jsonb_build_object('id', new.id), 'order_updated', 'orders:stay:' || new.stay_id::text, false);
  return new;
end;
$$;

create trigger orders_broadcast_change
  after update on orders
  for each row
  execute function public.broadcast_order_change();

create or replace function public.broadcast_menu_item_availability()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.available is distinct from old.available then
    perform realtime.send(
      jsonb_build_object('id', new.id),
      'menu_availability_changed',
      'menu:branch:' || new.branch_id::text,
      false
    );
  end if;
  return new;
end;
$$;

create trigger menu_items_broadcast_availability
  after update on menu_items
  for each row
  execute function public.broadcast_menu_item_availability();

-- =========================================================================
-- RLS
-- =========================================================================

alter table menu_sections enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table folios enable row level security;
alter table folio_lines enable row level security;

-- Menu visibility is a merchandising concern, not a security boundary —
-- RLS just scopes to the guest's own branch; which sections a guest's room
-- category can see is filtered in the application query, same as it would
-- be for any other "show relevant subset" UI decision.
create policy "guest can view own branch's menu sections"
  on menu_sections for select
  using (is_guest() and branch_id = (select branch_id from stays where id = guest_stay_id()));

create policy "guest can view own branch's menu items"
  on menu_items for select
  using (is_guest() and branch_id = (select branch_id from stays where id = guest_stay_id()));

create policy "staff can view menu in own branch scope"
  on menu_sections for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "staff can view menu items in own branch scope"
  on menu_items for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

-- The sold-out toggle (§8.3) — kitchen staff flip `available`.
create policy "staff can update menu items in own branch scope"
  on menu_items for update
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "guest can view own stay's orders"
  on orders for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "staff can view orders in own branch scope"
  on orders for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

-- Kitchen state advances (acknowledged/preparing/ready/delivered, §8.2) —
-- staff only. No guest UPDATE policy: cancellation isn't built this sprint
-- (flagged as not-built in HANDOVER.md), and placement is the RPC above.
create policy "staff can update orders in own branch scope"
  on orders for update
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "guest can view own stay's order items"
  on order_items for select
  using (is_guest() and exists (
    select 1 from orders o where o.id = order_items.order_id and o.stay_id = guest_stay_id()
  ));

create policy "staff can view order items in own branch scope"
  on order_items for select
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and (o.branch_id = staff_branch_id()
           or o.branch_id in (select id from branches where organization_id = staff_organization_id()))
  ));

create policy "guest can view own folio"
  on folios for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "staff can view folios in own branch scope"
  on folios for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "guest can view own folio's lines"
  on folio_lines for select
  using (is_guest() and exists (
    select 1 from folios f where f.id = folio_lines.folio_id and f.stay_id = guest_stay_id()
  ));

create policy "staff can view folio lines in own branch scope"
  on folio_lines for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );
