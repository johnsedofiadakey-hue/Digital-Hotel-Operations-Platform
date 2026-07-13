# DHOP — Handover Note

**Read this first, before touching anything else.** This file exists so a fresh Claude Code
session (or any new contributor) can pick up exactly where the last session left off without
re-deriving context. Update it at the end of every work session — stale handover notes are
worse than none.

Last updated: 2026-07-12, end of a session that first carried this project through **every
Phase 1 sprint in DHOP_Build_Spec.md §15** (scaffolding + guest-auth + Vercel/Supabase infra +
staff-PIN-auth + check-in + Sprint 2 + Sprint 3 + Sprint 4 + Sprint 5), then continued into
**Phase 2 and finished it**: three items that turned out to be unmarked-P1 gaps rather than true
Phase 2 scope (live chat, private feedback, language switcher), followed by every genuine `[P2]`
item this spec calls for — tipping, lost-item reporting, incidental deposits/holds, guest ID
uploads, activities & facilities booking (§10, including a transactional double-booking claim
verified under real concurrency), and guest profile memory + reservation entry + contactless
pre-registration (§13/§17/§7.2). All sixteen post-Phase-1 migrations are built, locally verified,
and pushed to the live project — see §5 items 17-20 for the full per-feature writeup and exactly
what "locally verified" meant for each one. Sprints 1-3's exit tests all pass, locally verified.
Sprint 4's logic passes every testable row of its own exit test, with one honest caveat (§4c).
Sprint 5 is built and its own logic verified the same way, but §15's actual "pilot-readiness
checklist" contains items no coding session can finish — see §4d for exactly what that means and
what's genuinely left. Sprint 1: "scan a room QR and land in a full session; scan a vacant room
and get outcome B; check-in upgrades the open page live." Sprint 2: "guest requests towels on one
phone; housekeeping tablet chimes, claims, completes; guest sees it live; room status flips
propagate to two devices at once." Sprint 3: "order placed → kitchen chime → delivered → line
visible on live bill; toggle an item sold-out and watch it vanish from an open guest menu."
Sprint 4 (§9.2): "every row of the §9.2 table exercised against Paystack test mode, including the
double-payment and late-success rows" — every row's *logic* is exercised and passes (see §4c for
exactly how, given there are no Paystack credentials anywhere in this project), but "against
Paystack test mode" specifically has never literally happened.

**Nothing is "still open" from the Phase 2 scope this session tracked** — the only genuinely
unbuilt things are `admin-web` (never touched, any phase) and P3-tagged items the spec itself
says not to build early. See §5 item 21 for the exact list.

**Read §4b before writing anything that needs live updates** — this session discovered that
this Supabase build's Realtime `postgres_changes` doesn't actually deliver events locally (it
reports `SUBSCRIBED` and does nothing else), so everything live in this codebase uses
"Broadcast from Database" instead. Building another live feature the `postgres_changes` way
will silently not work.

---

## 1. What DHOP Is (Project Goals)

**Digital Hotel Operations Platform** — a B2B SaaS operations system for hotels, guesthouses,
and restaurants in Ghana/West Africa, replacing the WhatsApp-and-phone-calls chaos most
independent properties run on today with one shared live system.

**Core thesis:** Reception, Kitchen, Housekeeping, and Maintenance all read and write the same
live board (via Supabase Realtime) instead of calling each other. Guests get password-free,
app-free access via QR code. Payments are MoMo-first (Paystack), because that's the actual
Ghanaian market, not an afterthought bolted onto a Western product.

**Strategic framing (per project CLAUDE.md):** B2B SaaS, Blue Ocean strategy — win on an
underserved segment (independent Ghanaian hotels with no PMS today) rather than competing
head-on with global hotel-tech incumbents built for a different market.

**Commercial model:** 4 tiers (Order / Essentials / Growth / Enterprise), split by operational
complexity, not just room count. Full reasoning in the spec, §12.

**Non-negotiable product principles** (violating these means re-reading the spec, not
improvising):
1. Guest login must stay password-free and app-free. Every friction point costs adoption.
2. The **stay**, not the room or the individual guest, is the atom of identity. Sessions,
   folio, and chat all bind to `stay_id` — this is what makes room moves, extensions, and
   back-to-back turnovers "just work" instead of needing special-case code.
3. Nothing that touches money is reachable without full trust (QR possession). This is the
   whole fraud-prevention model — see spec §4.4.
4. RLS on every table, no exceptions. A bug in application code must be structurally incapable
   of leaking one hotel's data into another's.

**Full product & technical spec:** [`DHOP_Build_Spec.md`](./DHOP_Build_Spec.md) — this is the
source of truth for every product decision, flow, and architectural choice. It supersedes the
older `DHOP_Product_Roadmap.md` reference doc (not in this repo) wherever they'd disagree.
**Read the whole thing before writing product code** — it's dense on purpose; every section
exists because an earlier draft had a hole that got audited out. Sections you'll return to most:
§3 (stay lifecycle), §4 (guest auth — the trickiest part of the whole system), §9.2 (MoMo
payment outcome matrix), §15 (sprint-by-sprint build order with exit tests).

---

## 2. Decisions Already Locked (Do Not Relitigate)

| Decision | Choice | Why |
|---|---|---|
| Payments | Paystack | Ghana MoMo coverage + cards in one integration |
| Staff apps | PWA only, no native | Half the build/maintenance surface, no app store delay |
| Guest identity unit | The stay (not room, not individual guest) | Survives room moves/extensions without special-casing |
| Guest auth | Possession-based, tiered trust (`full`/`limited`/`post_stay`) | Kills charge-to-someone-else's-room fraud at zero friction |
| Firebase | FCM push only, nothing else | Supabase covers DB/auth/realtime/storage; no reason to run two backends |
| Backend | Supabase (Postgres/Auth/Realtime/Storage/Edge Functions), EU region | Managed services, no servers to patch |
| Frontend | Next.js × 3 apps in one Turborepo monorepo | Shared types/components, one deploy pipeline per app |
| Package manager | npm | Only one available in the dev environment when this was scaffolded; no strong reason to switch |

---

## 3. Infrastructure — Current Live State

### GitHub
- Repo: `https://github.com/johnsedofiadakey-hue/Digital-Hotel-Operations-Platform`
- **Visibility: PUBLIC.** This was flagged and left unanswered by the project owner —
  **ask before assuming this is fine.** A commercial product's source sitting public may or
  may not be intentional.
- Branch: `main`, one commit so far (initial scaffold).
- Local repo is already `git remote add origin`'d and pushes work.

### Supabase
- Project name: **DHOP**, org **stormglide.io**, plan **Free tier**.
- Project ref: `qahuskhvuhbuujsaljtt`, region `eu-west-3` (West EU / Paris).
- Dashboard: `https://supabase.com/dashboard/project/qahuskhvuhbuujsaljtt`
- **Free tier pauses the project after a week of inactivity** — if `supabase db push
  --dry-run` starts failing to connect, this is the first thing to check (resume it from the
  dashboard).
- Migration `supabase/migrations/20260711130301_initial_schema.sql` is **applied** to this
  live project. `supabase/seed.sql` is **applied** too (demo hotel — see §4 below).
- To apply future migrations: write the new `supabase/migrations/<timestamp>_*.sql` file,
  then `npx supabase db push --db-url "$DIRECT_URL" --include-all --dry-run` first, review
  the diff, **then** run it again without `--dry-run`. Never skip the dry-run against this
  project — it's the real one, not a throwaway.

