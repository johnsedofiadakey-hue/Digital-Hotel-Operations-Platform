# DHOP — Build-Ready Specification (v2)
## Digital Hotel Operations Platform

**Status:** Build-ready. Supersedes the v1 roadmap document (`DHOP_Product_Roadmap.md`) wherever the two disagree.

**Decisions locked in this version:**

| Decision | Choice |
|---|---|
| Payments aggregator | Paystack (MoMo + cards, Ghana) |
| Staff apps | PWA only — no native apps in Phase 1–2 |
| Frontend | Next.js (guest portal, staff PWA, admin dashboard) in one Turborepo monorepo |
| Backend | Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) |
| Hosting | Vercel (frontend) + Supabase Cloud (backend), EU region |
| Push notifications | Firebase Cloud Messaging (push delivery only — no other Firebase services) |
| Guest identity unit | The **stay**, not the individual guest (Phase 1). Individual guest identity arrives with split billing in Phase 2 |
| Guest auth model | Possession-based, tiered trust. QR possession = full session; name + room = limited session |
| Check-in data capture | Minimal: last name(s), checkout date/time, optional phone. Nothing else required |
| QR codes | Static per room (opaque room key). All rotation/expiry happens server-side at the session layer |

---

## 1. What Changed From v1 (Audit Fixes)

The v1 document had one contradiction, one security hole, and one unpriced operational dependency. All are fixed in this version:

1. **QR rotation contradiction (v1 §14.10).** A printed QR cannot contain a rotating token. Fixed: the printed QR is static and encodes an opaque per-room key. The server resolves it to the *currently active stay* and issues a short-lived session. Privacy between consecutive guests is enforced in the session layer, not the paper.
2. **Weak second-device auth (v1 §3.1).** "Last name + room number" is not a secret inside a hotel. Fixed: tiered trust. A name+room login gets a *limited* session that can never touch the room bill. Only QR possession (you are physically in the room) grants folio access.
3. **Sessions bound to rooms (implied in v1).** Fixed: sessions bind to a `stay`, which survives room moves, checkout extensions, and back-to-back turnovers. The stay is the atom of the whole system.
4. **No fallback when reception hasn't checked the guest in.** Fixed: a graceful degraded page that still shows value and nudges reception, instead of a dead end (§4.3, outcome B).
5. **Missing flows.** Room moves, stay extensions, force-close, no-shows, same-day turnovers, multi-occupant rooms, the Wi-Fi chicken-and-egg, QR tamper — all now specified.

---

## 2. Core Concepts & Vocabulary

Everything below uses these words precisely. Getting these right in the schema is 80% of the architecture.

| Term | Meaning |
|---|---|
| **Organization** | A hotel owner's account. Owns one or more branches. Top of the tenant hierarchy. |
| **Branch** | One physical property (hotel, guesthouse, restaurant). Has its own staff, menus, rooms, settings. |
| **Zone** | Optional grouping inside a branch (wing, floor, building). Purely organizational. |
| **Room Category** | Standard / Deluxe / Suite etc. Drives menu visibility, pricing, and request priority. |
| **Room** | A physical room. Has a permanent opaque `room_key` (printed in its QR) and exactly one live status. |
| **Stay** | One occupancy of one party in the hotel, from check-in to checkout. **The atom of guest identity in Phase 1.** Points at a room (can change via room move). Owns the folio, the chat thread, and all guest sessions. |
| **Guest Session** | One device's access to a stay. Has a trust tier (`full`, `limited`, `post_stay`). Multiple sessions per stay. |
| **Folio** | The stay's running bill. Line items come from orders, services, and adjustments. |
| **Request** | A guest ask routed to a department: housekeeping, maintenance, laundry, concierge. Has an SLA clock. |
| **Order** | A F&B order with line items, a payment state, and a kitchen state. |
| **Staff member** | One person, one record, regardless of how they log in (PIN, OTP, password). Every action is attributed to a staff ID. |

---

## 3. The Stay Lifecycle (Backbone of the System)

Every guest-facing behavior hangs off the stay's state. Reception's check-in/check-out actions are what create and destroy guest access — which means **staff adoption quality directly controls guest login quality**. The system is designed to survive imperfect staff behavior (see guards below).

### 3.1 Stay States

```
reserved ──► active ──► checked_out
   │            │
   ▼            ▼
no_show    force_closed
```

| State | Meaning |
|---|---|
| `reserved` | Booking exists, guest not yet arrived. Optional — walk-ins skip it. |
| `active` | Guest is checked in. QR resolves to this stay. Folio open. |
| `checked_out` | Normal end. Folio settled (or flagged). Sessions downgrade to `post_stay`. |
| `force_closed` | Abnormal end by staff (e.g., stale stay discovered at next check-in). Audited, manager notified. |
| `no_show` | Reserved stay that never activated. Swept automatically at a configurable cutoff (default: 6:00 AM the next day). |

