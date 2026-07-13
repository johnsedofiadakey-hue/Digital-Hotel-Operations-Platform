-- Fix: Sprint 1 tables had RLS policies but no table-level GRANTs, so every
-- role (including service_role) got "permission denied for table X" before
-- RLS was ever evaluated. Supabase's current default — auto_expose_new_tables
-- unset, both for `supabase start` locally and on the hosted platform —
-- stopped auto-granting privileges on new tables, which is the implicit
-- behavior this repo's original migration was relying on. RLS remains the
-- real access-control layer (§13); these grants just raise the ceiling RLS
-- operates under.
--
-- service_role gets ALL: Supabase provisions service_role with BYPASSRLS, so
-- table grants are the only thing standing between it and the data — every
-- server-side / Edge Function write in this system goes through it and needs
-- full access by design.
-- authenticated gets full CRUD: RLS policies already scope every row by
-- stay/branch/org, so the grant ceiling can be broad — this covers guests
-- (via the signed JWT's role='authenticated' claim, §14.5) and staff alike.
-- anon gets SELECT only: nothing in this system wants an unauthenticated
-- write, and every guest action is designed to carry the signed JWT
-- (role='authenticated') rather than rely on the anon key directly.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

-- Applies the same defaults to tables created by future migrations (Sprint
-- 2/3/...), so this doesn't have to be rediscovered and re-fixed every time.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
