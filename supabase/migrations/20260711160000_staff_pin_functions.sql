-- Staff PIN tap-in (§5.1). PINs are bcrypt-hashed via pgcrypto (already
-- enabled) and checked/created through these two functions rather than raw
-- table access, so the plaintext PIN only ever touches Postgres, never a
-- comparison done in application code with the hash pulled out over the
-- wire. Both are restricted to service_role: PIN verification is a
-- pre-authentication step (there is no staff session yet to run it as), so
-- it has to run with elevated privileges, same reasoning as the guest scan
-- route using the service-role client to resolve a room_key.

create or replace function public.verify_staff_pin(p_branch_id uuid, p_pin text)
returns table (staff_id uuid, user_id uuid, name text, role_key text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.id, s.user_id, s.name, r.key
  from staff_pins sp
  join staff s on s.id = sp.staff_id
  join roles r on r.id = s.role_id
  where sp.branch_id = p_branch_id
    and sp.revoked_at is null
    and sp.pin_hash = crypt(p_pin, sp.pin_hash)
    and s.active
  limit 1
$$;

revoke execute on function public.verify_staff_pin(uuid, text) from public;
grant execute on function public.verify_staff_pin(uuid, text) to service_role;

-- Used by the (future, admin-web) staff-creation flow when setting a PIN.
-- Per-branch plaintext-uniqueness is checked in application code before
-- calling this (see the migration file's original comment on staff_pins) —
-- a hash collision check at the DB level is meaningless with bcrypt's random
-- salt.
create or replace function public.hash_staff_pin(p_pin text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select crypt(p_pin, gen_salt('bf'))
$$;

revoke execute on function public.hash_staff_pin(text) from public;
grant execute on function public.hash_staff_pin(text) to service_role;
