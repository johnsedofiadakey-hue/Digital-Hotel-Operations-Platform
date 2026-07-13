-- Live chat, guest <-> reception/concierge — DHOP_Build_Spec.md §7.3.
--
-- This is a genuine Phase 1 gap fix, not new-scope creep: §7.3's "Live chat
-- with reception/concierge — one thread per stay" carries no [P2] tag
-- (unmarked = P1 per §7's own phase-tag legend), and was incorrectly
-- deferred earlier this session as "a later sprint." The WhatsApp-inbound
-- half of that same bullet *is* explicitly scoped in ("[P1 for inbound
-- WhatsApp channel]") but genuinely can't be built without Twilio
-- credentials, which don't exist (see HANDOVER.md) — only that specific
-- channel is stubbed, not the core in-app thread.

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  sender_type text not null check (sender_type in ('guest', 'staff')),
  sender_staff_id uuid references staff(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index chat_messages_stay_id_idx on chat_messages(stay_id);
create index chat_messages_branch_id_idx on chat_messages(branch_id);

-- Same bug class as requests (§8.1, Sprint 2) caught the same way — a
-- guest's own client never supplies branch_id, and trusting it from the
-- client at all would let a crafted insert spoof a different hotel's
-- branch_id. Derived authoritatively from the stay, always, regardless of
-- caller (guest or staff — a staff client already sends the right
-- branch_id via its own RLS check, but deriving it here too costs nothing
-- and removes any chance of it ever drifting from the stay's real branch).
create or replace function public.set_chat_message_branch_id()
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

create trigger chat_messages_set_branch_id
  before insert on chat_messages
  for each row
  execute function public.set_chat_message_branch_id();

-- Mirrors staff_branch_id()/staff_organization_id()/staff_role_key() —
-- needed here so the staff INSERT policy can pin sender_staff_id to the
-- actual authenticated staff member, not trust whatever the client sends.
create or replace function public.staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from staff where user_id = auth.uid() and active limit 1
$$;

alter table chat_messages enable row level security;

-- §4.4: chat is available at full and limited trust, not post_stay.
create policy "guest can view own stay's chat"
  on chat_messages for select
  using (is_guest() and stay_id = guest_stay_id());

create policy "guest can send chat messages for own stay"
  on chat_messages for insert
  with check (
    is_guest()
    and stay_id = guest_stay_id()
    and guest_tier() in ('full', 'limited')
    and sender_type = 'guest'
    and sender_staff_id is null
  );

create policy "staff can view chat in own branch scope"
  on chat_messages for select
  using (
    branch_id = staff_branch_id()
    or branch_id in (select id from branches where organization_id = staff_organization_id())
  );

create policy "staff can send chat messages in own branch scope"
  on chat_messages for insert
  with check (
    (branch_id = staff_branch_id()
     or branch_id in (select id from branches where organization_id = staff_organization_id()))
    and sender_type = 'staff'
    and sender_staff_id = staff_id()
  );

-- Realtime (§14.4, §4b — Broadcast from Database, not postgres_changes).
create or replace function public.broadcast_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id), 'chat_message', 'chat:stay:' || new.stay_id::text, false);
  perform realtime.send(jsonb_build_object('id', new.id, 'stay_id', new.stay_id), 'chat_message', 'chat:branch:' || new.branch_id::text, false);
  return new;
end;
$$;

create trigger chat_messages_broadcast
  after insert on chat_messages
  for each row
  execute function public.broadcast_chat_message();
