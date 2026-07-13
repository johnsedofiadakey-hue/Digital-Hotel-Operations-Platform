-- Private-first feedback — DHOP_Build_Spec.md §7.4.
--
-- Another Phase 1 gap fix: "Feedback request immediately post-checkout:
-- private-first — unhappy feedback routes to the hotel and opens an
-- escalation; happy guests get nudged to Google/TripAdvisor [P3 for the
-- redirect automation, P1 for private feedback]." The redirect automation
-- itself is explicitly P3 and correctly not built; private feedback
-- collection is P1 and was missed earlier this session.

create table feedback (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now()
);

create index feedback_branch_id_idx on feedback(branch_id);

-- Third time this exact bug class has come up this session (requests in
-- Sprint 2, chat_messages just above) — branch_id is always derived from
-- the stay, never trusted from the client, for the same reason each time:
-- a guest client never has a legitimate reason to know or send it, and
-- trusting it would let a crafted insert claim a different hotel's
-- branch_id.
create or replace function public.set_feedback_branch_id()
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

create trigger feedback_set_branch_id
  before insert on feedback
  for each row
  execute function public.set_feedback_branch_id();

alter table feedback enable row level security;

-- §4.4: "View receipt, leave feedback" is full + post_stay, NOT limited.
create policy "guest can view own stay's feedback"
  on feedback for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "guest can leave feedback for own stay"
  on feedback for insert
  with check (
    is_guest()
    and stay_id = guest_stay_id()
    and guest_tier() in ('full', 'post_stay')
  );

create policy "staff can view feedback in own branch scope"
  on feedback for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

-- "Unhappy feedback... opens an escalation" — rating <= 3 logs the same
-- security_events "notify branch manager" stub used everywhere else this
-- session (force-close, SLA breaches, ...). Real push delivery still needs
-- FCM/Hubtel/Twilio credentials that don't exist.
create or replace function public.escalate_unhappy_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.rating <= 3 then
    insert into security_events (branch_id, event_type, metadata)
    values (new.branch_id, 'unhappy_feedback', jsonb_build_object('feedback_id', new.id, 'stay_id', new.stay_id, 'rating', new.rating));
  end if;
  return new;
end;
$$;

create trigger feedback_escalate_unhappy
  after insert on feedback
  for each row
  execute function public.escalate_unhappy_feedback();
