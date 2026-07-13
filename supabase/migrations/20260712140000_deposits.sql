-- Deposits / incidental holds — DHOP_Build_Spec.md §9.1 [P2]: "collected as
-- a real charge at check-in and refunded at checkout (Paystack refund),
-- because MoMo has no card-style auth-hold. Spec'd now so the folio model
-- reserves space for it."
--
-- Staff-initiated, not guest self-service (unlike tips/pay-now orders) —
-- reception collects a deposit while checking a guest in, or any time
-- during the stay. Same self-authorizing-RPC shape as everywhere else money
-- is involved, just authorized via staff_branch_id() instead of
-- guest_stay_id()/guest_tier().

create table deposits (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  provider_ref text not null unique,
  state text not null default 'pending' check (state in ('pending', 'held', 'refunded', 'forfeited', 'failed')),
  amount_minor_units int not null check (amount_minor_units > 0),
  raw_payload jsonb,
  initiated_at timestamptz not null default now(),
  resolved_at timestamptz,
  refunded_at timestamptz,
  created_by_staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index deposits_stay_id_idx on deposits(stay_id);
create index deposits_branch_id_idx on deposits(branch_id);

create or replace function public.create_deposit(p_stay_id uuid, p_amount_minor_units int)
returns table (deposit_id uuid, provider_ref text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stay record;
  v_ref text;
  v_deposit_id uuid;
  v_staff_id uuid = staff_id();
begin
  if v_staff_id is null or staff_role_key() not in ('reception', 'branch_manager', 'owner') then
    raise exception 'not authorized';
  end if;
  if p_amount_minor_units is null or p_amount_minor_units <= 0 then
    raise exception 'invalid amount';
  end if;

  select id, branch_id into v_stay from stays where id = p_stay_id and state = 'active';
  if v_stay.id is null then
    raise exception 'stay not found or not active';
  end if;
  if v_stay.branch_id != staff_branch_id()
     and v_stay.branch_id not in (select id from branches where organization_id = staff_organization_id()) then
    raise exception 'not authorized for this branch';
  end if;

  v_ref = 'dhop_dep_' || replace(gen_random_uuid()::text, '-', '');
  insert into deposits (stay_id, branch_id, provider_ref, amount_minor_units, created_by_staff_id)
  values (p_stay_id, v_stay.branch_id, v_ref, p_amount_minor_units, v_staff_id)
  returning id into v_deposit_id;

  return query select v_deposit_id, v_ref;
end;
$$;

revoke execute on function public.create_deposit(uuid, int) from public, anon;
grant execute on function public.create_deposit(uuid, int) to authenticated;

-- pending -> held (the deposit is now sitting in the hotel's Paystack
-- account) or failed. Unlike orders/tips, success does NOT post a folio
-- line — a held deposit isn't a charge yet, it's a hold; it only becomes
-- real revenue if forfeited (see forfeit_deposit below).
create or replace function public.resolve_deposit_outcome(p_provider_ref text, p_outcome text, p_raw jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_deposit record;
begin
  if p_outcome not in ('success', 'failed') then
    raise exception 'invalid outcome %', p_outcome;
  end if;

  select * into v_deposit from deposits where provider_ref = p_provider_ref for update;
  if v_deposit.id is null then
    return 'unknown_reference';
  end if;
  if v_deposit.state != 'pending' then
    return 'already_resolved';
  end if;

  update deposits
  set state = case when p_outcome = 'success' then 'held' else 'failed' end,
      raw_payload = p_raw,
      resolved_at = now()
  where id = v_deposit.id;

  perform realtime.send(jsonb_build_object('id', v_deposit.id), 'deposit_updated', 'deposits:stay:' || v_deposit.stay_id::text, false);

  return case when p_outcome = 'success' then 'held' else 'failed' end;
end;
$$;

revoke execute on function public.resolve_deposit_outcome(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_deposit_outcome(text, text, jsonb) to service_role;

-- Staff action: keep some or all of a held deposit for damage etc. Posts a
-- folio charge for the forfeited amount — this is the one path where a
-- deposit actually becomes revenue. The Paystack side (the money already
-- sitting in the account) needs no further action; only a *refund* touches
-- Paystack, forfeiting just means "don't refund [this much of] it."
create or replace function public.forfeit_deposit(p_deposit_id uuid, p_amount_minor_units int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_deposit record;
  v_folio_id uuid;
begin
  if staff_id() is null or staff_role_key() not in ('branch_manager', 'owner') then
    raise exception 'not authorized';
  end if;

  select * into v_deposit from deposits where id = p_deposit_id and state = 'held' for update;
  if v_deposit.id is null then
    raise exception 'deposit not found or not held';
  end if;
  if p_amount_minor_units is null or p_amount_minor_units <= 0 or p_amount_minor_units > v_deposit.amount_minor_units then
    raise exception 'invalid forfeit amount';
  end if;

  update deposits set state = 'forfeited' where id = v_deposit.id;

  insert into folios (stay_id, branch_id) values (v_deposit.stay_id, v_deposit.branch_id)
  on conflict (stay_id) do nothing;
  select id into v_folio_id from folios where stay_id = v_deposit.stay_id;

  insert into folio_lines (folio_id, branch_id, source, description, amount_minor_units, settled)
  values (v_folio_id, v_deposit.branch_id, 'adjustment', coalesce(p_reason, 'Deposit forfeited'), p_amount_minor_units, true);

  insert into audit_log (branch_id, actor_staff_id, action, entity_type, entity_id, metadata)
  values (v_deposit.branch_id, staff_id(), 'deposit_forfeited', 'deposit', v_deposit.id,
          jsonb_build_object('amount_minor_units', p_amount_minor_units, 'reason', p_reason));
end;
$$;

revoke execute on function public.forfeit_deposit(uuid, int, text) from public, anon;
grant execute on function public.forfeit_deposit(uuid, int, text) to authenticated;

-- Marks a deposit refunded after the real Paystack refund call succeeds
-- (application code calls refundTransaction() first, then this) — same
-- split as resolve_payment_outcome's refund paths: this function only ever
-- touches our own database, never Paystack itself.
create or replace function public.mark_deposit_refunded(p_deposit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if staff_id() is null or staff_role_key() not in ('reception', 'branch_manager', 'owner') then
    raise exception 'not authorized';
  end if;

  update deposits set state = 'refunded', refunded_at = now()
  where id = p_deposit_id and state = 'held';
end;
$$;

revoke execute on function public.mark_deposit_refunded(uuid) from public, anon;
grant execute on function public.mark_deposit_refunded(uuid) to authenticated;

alter table deposits enable row level security;

create policy "guest can view own stay's deposits"
  on deposits for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "staff can view deposits in own branch scope"
  on deposits for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );
