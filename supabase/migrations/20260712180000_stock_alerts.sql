-- §8.3 "Stock alerts [P2]." `stock_quantity` is nullable — existing/new menu items don't have to
-- opt into quantity tracking, only the ones a kitchen actually wants alerted on. Reuses the
-- security_events "notify X" stub pattern already used for feedback escalation and late
-- activity cancellations, rather than inventing a new notifications table.

alter table menu_items add column stock_quantity integer;
alter table menu_items add column low_stock_threshold integer not null default 5;

create or replace function public.check_low_stock()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.stock_quantity is not null
     and new.stock_quantity <= new.low_stock_threshold
     and (old.stock_quantity is null or old.stock_quantity > new.low_stock_threshold) then
    insert into security_events (branch_id, event_type, metadata)
    values (new.branch_id, 'low_stock_alert', jsonb_build_object(
      'menu_item_id', new.id, 'name', new.name, 'stock_quantity', new.stock_quantity
    ));
  end if;
  return new;
end;
$$;

create trigger menu_items_check_low_stock
  after update of stock_quantity on menu_items
  for each row execute function public.check_low_stock();

-- §7.1 "Before Arrival [P2]" advance info (Wi-Fi, directions, house rules) — the part of that
-- section that doesn't depend on the reservation calendar [P3] or a payment-taking upsell flow.
-- Plain nullable text on `branches`, shown on the public /register/[token] pre-registration page
-- (already a service-role-only read, so no new RLS surface). Upsells (upgrade, airport pickup,
-- early check-in) are NOT built — they need real payment/inventory logic this session
-- deliberately isn't bolting onto a content page; see HANDOVER.md for the reasoning.
alter table branches add column wifi_info text;
alter table branches add column directions text;
alter table branches add column house_rules text;

-- Backfills the live Accra Pilot demo branch the same way 20260711150000 backfilled its code —
-- these three columns are nullable so this isn't required for schema correctness, but without it
-- the live project's /register/[token] page would show nothing here while the local demo does.
update branches set
  wifi_info = 'Network "AccraPilot-Guest", password on your room key card.',
  directions = 'Off the Spintex Road roundabout, look for the blue Stormglide sign.',
  house_rules = 'Check-out 11:00. No smoking indoors. Quiet hours 22:00-07:00.'
where name = 'Accra Pilot';
