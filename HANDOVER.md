# DHOP — Handover Note

**Read this first, before touching anything else.** This file exists so a fresh Claude Code
session (or any new contributor) can pick up exactly where the last session left off without
re-deriving context. Update it at the end of every work session — stale handover notes are
worse than none.

Last updated: 2026-07-11, end of the Vercel/Supabase infra session (scaffolding session + guest-auth session + this one).

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

## 4. What's Actually Built (Verified Working)

- Turborepo monorepo scaffolded: `apps/guest-web` (port 3000), `apps/staff-pwa` (port 3001),
  `apps/admin-web` (port 3002), all still running the generic create-turbo starter page —
  **no DHOP-specific UI exists yet in any app.**
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
  project's JWT secret, verified by PostgREST exactly like a normal Auth token. **The Edge
  Function that actually mints this JWT on QR scan does not exist yet** — this is the
  very next piece of work (§5).
- Demo/seed data applied: organization "Stormglide Demo Hotels", branch "Accra Pilot", 2 room
  categories (Standard, Deluxe Suite), 5 rooms (101–103, 201–202), one **active** stay on room
  101 (guest last name "Mensah") — room 102 is deliberately left vacant to test the "outcome B"
  no-active-stay scan flow. Room 101's `room_key` is fixed
  (`demo0000000000000000000000101a`) so it's a stable URL to test against instead of querying
  the DB for a random key every time. See `supabase/seed.sql`.
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
  - **Not yet verified against the live project** — needs `SUPABASE_SERVICE_ROLE_KEY` and the
    new `SUPABASE_JWT_SECRET` (see §3) plus the grant-fix migration pushed (§4a).

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
6. **Staff PIN auth** on `apps/staff-pwa` (§5.1) — needed before the room board (next sprint)
   is testable end-to-end with a real actor. Not started.
7. **Check-in flow doesn't exist yet** (staff-side). The exit test's "check-in upgrades the
   open page live" clause needs it, plus a Realtime subscription on `/vacant` — neither exists
   yet. Worth sequencing before or alongside staff PIN auth.
8. Only after guest + staff auth work: move to Sprint 2 (room status board + Realtime + first
   request type) per spec §15.
9. **Minor seed-data inconsistency noticed, not fixed:** `supabase/seed.sql` inserts room 101
   with `status='vacant_clean'` even though it also inserts an active stay on that room — the
   two are independent columns and nothing in the seed script reconciles them. Doesn't affect
   the scan-auth logic above (that reads `stays.state`, not `rooms.status`), but the real
   check-in flow (item 7 above) needs to flip `rooms.status` when creating a stay, and this
   seed row should probably be fixed to match once that logic exists.

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

## 8. How to Resume Right Now

```bash
cd /Users/truth/Developer/DHOP
npm install                                    # confirm clean install
npm run check-types                            # confirm nothing's broken
cat apps/guest-web/.env.local                  # confirm service_role key situation
npx supabase db push --db-url "$DIRECT_URL" --dry-run   # confirm project reachable, up to date
```

Then start on §5, item 2 (the guest-session-minting Edge Function) — that's the critical path
for everything else in Sprint 1.
