-- Sprint 4: Paystack pay-now, the full §9.2 outcome matrix —
-- DHOP_Build_Spec.md §9.1, §9.2, §14.3, §14.6.
--
-- One order can have MULTIPLE payment attempts (a guest who retries after a
-- decline gets a fresh Paystack reference each time) — that's why `payments`
-- is its own table, not just columns on `orders`. "Every Paystack reference
-- maps to exactly one order; webhook and verify handlers are idempotent on
-- that reference" (§9.2's own stated rule) is enforced here: provider_ref is
-- unique, and resolve_payment_outcome() is the single choke point every
-- webhook/verify call goes through — no other code path may change a
-- payment's state.

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  provider text not null default 'paystack',
  provider_ref text not null unique,
  state text not null default 'pending' check (state in ('pending', 'success', 'failed', 'refunded')),
  amount_minor_units int not null check (amount_minor_units >= 0),
  method text, -- 'mobile_money' | 'card' — populated from the webhook/verify response
  raw_payload jsonb,
  initiated_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index payments_order_id_idx on payments(order_id);
create index payments_branch_id_idx on payments(branch_id);
-- The expiry sweep's exact query: "pending payments past their timeout."
create index payments_pending_initiated_idx on payments(state, initiated_at) where state = 'pending';

-- 'cancelled' is new — needed for the abandoned-payment timeout path
-- ("order auto-cancelled", §9.2). Manual cancellation (guest/kitchen,
-- §8.2) is still not built (see HANDOVER.md) — this only covers the one
-- cancellation path Sprint 4's own outcome matrix requires.
alter table orders drop constraint orders_kitchen_state_check;
alter table orders add constraint orders_kitchen_state_check
  check (kitchen_state in ('placed', 'acknowledged', 'preparing', 'ready', 'delivered', 'cancelled'));

-- `flagged` (Sprint 3) tracks delivery status; `settled` is a different axis
-- entirely — has this charge actually been paid? A pay-now folio line is
-- settled the instant Paystack confirms success (the money's already in);
-- a charge-to-room line stays unsettled until the guest pays their bill,
-- whether that's a normal desk checkout (not built — out of scope, see
-- HANDOVER.md) or express checkout's Paystack payment below. Conflating
-- these two would have let a guest's own pending kitchen order look like an
-- unpaid balance, or a paid-but-not-yet-delivered order look settled when
-- it hadn't been billed at all.
alter table folio_lines add column settled boolean not null default false;