### Vercel
- **Confirmed and set up** (2026-07-11). Account: `John Dakey's projects` (Hobby plan), same
  GitHub login as the repo owner. **Three separate Vercel projects, one per app** — this is
  required for a Turborepo monorepo (Vercel's "Root Directory" picker explicitly says: "For
  monorepos, create a separate project for each directory you want to deploy"), not a mistake:
  - `dhop-guest-web` → root directory `apps/guest-web` → https://dhop-guest-web.vercel.app
  - `dhop-admin-web` → root directory `apps/admin-web` → https://dhop-admin-web.vercel.app
  - `dhop-staff-pwa` → root directory `apps/staff-pwa` → https://dhop-staff-pwa.vercel.app
- All three are connected to the GitHub repo's `main` branch — every push to `main` triggers a
  deploy on all three automatically. All three deployed successfully on first push and are
  currently showing the generic Turborepo starter page (expected — no DHOP UI built yet).
- **No environment variables configured on any of the three projects yet.** Once the Supabase
  keys below are collected, they need to be added to **all three** Vercel projects (Project →
  Settings → Environment Variables), not just the local `.env.local` files, or deploys will
  build fine (nothing references them yet) but break the moment guest-web's scan route ships.
- To add another app or recreate a project: `vercel.com/new` → Import
  `Digital-Hotel-Operations-Platform` → the Root Directory picker defaults to whatever
  directory wasn't picked yet if you've already imported once this session — always double
  check it before naming/deploying (see the Vercel UI note in §7, this cost real time).

### Environment variables
- `.env.example` (committed, no real values) documents every var needed across all sprints.
- `.env.local` exists at the repo root **and** inside each of `apps/guest-web`,
  `apps/staff-pwa`, `apps/admin-web` (Next.js only auto-loads its own app-directory env file,
  hence the duplication — all four are gitignored, none are in the repo).
- Currently populated: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `DATABASE_URL`, `DIRECT_URL`.
- **Still missing: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET`.** These are the
  single biggest blocker to running anything against the live project — the guest-session
  JWT-minting logic (§4, §5) is built and locally verified, but has never touched the real
  Supabase instance. Get `service_role` from Supabase Dashboard → Settings → API (legacy tab)
  → `service_role` `secret`, and the JWT secret from Settings → JWT Keys. **Never** prefix
  either with `NEXT_PUBLIC_` — that would ship them to the browser and defeat RLS entirely.
  Once obtained: fill into all four local `.env.local` files **and** all three Vercel projects'
  environment variable settings (see Vercel note above — easy to do one and forget the other).
- Paystack, FCM, Hubtel, WhatsApp/Twilio keys: not needed until Sprint 4/5, not yet collected.

---

## 4a. Critical Bug Found + Fixed (2026-07-11 session 2) — READ BEFORE TOUCHING DB

The Sprint 1 migration enabled RLS and wrote policies on every table, but **never issued
table-level `GRANT` statements**. Supabase's current default — `auto_expose_new_tables`
unset, true both for `supabase start` locally and for newly-created hosted projects — no
longer auto-grants privileges on new tables the way it used to. Result: `anon`,
`authenticated`, and **`service_role`** all got `permission denied for table X` on every
single table, before RLS was ever evaluated. This affects the **live project identically** —
confirmed by running a local Supabase instance (Docker) from scratch off the same migration
and hitting the exact same error.

- Fix migration: `supabase/migrations/20260711140000_grant_table_privileges.sql`. Grants
  `service_role` full access (it's provisioned with `BYPASSRLS`, so grants are the only real
  gate on it), `authenticated` full CRUD (RLS already scopes every row — this is guests via
  the signed JWT's `role='authenticated'` claim, and staff), `anon` `SELECT` only. Also adds
  `ALTER DEFAULT PRIVILEGES` so tables created by *future* migrations (Sprint 2/3/...) don't
  hit this same bug silently.
- **Verified against a local Supabase instance** (`supabase start`, Docker required — was
  available this session): reset local DB, confirmed `permission denied` before the fix,
  confirmed it resolves after. Then ran `apps/guest-web` locally against the local stack
  (local-only test keys, not the live project's) and exercised the full scan pipeline below —
  all outcomes behaved correctly, including a real RLS-gated read of a guest's own stay row.
- **Dry-run against the live project passed clean** (`supabase db push --dry-run`) — only this
  one migration is pending. **Not yet pushed for real** — needs your explicit go-ahead per the
  standing rule in §7 below (never push to this project without a dry-run + confirmation in
  the same turn, no exceptions even though this is "just" a grants fix).

## 4b. Realtime: `postgres_changes` Doesn't Work Here — Use Broadcast From Database

Discovered building Sprint 2's live request queue / room board. The plan was standard Supabase:
subscribe to `postgres_changes` on `requests`/`rooms` (added to the `supabase_realtime`
publication, confirmed present via `pg_publication_tables`), let RLS gate delivery per
subscriber. **It doesn't work on this Supabase build** — a client subscribes, the server
replies `SUBSCRIBED`, and then nothing is ever delivered, no matter how long you wait, with no
error anywhere. Confirmed via `realtime.subscription` (stayed empty — the registration never
even lands) and via container logs: `supabase_realtime_DHOP` only ever starts "replication for
Broadcast Changes" (`supabase_realtime_messages_replication_slot_` /
`supabase_realtime_messages_publication`) — never a WAL2JSON stream for the public-schema
tables the CDC path would need. This looks like a real gap in this CLI/image version's local
Realtime setup, not a filter-syntax or RLS mistake (tested with zero filters and the
service-role token directly — still nothing).

**What works, confirmed by testing**: "Broadcast from Database" — `realtime.send(payload
jsonb, event text, topic text, private boolean)`, called from a Postgres trigger (or, for the
Sprint 1 check-in live-upgrade, from a one-shot REST call to `/realtime/v1/api/broadcast`,
`packages/shared/src/realtime-broadcast.ts`). Every live feature in this codebase uses this
pattern now: a trigger (`requests_broadcast_change`, `rooms_broadcast_status_change` in
`20260711170000_requests.sql`) sends a **content-free** broadcast (just the row id — never the
row data itself, so nothing ever bypasses RLS at the transport level) to a topic like
`requests:branch:{branch_id}` or `rooms:branch:{branch_id}`; the client's `.on("broadcast", ...)`
handler re-reads through its own RLS-scoped connection on receipt. `private => false` on all of
these — the topic name embeds an unguessable UUID and the payload carries nothing sensitive,
same trust level as the check-in broadcast already established in Sprint 1.

**If you build another live feature**: use this same pattern (trigger + `realtime.send` +
client re-fetch on broadcast), not `postgres_changes`. If you want to re-test whether
`postgres_changes` works on a *future* CLI/image version before assuming this gap persists: the
fastest check is `realtime.subscription` staying empty after a client reports `SUBSCRIBED` — if
rows start appearing there, it's fixed upstream.

## 4c. Sprint 4 (Payments) — What "Locally Verified" Actually Means Here

Be precise about this with whoever reads it next: **no Paystack account, sandbox or otherwise,
has ever existed for this project.** `PAYSTACK_SECRET_KEY` is empty everywhere (§3, §6). Every
piece of Sprint 4 is written strictly against Paystack's publicly documented REST contract
(`packages/shared/src/paystack.ts` — Charge, Verify, Refund, HMAC-SHA512 webhook signatures),
and verified two different ways that don't require real credentials:

1. **The business logic** (idempotency, the outcome matrix's branching, the atomic
   multi-table writes) — tested by calling the Postgres RPCs directly with a simulated guest
   JWT (`set_config('request.jwt.claims', ...)`), exactly the same technique used for every
   other RPC this session. This is the part that matters most and it's thoroughly exercised —
   see the table below.
2. **The HTTP plumbing** (signature verification, payload parsing, routing a
   resolve-outcome result to a real-or-simulated Paystack refund call) — tested by running
   `apps/guest-web`'s dev server and POSTing self-signed synthetic webhooks (Node's
   `crypto.createHmac('sha512', fakeKey)`, matching exactly what Paystack's real signing
   scheme does) to `/api/paystack/webhook`. This confirmed signature verification accepts a
   valid signature and rejects a bogus one, and that a genuine outbound call to
   `https://api.paystack.co` happens for the refund path — Paystack's real server replied with
   a real, correctly-shaped `"Invalid key"` error (confirming the request itself — endpoint,
   auth header, JSON body — is well-formed per their contract), not a malformed-request error
   that would indicate a bug in `paystack.ts` itself.

**What this does NOT verify**: that a real charge can actually be initiated, that a real MoMo
prompt reaches a real phone, that Paystack's real webhook delivery reaches this app once
deployed, or that the refund API call succeeds with a real key. All of that needs a live
account (test mode is fine — `sk_test_...`) and a deployed, publicly-reachable webhook URL.
**Testing this for real is the very first thing to do once Paystack credentials exist.**

Every row of §9.2's outcome table, confirmed via method (1) above:

| Outcome | Confirmed via |
|---|---|
| Approved | `resolve_payment_outcome(ref, 'success', ...)` → `'fulfilled'`, order `paid`, folio line posted `settled=true` |
| Webhook delayed/lost (idempotent re-delivery) | Same call twice → `'already_resolved'` the second time, exactly one folio line |
| Declined | `resolve_payment_outcome(ref, 'failed', ...)` → `'declined'`, order `failed`; `retry_order_payment()` then a fresh success → `'fulfilled'` |
| Guest abandons (15 min timeout) | Backdated `payments.initiated_at`, ran `expire_stale_pending_payments()` → payment `failed`, order `payment_state='failed'`, `kitchen_state='cancelled'` |
| **Late success** | A success signal for a reference `expire_stale_pending_payments()` already gave up on → `'refund_late_success'`, payment `refunded`, `audit_log` entry. **This one had a real bug**, see below. |
| Double payment | `retry_order_payment()` called *before* either attempt resolves (the real-world sequencing — a guest impatiently retrying, not retrying after success, which the RPC correctly refuses), then both succeed → first `'fulfilled'`, second `'refund_double_payment'`, exactly one folio line |
| Refund needed (kitchen cancel) | **Not built** — tied to order cancellation, which was already out of scope as of Sprint 3 (see §5) |

**A real bug this testing caught**: the first version of `resolve_payment_outcome`'s
idempotency guard was `if payment.state != 'pending' then return 'already_resolved'` — too
coarse. Once `expire_stale_pending_payments()` marks a payment `failed`, that guard swallowed a
*later* `'success'` signal for the same reference as an ordinary duplicate, when it's actually
the late-success row and needs to trigger a refund. Fixed by narrowing the guard to only
short-circuit on an exact repeat of the *same* outcome, or a payment already in a truly
terminal state (`success`/`refunded`) — not "any state that isn't `pending`." Worth remembering
if this function is ever touched again: idempotency guards need to distinguish "duplicate
signal" from "a different, still-meaningful signal for a reference we'd already moved on from."

**A second bug, in the route layer, not the RPC**: `pay-now/route.ts` originally left an order
in `pending` forever if Paystack's charge-initiation call itself failed synchronously (bad
phone number, provider outage) — no async process had started, so nothing was ever going to
resolve it. Fixed by calling `resolve_payment_outcome(ref, 'failed', ...)` immediately when
`charge.ok` is false, and the client (`MenuBrowser.tsx`) now checks `chargeOk` before showing
the "waiting for confirmation" screen instead of showing it and waiting for the first poll to
correct itself 30 seconds later.

## 4d. Sprint 5 — What's Real, What Physically Can't Be "Finished" Here

Sprint 5's own exit line in §15 is "pilot-readiness checklist below," and that checklist (§15,
end) is worth reading literally: *"3-second 3G first load hit on a real budget Android · all
§4.3 outcomes demoed · force-close guard demoed · a full day's simulated service (20 orders, 15
requests) with zero lost events across a deliberate Wi-Fi cut · Paystack live keys + one real
GHS 1 MoMo transaction round-tripped incl. refund · reception 60-second check-in achieved by a
non-technical tester · tent cards printed for every pilot room."* Several of those are physical
or human actions — a real Android phone, a real printed card, a real non-technical person at a
real desk, real money moving through a real Paystack account. No amount of coding closes those;
they're the project owner's to do, not a gap in what got built. What follows is what a coding
session *can* finish, and it is finished:

