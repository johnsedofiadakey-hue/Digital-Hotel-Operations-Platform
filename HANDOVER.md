# DHOP — Handover Note

**Read this first, before touching anything else.** This file exists so a fresh Claude Code
session (or any new contributor) can pick up exactly where the last session left off without
re-deriving context. Update it at the end of every work session — stale handover notes are
worse than none.

Last updated: 2026-07-11, end of the Sprint 1 scaffolding session.

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
- **Status unconfirmed.** The project owner had a Vercel tab open but the connection between
  this Claude session and their browser never worked reliably enough to check whether a
  project exists yet. **First thing to do: ask the user, or check `vercel.com/dashboard`
  directly, whether a DHOP project already exists before creating a new one.**
- Nothing in this repo is deployed anywhere yet.

### Environment variables
- `.env.example` (committed, no real values) documents every var needed across all sprints.
- `.env.local` exists at the repo root **and** inside each of `apps/guest-web`,
  `apps/staff-pwa`, `apps/admin-web` (Next.js only auto-loads its own app-directory env file,
  hence the duplication — all four are gitignored, none are in the repo).
- Currently populated: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `DATABASE_URL`, `DIRECT_URL`.
- **Missing: `SUPABASE_SERVICE_ROLE_KEY`.** This is the single biggest blocker to writing any
  server-side code (Edge Functions, the guest-session-minting logic in particular — see §5).
  Get it from Supabase Dashboard → Settings → API → `service_role` `secret`, and fill it into
  all four `.env.local` files. **Never** prefix it with `NEXT_PUBLIC_` — that would ship it to
  the browser and defeat every RLS policy in the database.
- Paystack, FCM, Hubtel, WhatsApp/Twilio keys: not needed until Sprint 4/5, not yet collected.

---

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
- `npm install` works clean, `npm run check-types` passes across all packages, no build errors.
- Next.js pinned to `^16.2.10` in every app (bumped from the `create-turbo` default `16.2.0`,
  which had a **high-severity** DoS advisory — see `npm audit` if this ever regresses).

## 5. What's NOT Built Yet — Pick Up Here

In priority order, following the Sprint 1 exit test in spec §15 ("scan a room QR and land in a
full session; scan a vacant room and get outcome B; check-in upgrades the open page live"):

1. **Blocked on `SUPABASE_SERVICE_ROLE_KEY`** (see §3) — get this before starting anything below.
2. **Edge Function: mint a guest session JWT.** Given a `room_key`, look up the room, check for
   an active stay, and either (a) issue a signed JWT + session cookie bound to that stay
   (`guest_sessions` insert, tier `full`) or (b) return the "no active stay" state for outcome
   B. This is the crux of the whole auth model — implement every outcome in spec §4.3's table
   (A through F), not just the happy path.
3. **`apps/guest-web` scan route** (`/r/[room_key]`) that calls the Edge Function above and
   sets the session cookie, per spec §4.2–§4.3.
4. **Second-device flow** (`g.dhop.app` manual entry — name + room code) per spec §4.5,
   including the rate limiting called out there (5 attempts / 15 min / room+IP).
5. **Staff PIN auth** on `apps/staff-pwa` (§5.1) — needed before the room board (next sprint)
   is testable end-to-end with a real actor.
6. Only after guest + staff auth work: move to Sprint 2 (room status board + Realtime + first
   request type) per spec §15.

## 6. Open Decisions Still Needing the Project Owner

- Repo visibility (public vs. private) — asked, not yet answered.
- Vercel project state — never confirmed (see §3).
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