-- =========================================================================
-- place_pay_now_order — mirrors place_charge_to_room_order (Sprint 3) but
-- for the pay-now path: available to guests at BOTH trust tiers (§4.4,
-- unlike charge-to-room), creates the order in `pending` payment state, and
-- posts NO folio line yet — that only happens once resolve_payment_outcome
-- sees a real success. Kitchen never sees a pending order (only broadcasts
-- to the guest's own topic) — "pending-payment orders are invisible to the
-- kitchen" is enforced here by simply not sending the branch-topic
-- broadcast until payment succeeds, not by a kitchen-side filter that could
-- be bypassed by a future bug.
-- =========================================================================

create or replace function public.place_pay_now_order(p_items jsonb)
returns table (order_id uuid, payment_id uuid, provider_ref text, total_minor_units int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stay_id uuid = guest_stay_id();
  v_branch_id uuid;
  v_order_id uuid;
  v_payment_id uuid;
  v_ref text;
  v_total int = 0;
  item jsonb;
  v_menu_item record;
  v_qty int;
begin
  if not is_guest() then
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
  values (v_stay_id, v_branch_id, 'placed', 'pending', 0)
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

  v_ref = 'dhop_' || replace(gen_random_uuid()::text, '-', '');
  insert into payments (order_id, branch_id, provider_ref, state, amount_minor_units)
  values (v_order_id, v_branch_id, v_ref, 'pending', v_total)
  returning id into v_payment_id;

  perform realtime.send(jsonb_build_object('id', v_order_id), 'order_updated', 'orders:stay:' || v_stay_id::text, false);

  return query select v_order_id, v_payment_id, v_ref, v_total;
end;
$$;

revoke execute on function public.place_pay_now_order(jsonb) from public, anon;
grant execute on function public.place_pay_now_order(jsonb) to authenticated;

-- Retry after a decline (§9.2: "guest offered retry or different method") —
-- a fresh payment attempt (fresh provider_ref) against the SAME order, not
-- a new order.
create or replace function public.retry_order_payment(p_order_id uuid)
returns table (payment_id uuid, provider_ref text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order record;
  v_ref text;
  v_payment_id uuid;
begin
  if not is_guest() then
    raise exception 'not authorized';
  end if;

  select * into v_order from orders where id = p_order_id and stay_id = guest_stay_id();
  if v_order.id is null then
    raise exception 'order not found';
  end if;
  if v_order.payment_state not in ('pending', 'failed') then
    raise exception 'order is not retryable';
  end if;

  update orders set payment_state = 'pending' where id = v_order.id;

  v_ref = 'dhop_' || replace(gen_random_uuid()::text, '-', '');
  insert into payments (order_id, branch_id, provider_ref, state, amount_minor_units)
  values (v_order.id, v_order.branch_id, v_ref, 'pending', v_order.total_minor_units)
  returning id into v_payment_id;

  return query select v_payment_id, v_ref;
end;
$$;

revoke execute on function public.retry_order_payment(uuid) from public, anon;
grant execute on function public.retry_order_payment(uuid) to authenticated;

-- =========================================================================
-- resolve_payment_outcome — the single choke point for every webhook/verify
-- result (§9.2's idempotency rule). service_role only: called from the
-- webhook receiver and the verify-poll route, never directly by a guest or
-- staff session. Returns a descriptor so the caller (application code)
-- knows whether it needs to place an actual Paystack refund API call
-- afterward — this function only ever touches our own database, it never
-- calls out to Paystack itself.
-- =========================================================================

create or replace function public.resolve_payment_outcome(p_provider_ref text, p_outcome text, p_raw jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_payment record;
  v_order record;
begin
  if p_outcome not in ('success', 'failed') then
    raise exception 'invalid outcome %', p_outcome;
  end if;

  select * into v_payment from payments where provider_ref = p_provider_ref for update;
  if v_payment.id is null then
    return 'unknown_reference';
  end if;

  -- Idempotent duplicate-signal guard — deliberately narrow. A payment that
  -- already reached 'success' or 'refunded' is done, full stop: any further
  -- signal for that reference is a no-op. A payment already 'failed' is
  -- NOT automatically done, though: it might have failed via decline, or it
  -- might have failed via expire_stale_pending_payments()'s 15-min sweep —
  -- and in that second case, a *late* 'success' signal for the same
  -- reference is exactly the "late success" row of §9.2's outcome table,
  -- which must still run (to trigger the refund below), not be swallowed
  -- here as if it were an ordinary duplicate. Only an exact repeat of
  -- 'failed' on an already-'failed' payment is a true no-op.
  if v_payment.state in ('success', 'refunded') then
    return 'already_resolved';
  end if;
  if v_payment.state = 'failed' and p_outcome = 'failed' then
    return 'already_resolved';
  end if;

  update payments set state = p_outcome, raw_payload = p_raw, resolved_at = now() where id = v_payment.id;
  select * into v_order from orders where id = v_payment.order_id for update;

  if p_outcome = 'failed' then
    update orders set payment_state = 'failed' where id = v_order.id and payment_state = 'pending';
    perform realtime.send(jsonb_build_object('id', v_order.id), 'order_updated', 'orders:stay:' || v_order.stay_id::text, false);
    return 'declined';
  end if;

  -- p_outcome = 'success' from here on.

  -- Late success: the order already timed out (expire_stale_pending_payments
  -- got there first and marked it failed/cancelled). Never fulfill food
  -- that was never queued — refund, don't revive (§9.2's stated default).
  if v_order.payment_state = 'failed' then
    update payments set state = 'refunded' where id = v_payment.id;
    insert into audit_log (branch_id, action, entity_type, entity_id, metadata)
    values (v_order.branch_id, 'payment_auto_refund_late_success', 'payment', v_payment.id,
            jsonb_build_object('order_id', v_order.id, 'provider_ref', p_provider_ref));
    perform realtime.send(jsonb_build_object('id', v_order.id), 'order_updated', 'orders:stay:' || v_order.stay_id::text, false);
    return 'refund_late_success';
  end if;

  -- Double payment: the order was already fulfilled by an earlier
  -- successful payment attempt. Fulfill one (already done), refund this one.
  if v_order.payment_state = 'paid' then
    update payments set state = 'refunded' where id = v_payment.id;
    insert into audit_log (branch_id, action, entity_type, entity_id, metadata)
    values (v_order.branch_id, 'payment_auto_refund_double_payment', 'payment', v_payment.id,
            jsonb_build_object('order_id', v_order.id, 'provider_ref', p_provider_ref));
    return 'refund_double_payment';
  end if;

  -- Normal happy path: first success for this order.
  update orders set payment_state = 'paid' where id = v_order.id;

  insert into folios (stay_id, branch_id) values (v_order.stay_id, v_order.branch_id)
  on conflict (stay_id) do nothing;

  -- settled = true: Paystack already collected this money, unlike a
  -- charge-to-room line (settled defaults false there).
  insert into folio_lines (folio_id, branch_id, source, order_id, description, amount_minor_units, flagged, settled)
  select f.id, v_order.branch_id, 'order', v_order.id, 'F&B order (paid)', v_order.total_minor_units, true, true
  from folios f where f.stay_id = v_order.stay_id;

  perform realtime.send(jsonb_build_object('id', v_order.id), 'order_placed', 'orders:branch:' || v_order.branch_id::text, false);
  perform realtime.send(jsonb_build_object('id', v_order.id), 'order_updated', 'orders:stay:' || v_order.stay_id::text, false);
  perform realtime.send(jsonb_build_object('order_id', v_order.id), 'folio_updated', 'folio:stay:' || v_order.stay_id::text, false);

  return 'fulfilled';
end;
$$;

revoke execute on function public.resolve_payment_outcome(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_payment_outcome(text, text, jsonb) to service_role;

-- =========================================================================
-- Abandoned-payment sweep (§9.2: "Guest abandons (no action) | 15 min
-- timeout | payment -> failed (expired); order auto-cancelled"). Scheduled
-- via pg_cron below — genuinely runs, not just spec'd, and needs no
-- external deployment since it's entirely inside Postgres.
-- =========================================================================

create or replace function public.expire_stale_pending_payments()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_payment record;
begin
  for v_payment in
    select p.id, p.order_id from payments p
    where p.state = 'pending' and p.initiated_at < now() - interval '15 minutes'
  loop
    update payments set state = 'failed', resolved_at = now() where id = v_payment.id;
    update orders
    set payment_state = 'failed', kitchen_state = 'cancelled'
    where id = v_payment.order_id and payment_state = 'pending';

    perform realtime.send(
      jsonb_build_object('id', v_payment.order_id),
      'order_updated',
      'orders:stay:' || (select stay_id from orders where id = v_payment.order_id)::text,
      false
    );
  end loop;
end;
$$;

create extension if not exists pg_cron;
select cron.schedule('expire-stale-pending-payments', '* * * * *', 'select public.expire_stale_pending_payments();');

-- =========================================================================
-- Express checkout (§7.4, §3.2's checkout effects). A dedicated table
-- rather than reusing `payments` — a checkout settlement isn't a payment
-- against any one order, it's against the whole stay's remaining balance,
-- and forcing that through a table whose every other row has a required
-- order_id would either loosen an invariant resolve_payment_outcome relies
-- on or need a fragile "sentinel" order. Kept structurally separate instead.
-- =========================================================================

create table checkout_settlements (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  provider_ref text not null unique,
  state text not null default 'pending' check (state in ('pending', 'success', 'failed')),
  amount_minor_units int not null check (amount_minor_units >= 0),
  raw_payload jsonb,
  initiated_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index checkout_settlements_pending_idx on checkout_settlements(state, initiated_at) where state = 'pending';

-- Shared by the zero-balance immediate path and the paid-settlement path
-- below — §3.2's checkout effects. Deliberately narrow: room status and the
-- stay's own state, nothing else. Auto-generated housekeeping turnover
-- tasks and the feedback-request send are NOT built (see HANDOVER.md — the
-- former has no home in the current schema, the latter is Sprint 5's
-- feedback-sender Edge Function, which needs WhatsApp/SMS credentials that
-- don't exist). Guest session downgrade to `post_stay` isn't done eagerly
-- here either — it's already handled lazily and correctly by the existing
-- scan-route logic (handlePostStay in apps/guest-web/app/r/[room_key]/
-- route.ts) the moment `stays.state = 'checked_out'` is observed, so
-- there's nothing this function needs to do for that part.
create or replace function public.perform_checkout(p_stay_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room_id uuid;
  v_branch_id uuid;
begin
  select room_id, branch_id into v_room_id, v_branch_id from stays where id = p_stay_id;

  update stays set state = 'checked_out', closed_at = now() where id = p_stay_id;
  update rooms set status = 'vacant_dirty' where id = v_room_id;

  insert into audit_log (branch_id, action, entity_type, entity_id, metadata)
  values (v_branch_id, 'guest_express_checkout', 'stay', p_stay_id, '{}'::jsonb);
end;
$$;

revoke execute on function public.perform_checkout(uuid) from public, anon, authenticated;
grant execute on function public.perform_checkout(uuid) to service_role;

-- Guest-callable entry point. Zero balance -> checks out immediately and
-- says so; positive balance -> opens a settlement record and hands back the
-- reference for the caller (a Next.js route — see HANDOVER.md) to actually
-- initiate the Paystack charge.
create or replace function public.initiate_express_checkout()
returns table (needs_payment boolean, provider_ref text, amount_minor_units int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stay_id uuid = guest_stay_id();
  v_branch_id uuid;
  v_balance int;
  v_ref text;
begin
  if not is_guest() or guest_tier() <> 'full' then
    raise exception 'not authorized';
  end if;
  if v_stay_id is null then
    raise exception 'no active session';
  end if;

  select s.branch_id into v_branch_id from stays s where s.id = v_stay_id and s.state = 'active';
  if v_branch_id is null then
    raise exception 'stay not active';
  end if;

  select coalesce(sum(fl.amount_minor_units), 0) into v_balance
  from folio_lines fl
  join folios f on f.id = fl.folio_id
  where f.stay_id = v_stay_id and fl.settled = false;

  if v_balance <= 0 then
    perform perform_checkout(v_stay_id);
    return query select false, null::text, 0;
    return;
  end if;

  v_ref = 'dhop_co_' || replace(gen_random_uuid()::text, '-', '');
  insert into checkout_settlements (stay_id, branch_id, provider_ref, state, amount_minor_units)
  values (v_stay_id, v_branch_id, v_ref, 'pending', v_balance);

  return query select true, v_ref, v_balance;
end;
$$;

revoke execute on function public.initiate_express_checkout() from public, anon;
grant execute on function public.initiate_express_checkout() to authenticated;

-- service_role-only, mirrors resolve_payment_outcome's shape but simpler —
-- a settlement has no kitchen queue, no late-success/double-payment
-- distinction, just pending -> success (settle every unsettled line, then
-- check out) or pending -> failed ("guest is routed to the desk", §7.4 —
-- checkout is never blocked by a gateway error at the guest's expense).
create or replace function public.resolve_checkout_settlement(p_provider_ref text, p_outcome text, p_raw jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_settlement record;
begin
  if p_outcome not in ('success', 'failed') then
    raise exception 'invalid outcome %', p_outcome;
  end if;

  select * into v_settlement from checkout_settlements where provider_ref = p_provider_ref for update;
  if v_settlement.id is null then
    return 'unknown_reference';
  end if;
  if v_settlement.state != 'pending' then
    return 'already_resolved';
  end if;

  update checkout_settlements set state = p_outcome, raw_payload = p_raw, resolved_at = now()
  where id = v_settlement.id;

  if p_outcome = 'failed' then
    return 'failed';
  end if;

  update folio_lines set settled = true
  where settled = false
    and folio_id = (select id from folios where stay_id = v_settlement.stay_id);

  perform perform_checkout(v_settlement.stay_id);
  return 'done';
end;
$$;

revoke execute on function public.resolve_checkout_settlement(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_checkout_settlement(text, text, jsonb) to service_role;

-- =========================================================================
-- RLS
-- =========================================================================

alter table payments enable row level security;

create policy "guest can view own order's payments"
  on payments for select
  using (is_guest() and exists (
    select 1 from orders o where o.id = payments.order_id and o.stay_id = guest_stay_id()
  ));

create policy "staff can view payments in own branch scope"
  on payments for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

-- No guest/staff INSERT or UPDATE policy on `payments` — every write goes
-- through place_pay_now_order / retry_order_payment (guest-callable,
-- self-authorizing) or resolve_payment_outcome (service_role only).

alter table checkout_settlements enable row level security;

create policy "guest can view own checkout settlements"
  on checkout_settlements for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "staff can view checkout settlements in own branch scope"
  on checkout_settlements for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

-- No guest/staff INSERT or UPDATE policy — every write goes through
-- initiate_express_checkout (guest-callable, self-authorizing) or
-- resolve_checkout_settlement (service_role only).

-- Tightening a Sprint 3 gap found while building the receipt page: the
-- original "guest can view own folio(_lines)" policies (in
-- 20260711180000_menu_and_orders.sql, already live, so fixed here rather
-- than edited in place) checked only stay ownership, not trust tier. Per
-- §4.4's capability matrix, the live bill is full-trust only, and post-stay
-- guests only get the read-only receipt view (§7.4) — `limited` tier was
-- never supposed to see the folio at all. Money-adjacent read access
-- getting the same tier discipline as the write paths already have
-- (place_charge_to_room_order, the requests INSERT policy) closes that gap.
drop policy "guest can view own folio" on folios;
create policy "guest can view own folio"
  on folios for select
  using (is_guest() and stay_id = guest_stay_id() and guest_tier() in ('full', 'post_stay'));

drop policy "guest can view own folio's lines" on folio_lines;
create policy "guest can view own folio's lines"
  on folio_lines for select
  using (
    is_guest()
    and guest_tier() in ('full', 'post_stay')
    and exists (select 1 from folios f where f.id = folio_lines.folio_id and f.stay_id = guest_stay_id())
  );