- **SLA monitor** (§8.1) — `sla_sweep()`, another `pg_cron` job (pattern established in Sprint
  4), fires every minute. Housekeeping: 15 min to claim, 45 min to complete. Maintenance: 30
  min to claim (15 if `urgent`). Laundry: 30 min to claim. Breach 1 logs to `security_events`
  (the department-manager-notify stub); still unresolved at 2× the window logs a second,
  escalated event (branch-manager-notify stub). Per-branch configurability isn't built — no
  settings table exists for it — the spec's own stated defaults are hardcoded.
  **Locally verified**: backdated a housekeeping request past 15 min → breach 1 fires exactly
  once; past 30 min → breach 2 (escalated) fires; re-running the sweep after both have already
  fired does not double-log either one.
- **Retention purge** (§13) — `retention_purge()`, `pg_cron` daily at 03:00. `audit_log` 2
  years, `security_events` 1 year, a checked-out/force-closed stay's `last_names`/`phone`
  anonymized 12 months after `closed_at` (the stay row itself survives — folio/order history
  still needs it), `folio_lines`/`payments` 6 years. Chat-thread and ID-document retention
  rules from the same §13 table are **not** in this job — neither feature exists yet, and per
  the spec's own reasoning for shipping this job early ("retrofitting retention onto live data
  is miserable"), those two rules belong in whichever migration eventually adds those tables,
  not pre-written against tables that don't exist. **Locally verified**: seeded rows on both
  sides of each cutoff, ran the purge once, confirmed only the old side was gone/anonymized.
- **Session-expiry sweep** — `expire_stale_guest_sessions()`, every 15 minutes, revokes
  `guest_sessions` whose stay has been over (`checkout_due` or `closed_at`) for a day-plus.
  Genuinely new this sprint, not previously built — §4.6's live expiry computation was already
  correct without it, this is just the cleanup pass so a guest's "connected devices" list
  doesn't accumulate rows forever.