### 3.2 Transitions — Every One Specified

**Check-in (walk-in or from reservation) → `active`**
- Reception enters: last name (required), any additional occupant last names (optional), phone (optional, strongly encouraged — unlocks OTP recovery and WhatsApp links), checkout date + time (required, defaults to the branch's standard, e.g. 11:00).
- Target: under 60 seconds at the desk. Every extra required field is an adoption tax — resist adding any.
- **Guard (critical):** if the room already has an `active` stay, check-in is blocked until that stay is explicitly force-closed. The force-close is one tap + a reason, logged to the audit trail, and notifies the branch manager. This makes "reception forgot to check out room 204" impossible to silently compound — the new guest can never land in the previous guest's session.
- Room status: → `Occupied`. Room's QR now resolves to this stay.

**Extend stay / late checkout**
- `checkout_due` is a mutable field on the stay. Reception edits it directly; guest-requested late checkout (portal feature) becomes a request that, when approved, updates the same field.
- All session expiries follow `checkout_due` automatically. Nothing else to update. The system must honor its own late-checkout approvals — this is why expiry is computed from the stay, never stored per-session.

**Room move (guest changes rooms mid-stay)**
- This is common (broken AC, noise complaint, upgrade). One operation: `stay.room_id` changes.
- Because sessions, folio, and chat bind to the stay — not the room — **nothing else changes for the guest.** Their phone session keeps working; their bill is intact.
- Old room: status → `Vacant & Dirty`, housekeeping task auto-created. Its QR now resolves to "no active stay."
- New room: status → `Occupied`. Its QR resolves to this stay from the moment of the move.

**Checkout → `checked_out`**
- Triggered by reception, or by the guest via express checkout (full-trust session only, folio must be at zero balance or paid in the same action).
- Effects, in order: folio closes (unsettled balance flags a reception task, checkout is *not* blocked — never trap a guest in the lobby over a system state); all guest sessions downgrade to `post_stay` tier for 48 hours (receipt + feedback only); room → `Vacant & Dirty`; housekeeping task auto-created; feedback request sent (portal + WhatsApp if phone on file).
- Same-day back-to-back turnover works automatically: checkout is an *event*, not an end-of-day batch. The 13:00 arrival checks into a room whose 11:00 checkout already closed the previous stay.

**Force-close → `force_closed`**
- Available to Reception and above. Requires a reason. Kills all sessions immediately. Notifies branch manager. Exists so the check-in guard (above) always has an exit path.

**No-show sweep → `no_show`**
- Edge Function cron. Releases the room (`Reserved` flag cleared).

---

## 4. Guest Access — Full Specification

### 4.1 Design Principles

1. **Possession-based auth.** Being physically inside the room (able to scan its QR) is the credential. No passwords, no accounts, no app.
2. **Tiered trust.** Weaker proofs get weaker capabilities. The line is drawn at money: *nothing that touches the folio is reachable without QR possession.* This kills the charge-to-someone-else's-room fraud completely, at zero friction for the honest path.
3. **Fail soft.** Every failure state shows something useful and routes the guest toward resolution. A dead-end error at the moment of first scan is a lost customer.

### 4.2 QR Anatomy

- Each room's printed QR encodes: `https://g.dhop.app/r/{room_key}`
- `room_key` is an opaque random 22-character identifier (128-bit entropy). It reveals nothing, and other rooms' keys cannot be guessed or enumerated.
- The key is **static** — printed once on a branded tent card. It is regenerable per room (manager action, e.g. after suspected compromise), which requires reprinting that one card.
- On scan, the server exchanges the key for a session cookie (httpOnly) and redirects to a clean URL, so the raw key doesn't linger in shared browser history any longer than necessary. Note the honest limitation: anyone the guest forwards the raw URL to *during the stay* can open a full session — mitigated by the device cap, the connected-devices list, and revocation (§4.6). This is the same trust level as handing someone your room key card, which is the correct mental model.
- **The tent card carries three things:** the portal QR, the Wi-Fi credentials (printed, plus a Wi-Fi QR), and a no-camera fallback line: *"No camera? Visit g.dhop.app and enter room code ACCRA-204."* Printing the Wi-Fi password on the card solves the chicken-and-egg (the portal can't be the only place the Wi-Fi password lives, because you need Wi-Fi to reach the portal).

### 4.3 Scan Outcomes — Every Case Enumerated

| # | Server finds | Guest sees | System does |
|---|---|---|---|
| A | Active stay on this room | Portal home, full-trust session | Issue `full` session cookie bound to stay; log device |
| B | No active stay (vacant / not yet checked in) | Read-only portal: menus, hotel info, Wi-Fi help — plus *"Staying in this room? Tap here and we'll notify reception."* | Tap creates a reception task with the room number. When reception completes check-in, the guest's open page upgrades to a full session **live** (Realtime push) — no rescan needed. This converts the most common staff lapse (late check-in entry) from a broken first impression into a self-correcting nudge. |
| C | Room is `Out of Order` | Apology page + "contact front desk" | Notify reception that someone scanned an OOO room's code |
| D | Unknown / invalid room key | Generic "code not recognized — please contact the front desk." Deliberately vague. | Log a security event (possible tampered/foreign sticker). Repeated hits from one source → alert manager |
| E | Active stay, but device cap reached (default 5 devices/stay) | "Device limit reached — remove a device from a connected phone, or ask reception." | No session issued. Reception can raise the cap per stay |
| F | Stay recently checked out, scanner has an existing session | Post-stay page: receipt + feedback | Session already downgraded to `post_stay` (48 h) |

Outcome B is the single most important screen in the product for pilot survival. Build it early, make it good.

### 4.4 Trust Tiers — Capability Matrix

| Capability | `full` (QR scan) | `limited` (name + room) | `post_stay` (48 h after checkout) |
|---|---|---|---|
| Browse menus, hotel info, local guide | ✓ | ✓ | ✓ |
| Housekeeping / maintenance / laundry requests | ✓ | ✓ | — |
| Chat with reception/concierge | ✓ | ✓ (same stay thread) | — |
| F&B order — **pay now** (MoMo/card upfront) | ✓ | ✓ | — |
| F&B order — **charge to room** (folio) | ✓ | — | — |
| View live bill / folio | ✓ | — | — |
| Express checkout | ✓ | — | — |
| DND toggle, late-checkout request | ✓ | — | — |
| Tipping (pay-now by nature) | ✓ | ✓ | — |
| View receipt, leave feedback | ✓ | — | ✓ |

The rule that generates this table: **limited trust can do anything that is free or paid upfront; only full trust touches the folio.** A fraudster who overhears a name and room number can, at worst, buy the victim a paid-for meal. Nothing needs configuring, no thresholds to tune, and the honest second-device user (partner's phone) barely notices — until they try to see the bill, at which point the portal explains: *"To view the bill, scan the QR code in your room, or ask the person who scanned it to approve this device."*

### 4.5 Second Device Flow

Entry: `g.dhop.app` → enter property room code (e.g. `ACCRA-204`) + last name. Checks against the active stay's recorded last names (case/whitespace-insensitive).

- Match → `limited` session.
- Upgrade paths to `full`, any of: **(a)** scan the room QR from that device (instant, the default answer); **(b)** approval prompt pushed to an existing full-trust device — "Allow this device full access?"; **(c)** OTP to the phone on file, if one was captured at check-in.
- No match → generic failure (never reveal whether the room is occupied or which part didn't match).
- **Rate limits (this endpoint is the abuse surface):** 5 attempts per 15 min per room *and* per source IP; on limit, lock the room's manual entry for 15 min and notify reception. All attempts logged as security events.

### 4.6 Session Lifecycle

- Cookie-based, httpOnly, device labeled (e.g. "Chrome on Android"). Persists for the whole stay — a guest should scan **once** and stay signed in through the stay. Re-opening the browser two days later still works.
- Expiry = `stay.checkout_due` (+ grace), recomputed live — extensions and late checkouts propagate automatically; nothing per-session to update.
- On checkout / force-close: all sessions downgrade to `post_stay` (48 h), then die.
- **Connected-devices screen** (full trust): list all sessions on the stay, revoke any. Reception can also revoke all sessions on a stay.
- Device cap default 5 per stay, adjustable per stay by reception.

### 4.7 Physical QR Integrity

- QR cards live **inside rooms only** — never in hallways (hallway QRs invite scanning-by-passersby and sticker-swap tampering).
- Branded, framed tent card design that makes an overlay sticker visually obvious.
- Housekeeping's room checklist includes "QR card present and intact" — one checkbox, catches tamper and loss.
- Guests with no smartphone: nothing breaks — the phone on the nightstand and the front desk still exist. DHOP augments; it must never be the only channel.

---

## 5. Staff Access — Full Specification

One staff record per person; login method varies by context. Every action in the system is attributed to a staff ID regardless of login method — the audit trail does not care how you signed in.

### 5.1 Shared Department Tablets (Kitchen, Housekeeping station, Reception desk)

- 4-digit PIN tap-in. PINs unique **per branch** (creation flow rejects collisions and asks for a different PIN).
- 5 wrong attempts → that tablet locks PIN entry for 5 minutes + manager alert. (Brute-force math: 10,000 combinations at 5-per-5-minutes is not a real attack; the alert is the real defense.)
- Idle auto-logout, configurable per station (default 5 min; a kitchen screen that mostly *displays* the queue can be longer — display is passive, actions require the PIN identity).
- PIN reset: manager action, instant.

### 5.2 Personal Mobile (Housekeeping / Maintenance walking the property)

- Supabase Auth phone OTP. Session persists on the device (30-day refresh) until logout, offboarding, or manager revocation.

### 5.3 Office Roles (Reception accounts, Finance, Managers, Owner, Super Admin)

- Supabase Auth email + password.
- **MFA (TOTP) required — not optional — for Owner and Super Admin.** Optional for other office roles. These two roles can see everything; "optional" MFA on them is a breach headline waiting to happen.

### 5.4 Offboarding

Deactivating a staff member: kills all sessions and PINs immediately, unassigns their open tasks back to the department pool, keeps their historical attribution intact (audit history is never rewritten).

### 5.5 Role-Based Access Matrix

Enforced twice: RLS policies at the data layer (the real wall) and UI visibility (the polite wall). Never trust the UI alone.

| Role | Guest data & chat | Folio / billing | Orders (F&B) | Housekeeping | Maintenance | Activities | Reports | Staff mgmt | Settings |
|---|---|---|---|---|---|---|---|---|---|
| Kitchen | — | — | own branch queue | — | — | — | — | — | — |
| Housekeeping | requests only | — | — | own tasks + room board | create tickets | — | — | — | — |
| Maintenance | requests only | — | — | room board (status) | own queue | — | — | — | — |
| Reception | ✓ branch | ✓ branch | view | room board | create tickets | view | basic | — | — |
| Concierge | ✓ branch (chat inbox) | — | view | request routing | create tickets | view | — | — | — |
| Finance | — | ✓ branch | view totals | — | — | view revenue | financial | — | — |
| Dept. Manager | dept-relevant | — | dept | dept | dept | dept | dept performance | own dept | — |
| Branch Manager | ✓ branch | ✓ branch | ✓ | ✓ | ✓ | ✓ | branch | branch | branch |
| Owner | ✓ own org | ✓ own org | ✓ | ✓ | ✓ | ✓ | all branches | all branches | org |
| Super Admin | — (support mode only, logged) | subscription billing only | — | — | — | — | platform health | — | platform |

Multi-property: Branch Managers see one branch unless the Owner grants more; Owners see all their branches with a property switcher after login. Super Admin never browses guest personal data in normal operation; support access is an explicit, logged, time-boxed mode.

---

## 6. Property & Room Model

### 6.1 Hierarchy

```
Organization
  └── Branch
        └── Zone (optional)
              └── Room Category
                    └── Room  (one room_key, one live status)
```

Each level carries settings: branches own staff/menus/pricing; categories drive menu visibility, exclusive items, and request priority (suite requests auto-flag high priority); rooms own their QR and status.

### 6.2 Room Status Machine

Statuses: `Vacant & Clean` · `Vacant & Dirty` · `Occupied` · `Occupied & DND` · `Out of Order`. ("Reserved / arriving today" is a **derived flag** from today's `reserved` stays, not a stored status — storing it invites drift.)

| Transition | Trigger | Actor |
|---|---|---|
| V&C → Occupied | Check-in | Reception (system applies) |
| Occupied → V&D | Checkout / room-move-out | System |
| V&D → V&C | Cleaning complete (+ optional inspection step, per-branch config: V&D → cleaned → inspected → V&C) | Housekeeping |
| Occupied ⇄ Occupied&DND | DND toggle | Guest (portal) or Housekeeping |
| V&C / V&D → OOO | Fault taken out of service | Maintenance / Manager |
| Occupied → OOO | **Not allowed directly** — requires a room move first (a guest is in there) | — |
| OOO → V&D | Repair done (always needs a clean after works) | Maintenance closes ticket |

Everyone — Reception, Housekeeping, Maintenance — reads and writes this one live board over Supabase Realtime. This board *is* the product's core value: one shared truth instead of phone calls.

---

## 7. Guest Portal — Journey With Edge Cases

Phase tags: **[P1]** = MVP, **[P2]** = Phase 2, **[P3+]** = later. Unmarked = P1.

### 7.1 Before Arrival [P2]
Pre-arrival form (ID upload, arrival time, requests), upsells (upgrade, airport pickup, early check-in), advance info (Wi-Fi, directions, house rules). Requires phone/email capture at booking — depends on the reservation calendar [P3] or manual send.

### 7.2 Arrival
- Scan QR → portal (all outcomes in §4.3).
- Welcome screen: guest's language choice **first** if multi-language is enabled [P2 for full translations; P1 ships English with the language switcher scaffolded], then quick links.
- Contactless check-in / digital registration card [P2] — Phase 1 check-in happens at the desk (60-second flow, §3.2).

### 7.3 During the Stay
- **F&B ordering** — menu (per room category), cart, pay-now or charge-to-room (trust-gated, §4.4). Sold-out items disappear from all guest devices the moment the kitchen toggles them (Realtime).
- **Housekeeping requests** — towels, cleaning now, supplies. DND toggle (full trust) flips the room board live; housekeeping never knocks on a DND room — the board is the source of truth, not the door hanger.
- **Maintenance requests** — description + photo upload (compressed client-side; Ghana data reality).
- **Laundry requests.**
- **Live chat** with reception/concierge — one thread per stay. WhatsApp-originated messages land in the same staff inbox [P1 for inbound WhatsApp channel].
- **Live bill view** (full trust) — every folio line as it happens. Kills the checkout-surprise dispute.
- **Late checkout request** → approval updates `checkout_due` → sessions auto-extend (§3.2).
- **Local recommendations / hotel info.**
- **Tipping** [P2] — pay-now by nature, available at both trust tiers.
- **Activities booking** [P2] — see §10.
- **Lost item reporting** [P2].
- Low-data reality [P1 by design, not a mode]: portal ships image-light, compressed, small bundles; must be usable on a 3-year-old Android on 3G. **Scan-to-interactive under ~3 seconds on 3G is a hard performance budget** — the first load *is* the login screen, and a slow one means the guest never scans again.

### 7.4 Departure & After
- **Express checkout** (full trust): pay balance via MoMo/card → stay closes → receipt. If payment fails, guest is routed to the desk — checkout is never blocked by a gateway error at the guest's expense (§3.2).
- Digital receipt — lives at a stable link, also sent by WhatsApp/SMS if phone on file (receipts must outlive the 48 h post-stay session).
- Feedback request immediately post-checkout: **private-first** — unhappy feedback routes to the hotel and opens an escalation; happy guests get nudged to Google/TripAdvisor [P3 for the redirect automation, P1 for private feedback].

---

## 8. Requests & Orders — Operational Flows

### 8.1 Request Lifecycle

```
submitted ──► claimed/assigned ──► in_progress ──► done ──► confirmed
     │                                               │
     └────────── cancelled (guest, pre-claim)        └──► reopened (guest, within 2 h)
```

- **Routing (P1: simple):** request type → department pool for that branch; any staff in the pool claims it. Workload-balanced auto-assignment is [P3] — do not build it early; pools are how small hotels actually work.
- **Priority:** room category can auto-flag (suite = high). Staff can escalate manually.
- **Auto-confirm:** if the guest doesn't confirm or reopen within 2 h of `done`, it confirms silently.
- **SLA clocks (per request type, per branch, configurable; defaults):** housekeeping 15 min to claim / 45 min to done; maintenance 30 min to claim, urgent 15; laundry 30 min to claim. Breach #1 → department manager notified. Still unclaimed/undone after a second interval → branch manager. Implemented as an Edge Function sweep every minute (§14.6) — no always-on server.

### 8.2 Order Lifecycle (F&B)

Kitchen state and payment state are **orthogonal** — never conflate them.

Kitchen: `placed → acknowledged → preparing → ready → delivered`
Payment: `charge_to_room | pending | paid | failed | refunded`

- Guest cancel: allowed until `acknowledged`. After that, cancellation is a kitchen action (with reason).
- Kitchen cancel (e.g. actually out of stock): if the order was paid → **automatic refund**, guest notified with apology; if charged to room → folio line removed. The sold-out toggle then flips availability everywhere instantly.
- An order reaches the kitchen queue **only** when payment state is `paid` or `charge_to_room`. Pending-payment orders are invisible to the kitchen — cooks never see food that isn't funded.
- Delivery confirmation closes the loop; delivered + paid/charged posts the folio line (charge-to-room posts at placement, flagged until delivered).

### 8.3 Department Portal Notes (deltas from v1 — v1 §7 otherwise stands)

- **Kitchen:** live queue (Realtime + sound + push), per-item prep timers, sold-out toggle, delivery confirmation. Stock alerts [P2].
- **Housekeeping:** task list = auto-generated (checkouts, room moves) + guest requests + scheduled cleans. Room checklist includes the QR-card integrity check (§4.7). Lost & found log [P2].
- **Maintenance:** ticket queue with priority; closing an OOO ticket transitions the room per §6.2; recurring-issue flag (same room, same category, 3× in 90 days → surfaced to manager).
- **Reception:** room board, check-in/out (with the force-close guard), stay management (extend, move, device cap/revoke), chat inbox, folio view, the outcome-B nudge tasks.
- **Concierge/Guest Relations [P2 as separate portal]:** in P1, chat lands in Reception's inbox.
- **Finance [P2]:** folio depth, split billing, deposit holds, reconciliation reports. P1 gives Reception basic folio + Paystack's own dashboard for reconciliation.

---

## 9. Payments — Paystack, MoMo-First

### 9.1 Methods & Contexts

- **Pay-now** (guest portal): MoMo (MTN, Telecel/Vodafone Cash, AT Money) and cards, via Paystack Charge. Available at both trust tiers.
- **Charge-to-room**: no gateway involved — a folio line. Full trust only. Settled at checkout (or anytime from the live bill view).
- **Deposits / incidental holds [P2]:** collected as a real charge at check-in and refunded at checkout (Paystack refund), because MoMo has no card-style auth-hold. Spec'd now so the folio model reserves space for it; not built in P1.

### 9.2 The MoMo Async Flow — Every Outcome

MoMo is not synchronous like a card. The guest gets a USSD/app prompt on their phone and may approve in 5 seconds or 5 minutes, or never. The UI must be built around this.

```
Guest taps Pay → Paystack charge created → order payment = pending
→ portal shows "Approve the prompt on your phone" + live status
```

| Outcome | Detection | System behavior |
|---|---|---|
| Approved | Paystack webhook `charge.success` | payment → `paid`; order → kitchen queue; guest sees confirmation |
| Webhook delayed/lost | Poll Paystack verify API at 30 s, 60 s, then every 60 s up to 15 min | Same as approved, from whichever signal lands first (idempotent by reference — double signal must not double-fulfill) |
| Declined / insufficient funds | Webhook / verify | payment → `failed`; guest offered retry or different method; order never reaches kitchen |
| Guest abandons (no action) | 15 min timeout | payment → `failed` (expired); order auto-cancelled; guest notified |
| **Late success** (guest approved after timeout) | Webhook after expiry | **Auto-refund, notify guest.** Never keep money for food that was never queued. If kitchen is open and it's < 15 min late, alternative is to revive the order — pick one behavior and keep it: refund is the safer default, revive is a config flag later |
| Double payment (guest retried, both succeeded) | Two `charge.success` for one order | Fulfill one, auto-refund the other, log for reconciliation |
| Refund needed (kitchen cancel etc.) | Staff action | Paystack refund API; folio/receipt updated; guest notified. MoMo refunds can take time to land — the guest-facing message says so honestly |

**Idempotency rule:** every Paystack reference maps to exactly one order; webhook and verify handlers are idempotent on that reference. This single rule prevents the entire double-fulfillment class of bugs.

### 9.3 Reconciliation [P1-lite, P2-full]

P1: daily revenue summary per branch (orders by payment method) that Finance can eyeball against the Paystack dashboard. P2: automated matching (system records ↔ Paystack settlements ↔ cash declared) with a discrepancy list.

---

## 10. Activities & Facilities Booking [P2]

Unchanged in scope from v1 §5 (capacity-based slots, live calendar, staff assignment, master calendar, deposits for high-value bookings). Two build-ready additions:

1. **Double-booking prevention is transactional, not visual.** Slot capacity is enforced by a database constraint/atomic claim at booking time — two guests tapping the last spa slot simultaneously must produce exactly one booking and one polite "just missed it." Never rely on the calendar UI having been fresh.
2. **Cancellation/no-show policy fields** (cutoff time, deposit forfeiture) live on the activity from day one, even if P2 UIs only half-use them — retrofitting policy onto live bookings is painful.

---

## 11. Notifications & Escalation

Channels: portal in-app (Realtime), push (FCM via PWA), SMS (Hubtel), WhatsApp (Business API — start with Twilio for pilot speed, evaluate 360dialog at scale for cost).

| Event | Recipient | Channels |
|---|---|---|
| New order | Kitchen station | Realtime + push + audible chime (a silent kitchen tablet is a dead kitchen tablet) |
| Order status change | Guest | Portal; WhatsApp if opted in |
| New request | Department pool | Realtime + push |
| SLA breach 1 / 2 | Dept manager / Branch manager | Push; SMS if unacknowledged after 10 min |
| Outcome-B nudge ("guest waiting in room X") | Reception | Realtime + push |
| Check-in guard force-close | Branch manager | Push |
| Security events (rate-limit lock, invalid QR spike) | Branch manager | Push |
| Payment failure spike / webhook silence > 30 min | Platform (Super Admin) | Internal alert |
| Checkout reminder (morning of) | Guest | Portal + WhatsApp/SMS |
| Feedback request | Guest | WhatsApp/SMS link post-checkout |

Rules: notifications deduplicate (one chime per order, not per line item); guest-facing messages always prefer WhatsApp over SMS when both exist (cost + Ghana habit); every guest message channel is opt-in at capture time.

---

## 12. Offline & Degraded Network

**Staff PWA (housekeeping/maintenance especially):**
- Task list cached locally (IndexedDB). Actions taken offline (mark clean, close ticket, claim request) enter a local queue, each with a client-generated idempotency key, and replay in order on reconnect.
- Conflict rule: server applies last-write-wins on status fields **but** flags semantically dangerous conflicts to the department manager instead of silently resolving — e.g. a room marked clean offline while a new stay already activated on it. LWW for the boring cases, human review for the scary ones.
- The UI always shows sync state ("3 actions waiting to sync") — staff must never wonder whether their work counted.

**Kitchen tablets:** effectively online-only (orders originate elsewhere) — on disconnect, show a full-screen "offline — reconnecting" banner so staff know to watch for missed orders, and refetch the queue snapshot on reconnect.

**Guest portal:** no offline mode (its data is inherently live). App shell cached for fast repeat loads; image-light by design.

**Realtime reconnect rule (global):** on any websocket reconnect, refetch a fresh snapshot of the subscribed data (order queue, room board) rather than trusting the stream resumed losslessly. Reconcile-on-reconnect, always.

---

## 13. Security, Privacy & Data Retention

- **RLS on every table, no exceptions.** Every row carries `organization_id` + `branch_id`. A bug in app code must be incapable of leaking one hotel's data to another.
- **Audit log from day one:** who did what, when, to which entity (check-ins, force-closes, price edits, room status changes, folio adjustments, PIN resets, support-mode access). Append-only.
- **Security events table:** invalid QR hits, rate-limit trips, failed PIN bursts, second-device failures. Feeds manager alerts.
- **Guest ID uploads [P2]:** Supabase Storage, Reception-role-only access, every access logged, auto-deleted 30 days post-checkout (configurable).
- **Retention defaults (configurable per org; Ghana Data Protection Act, 2012 — Act 843 applies):**

| Data | Guest-visible | Hotel-side retention |
|---|---|---|
| Chat threads | During stay + 48 h post-stay | 90 days, then purged |
| Folio / receipts / payment records | Receipt link: durable | 6 years (align with Ghana tax record-keeping) |
| Guest name/phone on a stay | — | 12 months, then anonymized (stay stats survive, identity doesn't) |
| Guest profile memory [P2] | Opt-in at checkout | Until guest deletion request (Act 843 right) |
| ID documents [P2] | — | 30 days post-checkout |
| Audit log | — | 2 years |
| Security events | — | 1 year |

- A retention-purge Edge Function runs daily. Retrofitting retention onto live data is miserable — ship the purge job in P1 even while every window is still comfortably in the future.

---

## 14. Technical Architecture

### 14.1 Stack (locked)

Next.js on Vercel · Supabase (Postgres, Auth, Realtime, Storage, Edge Functions), EU region · Paystack · FCM push · Hubtel SMS · WhatsApp Business API (Twilio → evaluate 360dialog) · Turborepo monorepo.

Latency note stands from v1: no Africa region on Vercel/Supabase yet; EU is closest. Hotel ops tolerate a few hundred ms fine — this is not fast-twitch software. Revisit if either provider opens an African region.

### 14.2 Monorepo Layout

```
dhop/
  apps/
    guest-web/        # guest portal (Next.js) — g.dhop.app
    staff-pwa/        # all department portals + PWA/offline layer
    admin-web/        # branch manager, owner, super admin dashboards
  packages/
    shared/           # types, API client, design system (Satoshi/Inter), request/order state machines
    db/               # migrations, RLS policies, seed data
  supabase/
    functions/        # edge functions (below)
```

### 14.3 Core Schema (entities and load-bearing fields — full SQL comes with Sprint 1)

| Table | Load-bearing fields | Phase |
|---|---|---|
| `organizations`, `branches`, `zones`, `room_categories` | hierarchy + per-level settings | P1 |
| `rooms` | `room_key` (unique, opaque), `status`, `category_id` | P1 |
| `stays` | `state`, `room_id`, `last_names[]`, `phone?`, `checkin_at`, `checkout_due`, `closed_at`, `closed_reason` | P1 |
| `guest_sessions` | `stay_id`, `tier`, `device_label`, `revoked_at` (expiry computed from stay) | P1 |
| `staff`, `roles`, `staff_roles`, `staff_pins` | attribution + RBAC + per-branch PIN uniqueness | P1 |
| `menu_sections`, `menu_items` | `available` (the sold-out toggle), category visibility rules | P1 |
| `orders`, `order_items` | kitchen state + payment state (orthogonal), `paystack_ref` (unique) | P1 |
| `payments` | `provider_ref` unique, state, idempotent webhook handling | P1 |
| `requests` | type, state, priority, SLA timestamps, `claimed_by` | P1 |
| `folios`, `folio_lines` | one folio per stay; lines from orders/services/adjustments | P1 (lite) |
| `audit_log`, `security_events` | append-only | P1 |
| `activities`, `activity_slots`, `bookings` | capacity, atomic slot claim, cancellation policy fields | P2 |
| `guests` (profile memory), `shift_notes`, `deposits` | | P2 |

### 14.4 Realtime Channels

Per-branch channels, RLS-scoped: room board · kitchen order queue · department request pools · per-stay channel (order status, chat, the outcome-B live upgrade). Rule: Realtime is a *notification* transport; state of record is always Postgres, and clients reconcile-on-reconnect (§12).

### 14.5 Guest Auth Implementation Note

Guests are **not** Supabase Auth users (no throwaway account cleanup problem). Guest sessions are first-class rows in `guest_sessions`; the cookie carries a signed session token; RLS policies for guest-facing queries key off the session → stay → branch chain. Staff use Supabase Auth natively.

### 14.6 Edge Functions

`paystack-webhook` (idempotent) · `payment-verify-poller` · `sla-monitor` (1-min cron) · `no-show-sweeper` · `session-expiry-sweeper` · `checkout-reminders` · `feedback-sender` · `notification-fanout` (FCM/SMS/WhatsApp routing table §11) · `whatsapp-inbound` (webhook → chat thread) · `retention-purge` (daily) · `daily-revenue-rollup`.

---

## 15. Phase 1 Build Order (Sprint-by-Sprint)

Setup (Supabase project, Vercel, Turborepo scaffold) runs in parallel — your side.

**Sprint 1 — The spine.** Schema + RLS + seed hotel. Stay lifecycle (all §3.2 transitions incl. force-close guard). Guest QR auth end-to-end: scan → all six outcomes of §4.3, sessions, tiers, device list. *Exit test: on a seeded hotel, scan a room QR and land in a full session; scan a vacant room and get outcome B; check-in upgrades the open page live.*

**Sprint 2 — The live board.** Room status machine + Realtime board. Staff PIN auth + idle logout. Requests (housekeeping/maintenance/laundry) full lifecycle with claiming. *Exit test: guest requests towels on one phone; housekeeping tablet chimes, claims, completes; guest sees it live; room status flips propagate to two devices at once.*

**Sprint 3 — Food.** Menus (category-driven visibility), cart, charge-to-room orders, kitchen queue with sound, sold-out toggle, delivery confirmation, folio lines. *Exit test: order placed → kitchen chime → delivered → line visible on live bill; toggle an item sold-out and watch it vanish from an open guest menu.*

**Sprint 4 — Money.** Paystack pay-now with the full §9.2 outcome matrix (pending UI, webhook + verify poller, refund paths, idempotency). Receipts. Express checkout. *Exit test: every row of the §9.2 table exercised against Paystack test mode, including the double-payment and late-success rows.*

**Sprint 5 — Operations hardening.** Notification fanout (FCM, WhatsApp inbound chat, SMS), SLA monitor + escalation, branch manager dashboard (occupancy, requests, response times), audit log surfacing, offline queue for the staff PWA, rate limiting, retention-purge job. *Exit: pilot-readiness checklist below.*

**Pilot-readiness checklist:** 3-second 3G first load hit on a real budget Android · all §4.3 outcomes demoed · force-close guard demoed · a full day's simulated service (20 orders, 15 requests) with zero lost events across a deliberate Wi-Fi cut · Paystack live keys + one real GHS 1 MoMo transaction round-tripped incl. refund · reception 60-second check-in achieved by a non-technical tester · tent cards printed for every pilot room (QR + Wi-Fi + fallback code).

---

## 16. Commercial Tiering

Unchanged from v1 §12 (4 tiers + add-ons: Order / Essentials / Growth / Enterprise, split by operational complexity, priced within tier by room count). One mapping note: the trust-tier and stay architecture above is identical across all tiers — tiers gate *features*, never *security*. Tier 1 (restaurant-only) uses the same order/payment machinery with table QRs instead of room QRs: a `table` is modeled as a room with category "table" and no stay lifecycle — pay-now only, which falls out of the trust model automatically (no stay → no folio → no charge-to-room). The architecture collapses this tier into config, not a fork.

## 17. Open Items (Business, Non-Blocking)

1. **Pricing per tier** for Ghana/West Africa — needs local willingness-to-pay research.
2. **Pilot hotel selection** (2–3 properties, ideally 10–40 rooms, single branch) — their reality will pressure-test §4.3 outcome B and the 60-second check-in more honestly than any spec review.
3. WhatsApp provider final call (Twilio pilot → 360dialog at scale is the working default).
4. Whether reserved-stay/booking entry ships in P1-lite (manual reservation rows so the "arriving today" flag works) — recommended yes, it's cheap; the full booking calendar stays P3.

## 18. Coverage Checklist

| Concern | Where |
|---|---|
| QR/rotation contradiction fixed | §1.1, §4.2 |
| Second-device fraud hole closed | §4.4, §4.5 |
| Sessions survive room moves / extensions / turnovers | §3.2, §4.6 |
| Reception-lapse failure modes | §3.2 guard, §4.3 outcome B |
| Every scan outcome enumerated | §4.3 |
| Every stay transition specified | §3.2 |
| Room status machine with actors | §6.2 |
| Request + order state machines | §8 |
| MoMo async payment, every outcome incl. refund/double-pay | §9.2 |
| Notifications & escalation routing | §11 |
| Offline behavior + conflict rules | §12 |
| Retention numbers + Act 843 | §13 |
| Schema, channels, edge functions | §14 |
| Sprint-by-sprint build order with exit tests | §15 |
| Wi-Fi chicken-and-egg, QR tamper, no-smartphone guests | §4.2, §4.7 |
| Restaurant tier collapses into the same architecture | §16 |
