-- Guest ID uploads — DHOP_Build_Spec.md §13 [P2]: "Supabase Storage,
-- Reception-role-only access, every access logged, auto-deleted 30 days
-- post-checkout (configurable)."
--
-- "Every access logged" is enforced structurally, not by convention: there
-- is deliberately NO storage.objects SELECT policy for staff at all. A
-- guest can only INSERT (upload) their own file; nobody can directly
-- download it. Staff access goes exclusively through a server route that
-- writes a `guest_id_access_log` row first, then asks the service-role
-- client (which bypasses Storage RLS entirely) for a short-lived signed
-- URL. There is no path from the client straight to the file — the log
-- can't be bypassed the way a client-enforced "please log this" convention
-- could be.

insert into storage.buckets (id, name, public) values ('guest-ids', 'guest-ids', false);

create table guest_id_uploads (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

create index guest_id_uploads_stay_id_idx on guest_id_uploads(stay_id);

create or replace function public.set_guest_id_upload_branch_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select branch_id into new.branch_id from stays where id = new.stay_id;
  return new;
end;
$$;

create trigger guest_id_uploads_set_branch_id
  before insert on guest_id_uploads
  for each row
  execute function public.set_guest_id_upload_branch_id();

-- "Every access logged" — written by the server route immediately before
-- it generates a signed URL, never by the client.
create table guest_id_access_log (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references guest_id_uploads(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete restrict,
  accessed_at timestamptz not null default now()
);

alter table guest_id_uploads enable row level security;
alter table guest_id_access_log enable row level security;

-- No guest SELECT policy — a guest can see that they uploaded something
-- (the row exists client-side right after their own insert succeeds) but
-- there's no reason for them to list/re-view it later; the physical
-- document is still in their hand.
create policy "guest can record own stay's id upload"
  on guest_id_uploads for insert
  with check (is_guest() and stay_id = guest_stay_id() and guest_tier() = 'full');

-- Reception-role-only, per spec wording ("Reception-role-only access") —
-- deliberately narrower than the usual "any staff in branch scope" pattern
-- used everywhere else, matching how sensitive ID documents are.
create policy "reception can view id upload metadata in own branch"
  on guest_id_uploads for select
  using (
    staff_role_key() in ('reception', 'branch_manager', 'owner')
    and (branch_id = staff_branch_id()
         or branch_id in (select id from branches where organization_id = staff_organization_id()))
  );

create policy "reception can view own branch's id access log"
  on guest_id_access_log for select
  using (
    staff_role_key() in ('reception', 'branch_manager', 'owner')
    and exists (
      select 1 from guest_id_uploads u
      where u.id = guest_id_access_log.upload_id
        and (u.branch_id = staff_branch_id()
             or u.branch_id in (select id from branches where organization_id = staff_organization_id()))
    )
  );

-- No storage.objects SELECT policy for anyone but the (RLS-bypassing)
-- service role — see the migration comment at the top.
create policy "guest can upload own stay's id document"
  on storage.objects for insert
  with check (
    bucket_id = 'guest-ids'
    and is_guest()
    and guest_tier() = 'full'
    and (storage.foldername(name))[1] = guest_stay_id()::text
  );

-- Extends the retention-purge job (20260711200000_ops_hardening.sql,
-- already live) to also cover ID documents' 30-day-post-checkout window
-- (§13's retention table). Only removes the metadata/log rows here — the
-- underlying Storage object itself is NOT deleted by this function (pg_net
-- calling Storage's REST DELETE endpoint, or a dedicated Edge Function,
-- would be needed for that, and neither exists yet — see HANDOVER.md).
-- Redefining retention_purge() here (create or replace) rather than only
-- adding a new function, since it's the single daily job everything else
-- in this list already runs from — a second independently-scheduled
-- purge job for just this one table would be duplicate cron machinery
-- for no real benefit.
create or replace function public.retention_purge()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from audit_log where created_at < now() - interval '2 years';
  delete from security_events where created_at < now() - interval '1 year';

  update stays
  set last_names = '{}', phone = null
  where state in ('checked_out', 'force_closed')
    and closed_at < now() - interval '12 months'
    and (last_names != '{}' or phone is not null);

  delete from folio_lines where posted_at < now() - interval '6 years';
  delete from payments where created_at < now() - interval '6 years';

  -- ID documents: 30 days post-checkout (§13). Metadata/log rows only —
  -- see this migration's header comment on the Storage-object gap.
  delete from guest_id_uploads
  where stay_id in (
    select id from stays
    where state in ('checked_out', 'force_closed')
      and closed_at < now() - interval '30 days'
  );
end;
$$;