- **Branch manager dashboard** (`apps/staff-pwa/app/reports`) — occupancy %, open request
  count, 7-day average time-to-claim and time-to-complete, request volume. A snapshot on page
  load, not live — this is an occasional manager check, not a tablet anyone stares at (the room
  board and request pool already are, via §4b's pattern). `branch_manager`/`owner` only,
  matching §5.5.
- **Audit log surfacing** (`apps/staff-pwa/app/audit-log`) — the `audit_log` and
  `security_events` tables have existed since Sprint 1 with the right RLS, but nothing
  displayed them until now. Same role gate as reports. **Both pages locally verified** rendering
  real data (occupancy from seeded rooms, a genuine audit entry from PIN tap-in, plus the
  retention-purge test's own rows) through the actual HTTP routes.
- **Notification fanout routing table** (`packages/shared/src/notifications.ts`) —
  `NOTIFICATION_ROUTING`, a direct data-code mapping of §11's event/recipient/channel table,
  plus a `pickGuestChannel()` helper for the "WhatsApp over SMS when both exist" rule. This is
  the reference for whoever wires up real FCM/Hubtel/Twilio senders later — it does **not**
  replace or rewire the `security_events`/`audit_log` "notify X" stubs already scattered through
  every "notify branch manager" touchpoint built across this session (force-close, SLA
  breaches, second-device lockouts, ...). Rewiring all of those through one central dispatcher
  would have meant re-touching many already-tested files for no functional gain while FCM/SMS/
  WhatsApp credentials don't exist to actually send anything — deliberately left as a documented
  follow-up, not silently dropped.
- **Offline queue for the staff PWA** (§12) — `apps/staff-pwa/lib/offline-queue.ts`
  (IndexedDB, no library), wired into exactly the three actions §12 names as examples: room
  status changes (`RoomBoard.tsx`, "mark clean"), and request claim/complete
  (`RequestPool.tsx`, "claim request"/"close ticket"). `executeOrQueue()` tries the write,
  falls back to the local queue on failure, updates the UI optimistically either way, and skips
  the immediate refetch when queued (refetching would silently overwrite the optimistic update
  with stale server state — caught by re-reading the code, not by a live browser test — see
  below). `replayQueue()` fires on reconnect and via a `useOfflineSync()` hook every component
  can share. **Not built**: the "flag semantically dangerous conflicts to a department manager
  instead of silently resolving" half of §12's conflict rule — detecting *which* conflicts are
  dangerous (the spec's own example: a room marked clean offline while a new stay already
  activated on it) needs a notion of "conflicting write" the current schema has no way to
  express, so plain last-write-wins is what actually ships.
  **Important honesty note, not a caveat to skim past**: this was verified by type-checking,
  linting, a full production build, and a careful line-by-line logic re-read (which is exactly
  how the refetch-stomps-optimistic-update bug above got caught before it shipped) — but
  **never against a real browser's IndexedDB or a real offline/online transition**. That needs
  browser automation (`claude-in-chrome`) or a human clicking "offline" in devtools, neither of
  which happened this session. This is a materially weaker verification bar than everything
  else in this document, which is why it's called out this explicitly rather than folded into
  the same "locally verified" language used everywhere else.
- **Rate limiting** — no new work this sprint. Already covered by Sprint 1/2's second-device
  flow (5 attempts/15 min, per IP and per room) and staff PIN tap-in (5 attempts/5 min, per
  tablet). Nothing in §12 or elsewhere asks for additional general-purpose API rate limiting
  beyond those two guest-auth abuse surfaces, so nothing more was built.

## 4. What's Actually Built (Verified Working)

- Turborepo monorepo scaffolded: `apps/guest-web` (port 3000), `apps/staff-pwa` (port 3001),
  `apps/admin-web` (port 3002). `guest-web` and `staff-pwa` now have real DHOP-specific auth
  flows (below) — **`admin-web` is still the generic create-turbo starter page, untouched.**
- `packages/shared` (`@repo/shared`): TypeScript types for every core entity (`Stay`, `Room`,
  `GuestSession`, `Order`, etc. — see `src/types.ts`), state-machine transition tables for
  stay/room-status/request/order lifecycles with a `canTransition()` guard (`src/state-
  machines.ts`), and Supabase client factories split by trust level — `createAnonClient`,
  `createStaffClient`, `createServiceRoleClient` (`src/supabase.ts`, server-only client is
  clearly commented as such).
- Full Sprint 1 database schema, live on the real Supabase project (not just local):
  `organizations`, `branches`, `room_categories`, `rooms`, `roles` (10 seeded), `staff`,
  `staff_pins`, `stays`, `guest_sessions`, `audit_log`, `security_events`. RLS enabled on
  every table. The §3.2 check-in guard (a room can never have two active stays) is enforced as
  an actual database constraint: `create unique index one_active_stay_per_room on
  stays(room_id) where state = 'active'` — not just application logic.
- Guest-facing RLS policies are built around a **custom-signed JWT** approach (guests are
  never Supabase Auth users — see the big comment block at the top of the migration file for
  the full reasoning): a JWT with claims `app_role='guest'`, `stay_id`, `tier`, signed with the
  project's JWT secret, verified by PostgREST exactly like a normal Auth token.
- Demo/seed data applied: organization "Stormglide Demo Hotels", branch "Accra Pilot" (code
  `ACCRA`), 2 room categories (Standard, Deluxe Suite), 5 rooms (101–103, 201–202), one
  **active** stay on room 101 (guest last name "Mensah") — room 102 is deliberately left vacant
  to test the "outcome B" no-active-stay scan flow, room 202 is `out_of_order`. Room 101's
  `room_key` is fixed (`demo0000000000000000000000101a`) so it's a stable URL to test against
  instead of querying the DB for a random key every time. See `supabase/seed.sql`. Note: room
  101's seeded active stay means a fresh `supabase db reset` starts with room 101 occupied —
  if you've been testing check-in/force-close locally, re-run `db reset` to get back to this
  baseline rather than assuming room 101 is still free.
- `npm install` works clean, `npm run check-types` and `npm run lint` pass across all packages
  with zero warnings, no build errors.
- Next.js pinned to `^16.2.10` in every app (bumped from the `create-turbo` default `16.2.0`,
  which had a **high-severity** DoS advisory — see `npm audit` if this ever regresses).
- **Guest QR-scan auth end-to-end (§4.3, all six outcomes A–F), locally verified working:**
  - `packages/shared/src/jwt.ts` — signs/verifies the guest session JWT (HS256, custom claims
    `app_role='guest'`, `stay_id`, `tier`, plus `role='authenticated'` so PostgREST picks the
    right Postgres role).
  - `packages/shared/src/scan-outcome.ts` — pure, unit-testable resolver for outcomes A–F.
  - `packages/shared/src/supabase.ts` — added `createGuestClient()`, which attaches the signed
    JWT as a bearer header so PostgREST evaluates RLS against it (guests never get a real
    Supabase Auth session, per §14.5).
  - `apps/guest-web/app/r/[room_key]/route.ts` — the scan entry point. Service-role room
    lookup → resolves outcome → mints/sets the session cookie (A), logs a `security_events` row
    and redirects (C/D), gates on `device_cap` (E), downgrades an existing session to
    `post_stay` (F), or drops a short-lived room-id cookie for the notify-reception tap (B).
  - Six destination pages: `/portal`, `/vacant` (+ `/vacant/notify`, logs an `audit_log` row —
    full reception task routing waits on the Sprint 2 `requests` table), `/out-of-order`,
    `/invalid`, `/device-limit`, `/post-stay`.
  - **Verified locally** (Docker + `supabase start`, local-only test keys — see §4a): scanned
    room 101 → landed on `/portal` with a working RLS-gated read of the guest's own stay
    (`Welcome, Mensah`, correct checkout date); scanned room 102 (vacant) → outcome B, notify
    tap wrote to `audit_log`; scanned room 202 (`out_of_order`) → outcome C; bogus key →
    outcome D; 6 scans of room 101 → outcome E (device cap) on the 6th.
- **Staff PIN auth (§5.1) and the full check-in → live-upgrade chain (§3.2, §4.3), locally
  verified working** — see §5 items 6 and 7 below for the full writeup (`apps/staff-pwa`'s
  `/setup` → `/pin` → `/dashboard` → `/checkin`, plus guest-web's `/vacant/upgrade` and the
  Realtime broadcast that connects them). This is what closes out the §15 Sprint 1 exit test.
- **Sprint 2: requests full lifecycle + room status board, locally verified working — closes
  out the §15 Sprint 2 exit test.** See §4b for why this uses Broadcast-from-Database instead
  of `postgres_changes`.
  - `requests` table (`20260711170000_requests.sql`) — `type`/`state`/`priority`/`note`/
    `claimed_by`/timestamps per §14.3. `branch_id` is trigger-derived from `stay_id`, never
    trusted from the client (a real bug caught by testing — the first version let a crafted
    insert set an arbitrary `branch_id`). RLS: guest can insert/view/update their own stay's
    requests directly (full/limited tier only, §4.4 — no service-role route needed, unlike
    `stays`), staff can view/update requests in branch scope.
  - Guest side: `apps/guest-web/components/RequestsPanel.tsx` on `/portal` — submit a request,
    see live status, `Confirm`/`Reopen` when `done` (§8.1's guest-facing transitions). Gets its
    own session token from `/portal/token` (a small endpoint that hands the JWT to page JS,
    safe because it's gated by the same httpOnly cookie as everything else — see the code
    comment there for the full reasoning) so it can open an RLS-scoped client for both the
    direct writes and the broadcast subscription.
  - Staff side: `apps/staff-pwa/components/RequestPool.tsx` on `/requests` — branch-scoped
    queue (housekeeping role sees only `housekeeping` type, maintenance only `maintenance`,
    everyone else sees the whole branch), `Claim`/`Start`/`Complete` buttons gated by
    `claimed_by` ownership, a Web-Audio-API chime (no committed asset) fires only on
    `request_submitted` broadcasts, never on ordinary updates. Same `/session/token` pattern as
    guest-web's `/portal/token`.
  - Room board: `apps/staff-pwa/components/RoomBoard.tsx` on `/rooms` — live-updating list,
    status transitions gated by `canTransition(ROOM_STATUS_TRANSITIONS, ...)`, writes go
    straight through the existing "staff can update rooms in own branch scope" RLS policy.
  - **Locally verified, the full chain** (via a Node script driving `@supabase/supabase-js`
    directly, not the browser — see §7's note on testing Realtime headlessly): guest submits a
    housekeeping request → staff pool's broadcast listener fires (chime would fire) → staff
    claims → guest's listener sees the update live → staff starts then completes → guest sees
    `done` live → guest confirms → separately, two independent staff connections both
    subscribed to the same branch's room-board topic, one flips a room's status, the other
    receives the broadcast and would re-render live.
  - **Also caught by this testing** (both fixed, see §5 item 6 below for the check-in-side
    one): the check-in room picker was listing `out_of_order` rooms as available.
- **Sprint 3: menus, cart, charge-to-room orders, kitchen queue, live bill — locally verified
  working, closes out the §15 Sprint 3 exit test.** Pay-now (Paystack) is Sprint 4 — every order
  this sprint is charge-to-room, full trust only (§4.4, §9.1).
  - `menu_sections`/`menu_items`/`orders`/`order_items`/`folios`/`folio_lines`
    (`20260711180000_menu_and_orders.sql`). `menu_sections.room_category_id` (nullable) is
    §7.3's "category-driven visibility" — RLS just scopes menu reads to the guest's branch
    (visibility-by-category isn't a security boundary, it's a merchandising concern), the
    room-category filter itself happens in the app query.
  - **Order placement is one atomic RPC, `place_charge_to_room_order(p_items)`** — deliberately
    not a direct RLS insert like `requests` uses. Money is where this schema departs from the
    "let RLS handle it directly" pattern: placing an order touches four tables and must price
    every line server-side (there's no `p_stay_id` or price argument at all — the function
    derives the caller's stay from `guest_stay_id()`, checks `guest_tier() = 'full'` itself, and
    looks up authoritative prices from `menu_items`, never trusting anything the client sent
    except `menu_item_id` + `quantity`). `authenticated`-callable (guests call it directly from
    the browser, like an RLS write would be) but `SECURITY DEFINER`, so it can insert into
    `orders`/`order_items`/`folios`/`folio_lines` in one transaction despite guests having no
    direct write policy on any of them.
  - Folio lines post **at placement**, `flagged = true` until the order's `kitchen_state` hits
    `delivered` (§8.2) — a trigger (`clear_folio_line_flag_on_delivery`) clears the flag
    automatically, no application code involved.
  - Guest side: `apps/guest-web/components/MenuBrowser.tsx` (browse + cart + place order) on
    `/portal/menu`, `OrdersPanel.tsx` (own orders, live kitchen state) on `/portal`,
    `BillView.tsx` (live folio, full trust only) on `/portal/bill`.
  - Staff side: `apps/staff-pwa/components/KitchenQueue.tsx` (live queue, chime on new order
    only — not on ordinary state updates — same distinct-broadcast-event trick as the request
    pool, §4b) + `SoldOutToggle.tsx`, both on `/kitchen`.
  - **Locally verified, the full chain** (headless Node script again, see §7): guest calls the
    RPC with 2× Jollof Rice + 1× water → kitchen queue's listener chimes and the order appears
    → staff advances `placed → acknowledged → preparing → ready → delivered` → guest's order
    list gets a live update at every step → folio line is `flagged: true` immediately at
    placement, confirmed `flagged: false` right after delivery, no app code involved in that
    transition → separately, staff flips Jollof Rice `available: false` → guest's menu
    subscription receives the broadcast (would vanish from an open menu, exactly per the exit
    test's wording).
  - **Known minor inefficiency, not a bug:** placing an order fires an extra `order_updated`
    broadcast (from the RPC's own `total_minor_units` UPDATE after the initial insert) just
    before its `order_placed` broadcast. Harmless — every listener refetches on any event, so
    it's just one redundant re-read — but if this ever gets touched again, restructuring the RPC
    to compute the total before the first insert (instead of insert-then-update) would remove
    it.
  - **Not built this sprint** (all deliberately out of scope, matching the exit test's actual
    wording, not the full §8.2/§8.3): guest order cancellation (`§8.2` — "allowed until
    acknowledged"), kitchen-side cancellation + automatic refund/folio-line-removal, per-item
    prep timers, stock alerts, and any menu-management CRUD UI (menu data is seed-only right
    now, in `supabase/seed.sql` — legitimate demo content, unlike the staff-PIN seed which stays
    local-only, since there's nothing sensitive about a demo menu).
- **Sprint 4: Paystack pay-now, the §9.2 outcome matrix, express checkout, receipts.** Full
  writeup, including exactly what "verified" means without any Paystack credentials, is in
  §4c — read that before touching anything payment-related. Short version:
  - `payments` (one row per Paystack *attempt* — a retry gets a fresh reference on the same
    order, not a new order) + `resolve_payment_outcome()`, a single `SECURITY DEFINER` choke
    point every webhook/verify signal goes through, idempotent on `provider_ref`.
  - `place_pay_now_order()` / `retry_order_payment()` — guest-callable, self-authorizing
    (`guest_stay_id()`/`is_guest()`, no `is_guest()`-bypassing argument exists), available at
    **both** trust tiers unlike charge-to-room. Posts no folio line until payment actually
    succeeds; never broadcasts to the kitchen's branch topic while `pending` — "pending-payment
    orders are invisible to the kitchen" is structural, not a kitchen-side filter that could be
    bypassed by a future bug.
  - `expire_stale_pending_payments()`, the 15-minute abandon sweep, scheduled via **`pg_cron`**
    — genuinely runs every minute inside Postgres, no Vercel Cron or external deployment
    needed, confirmed via `cron.job`. `pg_net` is also available locally (used nowhere yet) if
    a future sweep needs outbound HTTP from Postgres itself.
  - The verify-poll (`/api/paystack/verify/[reference]`) is deliberately **client-driven**
    (30s/60s/60s.../15min backoff, `components/PendingPayment.tsx`) rather than another cron —
    the guest's own pending-payment screen is already open and watching, and it sidesteps
    needing pg_net to reach a public URL for a component that can't be tested against a real
    Paystack call anyway.
  - **Express checkout** (`initiate_express_checkout()` / `resolve_checkout_settlement()`,
    `/portal/checkout`): zero outstanding balance checks out immediately; a positive balance
    goes through the same pay-now machinery. Added a `folio_lines.settled` column this sprint
    — distinct from Sprint 3's `flagged` (delivery status) — because a pay-now order's folio
    line is paid the instant it posts, while a charge-to-room line stays unsettled until
    checkout; conflating the two would have made an unpaid charge-to-room order look settled
    or a paid-but-undelivered order look like it still owed money.
  - **Found and fixed while building this**: the original `folios`/`folio_lines` SELECT
    policies (from Sprint 3, already live) didn't check trust tier at all, letting `limited`
    guests read the folio — §4.4 says the live bill is full-trust only. Tightened via
    `drop policy` + `create policy` in this migration (can't edit an already-pushed migration
    file directly, so this is the normal way to fix an earlier policy).
  - Receipt (`/portal/receipt`, full + `post_stay` tier) is real but **does not** satisfy
    §7.4's "stable link that outlives the 48h post-stay session" — it's still gated by the
    guest's own session, which does die after 48h. A truly permanent link needs a separate
    signed-URL mechanism (e.g. a token column on `stays`) that wasn't built. Also not built:
    WhatsApp/SMS receipt delivery, auto-generated housekeeping turnover tasks on checkout, and
    the feedback-request send — all three need infrastructure (a home for non-guest-originated
    tasks, and Sprint 5's WhatsApp/Hubtel credentials) that doesn't exist yet.
- **Nothing above has been verified against the live project yet** — needs
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` (see §3), and Sprint 4 additionally
  needs `PAYSTACK_SECRET_KEY` before its Paystack-calling parts can be verified for real (its
  database logic doesn't need it — see §4c). Everything was built and tested against a local
  Docker Supabase instance instead; every migration through Sprint 3 is already pushed live,
  Sprint 4's (`20260711190000_payments.sql`) needs a go-ahead — see §5 below — so once that's
  in and the env vars are filled in, the live project
  should be schema-ready for the exact same flows.

## 5. What's NOT Built Yet — Pick Up Here

In priority order, following the Sprint 1 exit test in spec §15 ("scan a room QR and land in a
full session; scan a vacant room and get outcome B; check-in upgrades the open page live"):

1. ~~Push the grant-fix migration to the live project~~ — **done**, pushed 2026-07-11.
   Confirmed applied via `supabase migration list --db-url "$DIRECT_URL"`.
2. ~~Push the branch-code migration to the live project~~ — **done**, pushed 2026-07-11.
   `branches.code = 'ACCRA'` confirmed applied via `supabase migration list`.
3. **Get `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` into all four `.env.local`
   files** (see §3) — needed to point `guest-web` at the live project instead of local Docker.
4. ~~Edge Function: mint a guest session JWT~~ — done, but as a Next.js Route Handler
   (`apps/guest-web/app/r/[room_key]/route.ts`) rather than a Supabase Edge Function. This
   deviates from the migration file's own comment ("happens through a SECURITY DEFINER Edge
   Function") — same trust boundary either way (both are service-role server contexts), and it
   avoids an extra network hop, but flag this as a deliberate call, not an oversight, if it
   ever needs reconciling with the spec's literal wording.
5. ~~Second-device flow~~ — done. `apps/guest-web/app/enter/page.tsx` (form) +
   `app/enter/submit/route.ts` (POST handler). Parses `ACCRA-204` via
   `lib/room-code.ts:parseRoomCode`, matches last name case/whitespace-insensitively
   (`packages/shared/src/second-device.ts`), rate-limits 5 attempts / 15 min per IP *and* per
   room via `security_events` rows (event_type `second_device_attempt`, plus a distinct
   `second_device_rate_limited` event on lockout), issues a `limited`-tier session on match.
   **Not implemented from §4.5's upgrade paths:** (b) push-approval-from-an-existing-device and
   (c) OTP-to-phone-on-file — only (a) "scan the room QR from that device" exists, because
   that's just outcome A of the existing scan route, already built. (b) and (c) need
   Realtime/notification plumbing that doesn't exist until later sprints.
   **Locally verified**: wrong last name → generic failure; case/whitespace-insensitive match
   (`"  mensah  "` matched `"Mensah"`) → `limited` session, confirmed via `/portal`; unknown
   branch code → generic failure; 5 failed attempts from one IP → 6th+ locked.
6. ~~Staff PIN auth~~ — done. `apps/staff-pwa`: `/setup` (one-time, which branch this tablet
   belongs to — reuses `branches.code`, sets `dhop_staff_branch_id` cookie) → `/pin` (4-digit
   PIN tap-in) → `/dashboard`. PIN verification is a new Postgres RPC,
   `verify_staff_pin(branch_id, pin)` (bcrypt via pgcrypto's `crypt()`,
   `supabase/migrations/20260711160000_staff_pin_functions.sql`, `service_role`-only execute) —
   **pushed to the live project**, confirmed 2026-07-11 via `supabase migration list`. Rate-limited 5
   wrong / 5 min **per tablet** (`dhop_staff_tablet_id` cookie + `security_events`), not per
   branch, so one tablet getting bruteforced doesn't lock out the whole department — matches
   §5.1's own reasoning ("the alert is the real defense," so unlike the guest second-device
   flow, wrong-PIN feedback is direct, not vague). Session is a JWT with `sub` = the staff
   member's real `auth.users.id` (`packages/shared/src/staff-jwt.ts`) — this is the key design
   point: every existing RLS helper (`staff_branch_id()`, `staff_role_key()`, ...) already
   resolves off `auth.uid()`, and `auth.uid()` just reads a JWT's `sub` claim regardless of
   whether GoTrue issued it — so PIN tap-in needs no new RLS policies at all, it slots into the
   Sprint 1 schema exactly as a real Auth login would. Idle auto-logout (5 min default, not
   configurable per station yet — no per-station settings table exists) via a client component
   (`components/IdleLogout.tsx`) that POSTs to `/logout` on inactivity.
   **What's NOT built**: the staff-creation/PIN-assignment flow itself (that's an admin-web
   "staff management" feature, §5.5) — `hash_staff_pin()` RPC exists and is ready for it, but
   there's no UI yet, and **zero real staff accounts exist on the live project**. For local
   testing this session, one test staff member + PIN was inserted directly into the local
   Docker Postgres only (raw `auth.users`/`staff`/`staff_pins` rows) — deliberately **not**
   added to `supabase/seed.sql`, since that file is also applied to the live project and faking
   `auth.users` rows there would be a real (if harmless) production data action, not a
   dev-seed action. Also not built: phone-OTP (§5.2) and email/password+MFA (§5.3) staff login,
   needed for personal-mobile housekeeping/maintenance and office roles respectively.
   **Locally verified**: wrong PIN → `error=invalid`; correct PIN → `/dashboard` renders
   `Welcome, Ama Serwaa` / `Role: reception` via an RLS-gated read (proves the `auth.uid()`
   chain works); 6th wrong attempt on one tablet → locked; logout clears the session cookie and
   `/dashboard` redirects back to `/pin`.
   **Gotcha hit while building this**: the RPC functions initially failed with
   `function crypt(text, text) does not exist` — pgcrypto installs into the `extensions`
   schema, not `public`, and a `SECURITY DEFINER` function's `set search_path = public`
   overrides the caller's inherited path (which normally includes `extensions`), cutting
   pgcrypto out. Fix: `set search_path = public, extensions` on both PIN functions. Any future
   `SECURITY DEFINER` function that needs an extension-provided function needs the same fix —
   this is a distinct trap from the §4a grants issue even though both are "worked everywhere
   except inside a locked-down function," worth remembering as its own gotcha.
7. ~~Check-in flow~~ — done, **and the full Sprint 1 exit test now passes** (§15: "scan a room
   QR and land in a full session; scan a vacant room and get outcome B; check-in upgrades the
   open page live" — all three locally verified in one continuous test this session).
   - `apps/staff-pwa/app/checkin` (room picker scoped to the staff member's branch, excludes
     rooms with an active stay *and* `out_of_order` rooms — the latter was a bug caught by
     testing, not designed in from the start; see the gotcha below) + `/checkin/submit`
     (§3.2: inserts the `active` stay, flips `rooms.status` to `occupied`, audit-logs, and
     broadcasts a Realtime event).
   - `apps/staff-pwa/app/force-close/submit` — the guard's escape hatch. Requires a reason,
     revokes every `guest_sessions` row on the stay, sets `rooms.status` back to `vacant_dirty`
     (not explicit in §3.2's force-close bullet, but leaving it `occupied` after an abnormal
     end would misreport the room the same way item 9's old seed-data gap did — so this now
     fixes that class of bug going forward rather than just flagging it). Logs a
     `security_events` row as the "notify branch manager" stub (real fanout is Sprint 5).
     Reachable only from `/checkin`'s blocked-room error state, matching exactly when §3.2 says
     it's needed — not a general room-management page (that's Sprint 2's room board).
   - **The live-upgrade mechanism** (the exit test's hardest clause): guest-web's `/vacant`
     page runs a client component (`components/VacantRealtimeUpgrade.tsx`) that opens a
     Supabase Realtime **Broadcast** subscription on topic `room:{room_id}` — deliberately
     *not* a `postgres_changes` subscription on `stays`, because Realtime's Postgres-Changes
     feature is RLS-gated and an unauthenticated guest (no stay yet — that's the whole premise
     of being on `/vacant`) has no policy that would let them see `stays` rows. The check-in
     route instead does a server-side one-shot broadcast via Realtime's REST API
     (`packages/shared/src/realtime-broadcast.ts` — a raw `fetch` to
     `{url}/realtime/v1/api/broadcast`, not a websocket channel, since a request handler can't
     reliably hold a socket open long enough to subscribe-then-send). On the event, the client
     navigates (real navigation, not `fetch`) to `/vacant/upgrade`, a new route that re-resolves
     the room's active stay itself — never trusts the broadcast payload as a source of truth —
     and mints the session exactly like the QR-scan route's outcome-A path (now factored into
     `apps/guest-web/lib/issue-full-session.ts` so both call sites share one implementation).
   - **Locally verified, the full chain**: checked a guest into room 101 (already active) →
     correctly blocked with the occupied-room error; force-closed that stale stay → room
     reappeared in the vacant list; separately, opened a raw Realtime client subscribed to
     `room:{room_102_id}` and confirmed it received the `checked_in` broadcast the moment
     reception checked a guest into room 102 via `/checkin`; then hit `/vacant/upgrade` (what
     the browser does on that event) and landed on `/portal` showing `Welcome, Boateng` with
     the correct checkout date and `full` trust tier — the same guest, matching what reception
     had just entered, with the guest's browser never touching the QR code a second time.
   - **Gotcha caught by this testing, not designed in**: the first version of the check-in
     room-picker listed `out_of_order` rooms as available to check into. Fixed by excluding
     `status = 'out_of_order'` in both the room list query and the submit route's guard (defense
     in depth — the list controls what a well-behaved client shows, the guard is what actually
     stops it). Worth remembering when building the Sprint 2 room board: "not occupied" and
     "checkinable" are not the same predicate.
8. ~~Sprint 2 (room status board + Realtime + first request type)~~ — done, **and the full
   Sprint 2 exit test now passes** (§15: guest requests towels, staff pool chimes/claims/
   completes, guest sees it live, room status flips propagate to two devices). Full writeup is
   in §4 above (the "Sprint 2: requests full lifecycle + room status board" bullet) rather than
   repeated here — the short version: `requests` table + RLS + `branch_id`-derivation trigger,
   `apps/guest-web`'s `RequestsPanel` on `/portal`, `apps/staff-pwa`'s `RequestPool` on
   `/requests` and `RoomBoard` on `/rooms`. **Read §4b** — this is also where the
   `postgres_changes`-doesn't-work-locally discovery happened, and everything live here uses
   Broadcast-from-Database instead.
9. ~~Push the requests migration to the live project~~ — **done**, pushed 2026-07-11. All five
   migrations confirmed applied via `supabase migration list`.
10. ~~Sprint 3 (menus, cart, charge-to-room orders, kitchen queue, sold-out toggle, live
    bill)~~ — done, **and the full Sprint 3 exit test now passes**. Full writeup is in §4 above
    (the "Sprint 3: menus, cart, charge-to-room orders..." bullet). Short version:
    `place_charge_to_room_order()` is a self-authorizing RPC (not a direct RLS write, unlike
    `requests` — money needs the extra atomicity/never-trust-the-client care), folio lines post
    at placement and un-flag on delivery automatically via trigger,
    `apps/staff-pwa/components/KitchenQueue.tsx` reuses the same chime-on-genuinely-new-event
    pattern as the request pool.
11. ~~Push the menu/orders migration to the live project~~ — **done**, pushed 2026-07-11. All
    six migrations confirmed applied via `supabase migration list`.
12. ~~Sprint 4 (Paystack pay-now, §9.2 outcome matrix, express checkout, receipts)~~ — done,
    logic-level exit test passes. Full writeup in §4 above and §4c (read §4c — it explains
    precisely what "passes" means with zero Paystack credentials anywhere in this project).
13. ~~Push the Sprint 4 payments migration to the live project~~ — **done**, pushed 2026-07-11.
    Seven migrations confirmed applied via `supabase migration list`.
14. ~~Sprint 5 (SLA monitor, retention purge, session sweep, branch manager dashboard, audit
    log surfacing, notification routing table, offline queue)~~ — done. Full writeup in §4d —
    **read it**, especially the offline-queue section's honesty note (it's the one piece this
    entire session never verified against a real browser, unlike everything else).
15. ~~Push the Sprint 5 ops-hardening migration to the live project~~ — **done**, pushed
    2026-07-11. Eight migrations confirmed applied via `supabase migration list` — every Phase 1
    sprint's schema is now live. `sla-sweep`, `expire-stale-guest-sessions`, and
    `retention-purge` are all scheduled and running on the live project as of this push
    (`retention-purge` won't delete anything for a long time — see §4d, nothing in current data
    is remotely old enough yet).
16. ~~Every Phase 1 sprint in §15~~ — **done**, all eight Phase-1 migrations live as of
    2026-07-11. `admin-web` remains the untouched create-turbo starter page — no Phase 1 or
    Phase 2 work has touched it; a real staff-management UI (creating staff + assigning PINs)
    would finally close the loop on `hash_staff_pin()`, which has been sitting ready and unused
    since Sprint 1.
17. **Phase 2, round 1 — three items caught by a stop-hook review as unmarked-P1 gaps, not
    actual Phase 2 scope** (live chat between guest and reception, private guest feedback, a
    language-switcher scaffold) — all three built and pushed live 2026-07-12:
    `20260712100000_chat.sql` (`chat_messages`, broadcast to `chat:stay:{id}` /
    `chat:branch:{id}`, `ChatPanel.tsx` / `StaffChatInbox.tsx`), `20260712110000_feedback.sql`
    (`feedback` table, rating 1-5, `escalate_unhappy_feedback()` trigger logs to
    `security_events` on rating ≤ 3, `FeedbackForm.tsx` on `/portal/receipt`), and
    `LanguageSwitcher.tsx` (English + 2 placeholder languages, honestly labeled "coming soon" —
    no real translation infrastructure exists).
18. **Phase 2, round 2 — genuine `[P2]` items, all four built, locally verified, and pushed
    live 2026-07-12:**
    - **Tipping** (`20260712120000_tipping.sql`) — `tips` table, `initiate_tip()` /
      `resolve_tip_outcome()` RPCs (posts a settled folio line on success, no forfeit/hold
      concept, unlike deposits), `TipForm.tsx` on `/portal/tip`.
    - **Lost & found** (`20260712130000_lost_items.sql`) — `lost_items` table, guest can report
      (`stay_id` set, branch_id trigger-derived) or staff can log a found item directly
      (`reported_by='staff'`, no `stay_id`, trigger skips branch-derivation in that case),
      `LostItemForm.tsx` / `LostFoundLog.tsx`.
    - **Deposits / incidental holds** (`20260712140000_deposits.sql`) — `deposits` table,
      four RPCs (`create_deposit()` reception+, `resolve_deposit_outcome()` the usual
      `service_role`-only Paystack choke point, `forfeit_deposit()` branch_manager+ only
      — posts an `adjustment` folio line — `mark_deposit_refunded()` reception+, DB-only,
      called *after* a real Paystack refund succeeds), `DepositsPanel.tsx` on `/deposits`.
    - **Guest ID uploads** (`20260712150000_guest_id_uploads.sql`, §13) — private Storage
      bucket `guest-ids` (RLS on `storage.objects`: guest INSERT only, path
      `{stay_id}/{filename}`, no SELECT policy for anyone but service_role), `guest_id_uploads`
      metadata table (branch_id trigger-derived) + `guest_id_access_log` (every read logged
      *before* a signed URL is generated — enforced structurally: `service_role` is the only
      client that can ever read the bucket, and the only route holding that client
      (`apps/staff-pwa/app/id-uploads/[uploadId]/view/route.ts`) always inserts the log row
      first). Also **redefines** (not duplicates) the Sprint-5 `retention_purge()` to delete
      upload metadata for stays closed >30 days — actual Storage *object* deletion is still not
      implemented (would need pg_net→Storage REST API or an Edge Function), only the metadata
      row. **Locally verified**: full-tier guest upload succeeds via the Storage API,
      limited-tier guest correctly rejected (both storage-object RLS and metadata-table RLS);
      branch_id-derivation trigger fires correctly; reception role in-branch can list/view
      (access-logged), kitchen role sees zero rows; `retention_purge()` deleted a 40-day-old
      checked-out stay's upload metadata while leaving an active stay's upload untouched.
      Production build clean, dry-run matched exactly this one migration, pushed live and
      confirmed via `supabase migration list` (14 migrations, all local=remote).
    - The four earlier reference-only RESOLVERS entries
      (`resolve_payment_outcome`/`resolve_checkout_settlement`/`resolve_tip_outcome`/
      `resolve_deposit_outcome`) mean `apps/guest-web/lib/resolve-payment-reference.ts` now
      tries all four in a loop — any future new payment-reference type is a one-line addition to
      that array, not another branch in an if-chain.
19. **Activities & Facilities Booking** (`20260712160000_activities.sql`, §10) — pushed live
    2026-07-12. `activities` (branch-scoped catalog, cancellation cutoff + deposit-forfeiture
    percent fields live from day one per the spec's explicit build-ready requirement, even
    though nothing here auto-forfeits — that stays a human call via the existing
    `forfeit_deposit()` RPC), `activity_slots` (per-slot capacity), `activity_bookings`.
    - **`book_activity_slot(p_slot_id, p_guest_count)`** is the transactional atomic claim the
      spec explicitly calls for ("two guests tapping the last spa slot simultaneously must
      produce exactly one booking and one polite 'just missed it'") — it locks the slot row
      (`for update`) before counting confirmed bookings against capacity, so a second racing
      caller blocks until the first transaction commits, then sees the updated count. **Locally
      verified with a real concurrency test, not just sequential calls**: two distinct guest
      JWTs fired genuinely simultaneous requests (backgrounded curl + `wait`) at the last open
      spot on a capacity-2 slot — exactly one returned a booking ID, the other got `"slot full"`,
      and the DB afterward showed exactly 2 confirmed bookings, never 3.
    - `cancel_activity_booking()` — guest-callable, self-authorizing, logs a
      `late_activity_cancellation` security event (for staff review, not automatic) when
      cancelling past the activity's `cancellation_cutoff_minutes`. Verified both branches: a
      cancellation well before a slot's start logged nothing; cancelling a booking on a
      slot starting in 10 minutes (cutoff 120 min) correctly logged the event.
    - RLS on `activity_bookings` matches §5.5's role matrix exactly: reception/concierge get
      view-only (confirmed — an UPDATE attempt as reception affected 0 rows, no error, standard
      Postgres RLS behavior), branch_manager/owner can update state (`completed`/`no_show`) and
      `staff_assigned_id` (confirmed working).
    - Guest side: `ActivitiesBrowser.tsx` on `/portal/activities` (browse, book, cancel, "My
      bookings"). Staff side: `ActivitiesPanel.tsx` on `/activities` (view all branch bookings;
      mutation buttons only render for branch_manager/owner, matching the RLS boundary).
    - **Not built**, deliberately: any activities-catalog CRUD UI (same call as menu items in
      Sprint 3 — seed-only for now, `supabase/seed.sql` has one demo activity/slot), a live
      calendar view (the spec's "master calendar" — this session built the transactional
      correctness the spec calls "build-ready," not the calendar UI polish it explicitly doesn't
      gate on), and any FCM/SMS notification on booking events (§11 infrastructure doesn't exist
      yet, same gap as every other feature this session).
20. **Guest profile memory + reservation entry + contactless pre-registration**
    (`20260712170000_guest_profiles_and_reservations.sql`, §13/§17/§7.2) — pushed live
    2026-07-12. This is the last item in the current Phase 2 scope; bundled into one migration
    because all three share the same "give reception a head start before the guest physically
    arrives" theme.
    - **Guest profile memory** (§13): `guests` table + `stays.guest_id`. `opt_in_guest_profile()`
      is guest-callable/self-authorizing, keyed on `(organization_id, phone)` — upserts so a
      returning guest's second opt-in updates the same row rather than creating a duplicate.
      Surfaced on `/portal/receipt` via `ProfileOptIn.tsx`, matching the retention table's
      "opt-in at checkout" rule exactly (never presented as a condition of checking out).
      `delete_guest_profile()` — reception+/branch_manager/owner only — **anonymizes rather than
      hard-deletes** (same "stats survive, identity doesn't" rule Sprint 5's retention purge
      already applies to `stays.last_names`/`phone`), satisfying the Act 843 deletion right.
      Staff-side lookup: `/guests` (reception+/branch_manager/owner), phone-search only, shows
      past stays + a delete button. **Locally verified**: opt-in correctly created the `guests`
      row and linked `stays.guest_id`; reception could look it up by phone via RLS; delete
      correctly anonymized `full_name`/`phone` in place.
    - **Reservation entry, P1-lite** (§17 open item #4 — "recommended yes, it's cheap; the full
      booking calendar stays P3"): `reservations` table, reception+/branch_manager/owner can
      create/update, reception/concierge/branch_manager/owner can view (matches §5.5's role
      matrix). `/reservations` staff page (`ReservationsPanel.tsx`) — create, list, mark
      checked-in/cancelled/no-show, copy the pre-registration link. **Deliberately not wired
      into `/checkin/submit`** — the actual stay is still created by the existing desk check-in
      flow untouched; a reservation is a separate, decoupled record. The "arriving today" flag
      the spec asks for is a read-only hint box at the top of `/checkin` (today's pending
      reservations for the branch, plus any pre-registration data) — reception still types the
      same 60-second form, this just gives them a head start reading it. **Locally verified**:
      created a reservation, confirmed it appears in the branch-scoped RLS query the checkin
      page uses.
    - **Contactless pre-registration** (§7.2 [P2]), scoped down deliberately: the spec is
      explicit that "Phase 1 check-in happens at the desk (60-second flow, §3.2)," so this does
      **not** create a `stays` row or replace the desk check-in — it's a public, token-scoped
      link (`/register/[token]`) a guest can fill in before arrival (name, phone, notes), which
      reception then sees as a pre-filled hint on the check-in page. No guest session exists at
      this point in the journey, so the token lookup/write happens server-side via the
      service-role client in a Next.js Route Handler — the same trust-boundary pattern
      `/r/[room_key]` (the QR-scan entry point) already uses, and deliberately not a direct
      anon-key RLS read (a guessable-token SELECT policy would otherwise sit behind the same
      broad `grant select ... to anon` every table gets). **Locally verified against a real
      running dev server, not just RLS simulation**: `GET /register/[token]` rendered the
      correct reservation details; `POST .../submit` correctly wrote the `pre_registration` jsonb
      and set `pre_registered_at`; re-visiting the same link after submission correctly showed
      "already sent" instead of the form again; an invalid/unknown token was cleanly rejected
      with no information leak about why.
    - New env var: `NEXT_PUBLIC_GUEST_WEB_URL` (staff-pwa only) — builds the copyable
      `/register/[token]` link from the reservations panel. Set to `http://localhost:3000`
      locally; **still needs the real deployed guest-web URL once one exists** (`admin-web` and
      a real domain setup are both still outstanding — see item 16).
    - **Not built**, deliberately: any ID-upload step inside pre-registration (would need a
      pre-stay storage bucket/policy surface distinct from the existing full-trust-only
      `guest-ids` bucket — out of scope for this bounded version), and any automatic linking of
      a reservation to the stay it becomes (reception does this manually via "mark checked in").
21. **Final `[P2]` sweep** (`20260712180000_stock_alerts.sql`) — before declaring Phase 2 done,
    grepped the spec for every remaining `[P2]` tag rather than trusting the task list built up
    piecemeal across this session. Found and closed two small, bounded gaps, pushed live
    2026-07-12:
    - **Stock alerts** (§8.3): `menu_items.stock_quantity` (nullable — opt-in per item) +
      `low_stock_threshold` (default 5), a trigger that logs a `low_stock_alert` security event
      exactly once when stock crosses the threshold (not on every update while already low, not
      silently on restock-then-redrop without re-crossing). `SoldOutToggle.tsx` extended with a
      stock-quantity input and a ⚠ low-stock flag. **Locally verified all four transition
      cases**: no alert set above threshold; exactly one alert firing on crossing; no duplicate
      alert on a further drop while still below threshold; alert re-arms after restocking above
      threshold then dropping again.
    - **§7.1 "advance info"** (Wi-Fi, directions, house rules) — the part of Before Arrival not
      blocked on the reservation calendar [P3]: three nullable text columns on `branches`, shown
      on the `/register/[token]` pre-registration page. **Deliberately not built**: §7.1's
      upsells (upgrade, airport pickup, early check-in) — those need real payment/inventory logic
      this session isn't bolting onto a content page; the reservation/pre-registration `notes`
      fields already cover the spec's own suggested fallback ("manual send").
    - **Also confirmed still open, deliberately not built**: §8.3's Finance depth (split billing,
      automated reconciliation). Split billing touches the folio/payment RPCs broadly enough to
      deserve dedicated design attention, not a rushed addition this late in a session; automated
      reconciliation needs live Paystack settlement data, which doesn't exist here for the same
      reason nothing else in Sprint 4 has ever touched a real payment (§4c). P1's "Reception
      basic folio + Paystack's own dashboard" already covers what this spec calls P1-lite
      reconciliation.
22. **Phase 2 was fully built, locally verified, and pushed live as of this point** — every item
    tracked since the stop-hook feedback (round 1's three P1 gaps, round 2's four genuine P2
    items, activities booking, the profile/reservation/pre-registration bundle, and the final P2
    sweep) was done. The session's own `/goal` mechanism then kept firing because its literal
    condition ("finish all the phases") technically includes Phase 3, which the spec explicitly
    says not to build early (§8.1: "do not build it early"). The user was asked directly and
    chose to treat P1+P2 as the real scope — but after several more rounds of the same stop-hook
    loop with no way to clear it programmatically, the user explicitly said to proceed with
    Phase 3 anyway, overriding the spec's own "don't build early" framing. See item 23.
23. **Phase 3, built at explicit user request** (`20260712190000_phase3.sql`) — three pieces,
    pushed live 2026-07-12:
    - **Workload-balanced auto-assignment** (§8.1): a `BEFORE INSERT` trigger on `requests`
      (`auto_assign_request()`) assigns a new request to whichever *active* staff member in the
      matching department (branch-scoped) currently has the fewest open (`claimed`/
      `in_progress`) requests, ties broken by `staff.id`. **Deliberately does not remove the
      pool** — `claimed_by` stays a plain column any branch-scoped staff UPDATE can change
      (unchanged RLS policy), so reassignment ("I'll take this one instead") still works exactly
      as before; this is an assignment optimization layered on the pool, not a replacement for
      it, which is the actual product concern the spec's "do not build it early" warning was
      raising. Falls back to the old unclaimed/`submitted` pool state when no staff exists in the
      matching department. **Locally verified all three cases**: with one housekeeper holding 2
      open requests and another holding 0, a new housekeeping request correctly auto-assigned to
      the 0-open one; a `concierge`-type request with no concierge staff seeded correctly stayed
      `submitted`/unclaimed; department mapping (`laundry` → `housekeeping` role, since there's
      no separate laundry role in the 10 seeded roles) confirmed via `department_role_key()`.
    - **Redirect automation** (§7.4): `branches.google_review_url` / `tripadvisor_review_url`
      (nullable). `FeedbackForm.tsx` shows a public-review link only when the submitted rating is
      ≥4 *and* the branch has actually configured a URL — an unconfigured branch or a rating ≤3
      gets exactly the private-only behavior this had before (the unhappy-feedback escalation
      path, `escalate_unhappy_feedback()`, is untouched). Getting the guest portal able to read
      `branches` at all required a new guest SELECT policy — see the recursion bug below.
    - **Booking calendar** (§10/§17's "master calendar"/"full booking calendar"): no new schema
      — a read-only month-view aggregate over `activity_bookings`+`activity_slots` and
      `reservations`, on `/calendar` (reception/concierge/branch_manager/owner). Click a day to
      see that day's activity bookings and reservation arrivals. Deliberately does not add
      drag/reschedule — that's still out of scope, this is the calendar *view* the spec's own
      wording separates from booking management (already covered by `ActivitiesPanel.tsx` /
      `ReservationsPanel.tsx`).
    - **Real bug caught by testing, fixed before push**: the new guest SELECT policy on
      `branches` originally read `id = (select branch_id from stays where id = guest_stay_id())`
      directly — but `stays` already has a *staff* policy whose USING clause queries `branches`
      (branch-or-org scope check), so a guest querying `branches` triggered RLS on `stays`, which
      re-queried `branches`, which re-evaluated the guest policy again: **infinite recursion**
      (`ERROR: infinite recursion detected in policy for relation "stays"`), caught immediately
      by testing the actual guest-context query, not just reading the SQL. Fixed the same way
      `staff_branch_id()`/`staff_organization_id()` already avoid the identical structural trap:
      added a `SECURITY DEFINER` `guest_branch_id()` helper so the stay→branch lookup bypasses
      RLS on `stays` entirely instead of re-entering it. Re-verified clean afterward (no
      recursion, correct URL returned, §7.1's wifi/directions/house-rules read still works,
      staff-side `branches` access unaffected).
24. **Genuinely open after Phase 3**: Finance depth (split billing, automated reconciliation —
    see item 21's reasoning, unchanged), `admin-web` (still the untouched create-turbo starter),
    and everything §4d already flags as physically outside what a coding session can finish (real
    Paystack/WhatsApp/Hubtel/FCM credentials, a live pilot hotel, browser-verified offline queue
    behavior). At this point every spec-defined phase tag (P1, P2, P3) has at least one item
    built and verified except Finance depth, which remains deliberately deferred for the reasons
    in item 21, not forgotten.

## 6. Open Decisions Still Needing the Project Owner

- Repo visibility (public vs. private) — asked, not yet answered.
- Pilot hotel selection, and whether they need reservation-calendar support in Phase 1 (spec
  §17, item 2 and 4).
- Paystack vs. confirming Paystack is final (it's already locked in per §2 above, but no
  Paystack account/keys have been created yet).

## 7. Gotchas Learned This Session (Don't Repeat These)

- `create-turbo` refuses to scaffold into a non-empty directory — scaffold into a temp
  subfolder and merge if the target dir already has files in it.
- **Migration ordering matters**: SQL functions that query a table must be defined *after*
  that table is created. The first push attempt failed for exactly this reason (helper
  functions referencing `staff` were defined before `create table staff`). Fixed in the
  current migration file, but watch for this in future migrations that add new helper
  functions.
- `supabase db push` wraps each migration in a transaction — a failed push rolls back cleanly,
  confirmed via `schema_migrations` having zero rows after the failed attempt. Safe to retry
  after fixing the SQL.
- Chrome browser automation (`claude-in-chrome` MCP) was unreliable this session — connection
  dropped repeatedly. Don't rely on it for anything time-sensitive; ask the user to copy-paste
  values directly instead when a browser tool starts flaking.
- This environment's safety layer blocks blind pushes to production (both `supabase db push`
  without a prior dry-run, and `git push` to `main` without explicit user confirmation in the
  same turn). This is correct behavior, not a bug — always dry-run/preview and get an explicit
  go-ahead before either kind of push, every time, even if it feels repetitive.
- **Table-level `GRANT`s are not implied by `RLS ENABLE` + policies, and Supabase no longer
  auto-grants them.** See §4a — this cost most of a session to discover because everything
  *looked* right (RLS enabled, policies written, migration applied clean) and failed with an
  unhelpful-until-you-know-the-cause `permission denied for table X`, from `service_role` too.
  Any future migration that adds a table needs to either rely on the `ALTER DEFAULT PRIVILEGES`
  set up in `20260711140000_grant_table_privileges.sql`, or explicitly grant if that table is
  created in a schema/role context the default privileges don't cover.
- **Local Supabase (`supabase start`, Docker) is a fast way to verify migration/auth changes
  without touching the live project or needing real credentials.** The CLI prints its own
  local anon/service_role/JWT-secret test keys — export them as shell env vars when running
  `next dev` (don't write them into `.env.local`, which should stay pointed at the live
  project) to point an app at the local stack instead. `supabase db reset` reapplies all
  migrations + seed from scratch, which is exactly what you want for testing a new migration
  before it goes anywhere near the real database.
- **Vercel's "New Project" UI is flaky under browser automation, not under normal use.**
  Symptoms hit this session: (1) the Root Directory field silently ignores typed/programmatic
  input and reverts to a placeholder — it's not a free-text field, it opens a folder-picker
  modal via its "Edit" button instead; (2) that modal sometimes didn't open on a plain
  coordinate click, but did when the same element was clicked by its accessibility-tree `ref`
  instead of raw pixel coordinates — prefer ref-based clicks over eyeballed coordinates on this
  page; (3) inside the modal, clicking a folder's **label** just expands/collapses it — you
  have to click the **radio button** itself to actually select it, then click "Continue"; (4)
  after clicking "Deploy," the page sometimes kept showing the unsubmitted form in both
  `get_page_text` and a screenshot even though the deploy *had* actually started — checking the
  team's project list (`vercel.com/<team>`) is more reliable than trusting the form page's
  apparent state. None of this reflects a real product bug, just automation friction — a human
  clicking through this UI wouldn't hit any of it.
- **A Browser-pane tab's clipboard is not the same clipboard as this machine's `pbpaste`.**
  Clicking a "Copy" button on a page open in the Browser pane does not make the value available
  to local shell commands — confirmed the hard way when `pbpaste` returned unrelated stale
  local-clipboard content after clicking "Copy" on a revealed Supabase `service_role` key. For
  any secret that must end up in a local file, have the user paste it into the chat directly
  rather than trying to bridge the two clipboards.
- **`pgcrypto` installs into the `extensions` schema, not `public`** — and a `SECURITY DEFINER`
  function's `set search_path = public` overrides the caller's inherited path (which normally
  includes `extensions`), so `crypt()`/`gen_salt()` fail inside one with a confusing
  `function crypt(text, text) does not exist` even though the same calls work fine in a plain
  session or a table-default expression. Fix: `set search_path = public, extensions` on any
  `SECURITY DEFINER` function that calls an extension-provided function. Distinct from the §4a
  grants bug — that was missing `GRANT`s, this is a `search_path` gap — but both present the
  same way ("works everywhere except inside this one locked-down function"), worth keeping as
  two separate mental checks, not one.
- **`postgres_changes` silently doesn't work on this local Supabase build — see §4b.** Cost a
  real chunk of this session to diagnose because there's no error anywhere: the client reports
  `SUBSCRIBED`, the write succeeds, nothing is ever delivered. Use Broadcast-from-Database
  (`realtime.send()` in a trigger) for any new live feature instead.
- **Realtime can be tested headlessly with a plain Node script using `@supabase/supabase-js`
  directly** — no browser needed, and this is how both Sprint 1's live-upgrade and Sprint 2's
  request/room-board broadcasts got verified this session. Two gotchas from doing this,
  specifically because a hand-rolled test script won't catch its own mistakes the way a real UI
  would: (1) the script's subscription topic string must match the trigger's/route's broadcast
  topic string *exactly* — a stray `:observer` suffix on one side and not the other looks
  exactly like "Realtime is broken" (timeout, no error) when it's actually just two different
  topics. (2) if a test flips a value to what it may already be (e.g. `status: 'vacant_clean'`
  when the row is already `vacant_clean` from a previous run), a trigger correctly guarded with
  `is distinct from` won't fire — check the row's current value first, or toggle between two
  known-different values, don't hardcode one target state across repeated runs. Also: run such
  scripts from inside an app directory (e.g. `apps/guest-web`) so Node's ESM resolver can find
  `@supabase/supabase-js` — a script sitting in the scratchpad directory can't import it.
- **A PostgREST `INSERT ... Prefer: return=representation` (i.e. calling `.select()` after
  `.insert()` in supabase-js) re-checks the inserted row against the table's SELECT policies,
  not just the INSERT policy's `WITH CHECK`.** Hit while testing guest ID uploads: a guest
  insert into `guest_id_uploads` failed with "new row violates row-level security policy" even
  though the INSERT policy's `WITH CHECK` clause was satisfied — because guests deliberately
  have no SELECT policy on that table (only reception+ can read it back), and requesting the
  row back after insert implicitly requires one. The real client code was already correct (plain
  `.insert({...})` with no `.select()` chained, which supabase-js sends as
  `Prefer: return=minimal` by default) — this was purely a test-harness artifact from adding
  `Prefer: return=representation` to a manual curl reproduction. Worth remembering for any future
  table where writers and readers are deliberately different roles: test the insert the same way
  the real client calls it (representation or minimal), not just "does the WITH CHECK clause
  pass."

## 8. How to Resume Right Now

```bash
cd /Users/truth/Developer/DHOP
npm install                                    # confirm clean install
npm run check-types && npm run lint            # confirm nothing's broken
cat apps/guest-web/.env.local                  # confirm service_role key / JWT secret situation
export DIRECT_URL=$(grep '^DIRECT_URL=' .env.local | cut -d= -f2-)
npx supabase db push --db-url "$DIRECT_URL" --dry-run   # confirm project reachable, up to date
```

To test locally instead (Docker required, no live credentials needed — see the gotchas above
for the local-key values, which are fixed/well-known for a fresh `supabase start`):

```bash
npx supabase start && npx supabase db reset    # applies every migration + seed.sql fresh
# then run each app's dev server with NEXT_PUBLIC_SUPABASE_URL etc. pointed at
# http://127.0.0.1:54321 and the local anon/service_role/JWT-secret values supabase start prints
```

Then: §5 item 9 (push the requests migration — needs a go-ahead), and after that, Sprint 3
(§15) — menus, cart, charge-to-room orders, kitchen queue. That's the actual next step; Sprint
1 and Sprint 2's exit tests both pass as of this session.
