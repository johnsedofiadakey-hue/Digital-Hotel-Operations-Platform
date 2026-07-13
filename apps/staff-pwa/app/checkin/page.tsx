import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";
import { getAuthenticatedStaff, CHECKIN_CAPABLE_ROLES } from "../../lib/staff-session";

interface RoomRow {
  id: string;
  label: string;
}

interface BlockedStayRow {
  id: string;
  last_names: string[];
}

interface ReservationRow {
  id: string;
  guest_name: string;
  party_size: number;
  notes: string;
  pre_registration: { full_name: string; phone: string; notes: string } | null;
}

function defaultCheckoutValue(): string {
  // "defaults to the branch's standard, e.g. 11:00" (§3.2) — there's no
  // per-branch standard-checkout-time setting yet, so this is a flat
  // tomorrow-11:00 default until that's built (admin-web, later).
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(11, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
}

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    roomId?: string;
    roomLabel?: string;
    stayId?: string;
    success?: string;
  }>;
}) {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());
  if (!staff) redirect("/pin");

  if (!staff.branchId || !CHECKIN_CAPABLE_ROLES.has(staff.roleKey)) {
    return (
      <MessagePage title="Check-in">
        <p>Your role ({staff.roleKey}) doesn&apos;t check guests in.</p>
      </MessagePage>
    );
  }

  const { error, roomId, roomLabel, stayId, success } = await searchParams;

  const { data: activeStays } = await db
    .from("stays")
    .select("room_id")
    .eq("branch_id", staff.branchId)
    .eq("state", "active");
  const occupiedRoomIds = new Set((activeStays ?? []).map((s) => s.room_id as string));

  const { data: allRooms } = await db
    .from("rooms")
    .select("id, label")
    .eq("branch_id", staff.branchId)
    .neq("status", "out_of_order")
    .order("label");
  const vacantRooms = ((allRooms ?? []) as RoomRow[]).filter((r) => !occupiedRoomIds.has(r.id));

  let blockedStay: BlockedStayRow | null = null;
  if (error === "occupied" && stayId) {
    const { data } = await db
      .from("stays")
      .select("id, last_names")
      .eq("id", stayId)
      .maybeSingle<BlockedStayRow>();
    blockedStay = data ?? null;
  }

  // §17 "arriving today" flag + §7.2 contactless pre-registration — informational only, this
  // never pre-fills or auto-submits the check-in form below. Reception reads it, types the same
  // 60-second form they always would.
  const today = new Date().toISOString().slice(0, 10);
  const { data: arrivingToday } = await db
    .from("reservations")
    .select("id, guest_name, party_size, notes, pre_registration")
    .eq("branch_id", staff.branchId)
    .eq("arrival_date", today)
    .eq("status", "pending")
    .order("guest_name");

  return (
    <MessagePage title="Check in a guest">
      {success && <p role="status">Room {roomLabel} checked in.</p>}
      {((arrivingToday ?? []) as ReservationRow[]).length > 0 && (
        <div style={{ border: "1px solid", padding: "0.75rem", marginBottom: "1rem" }}>
          <strong>Arriving today</strong>
          <ul>
            {((arrivingToday ?? []) as ReservationRow[]).map((r) => (
              <li key={r.id}>
                {r.guest_name} (party of {r.party_size})
                {r.pre_registration && (
                  <> — pre-registered: {r.pre_registration.full_name}, {r.pre_registration.phone}
                    {r.pre_registration.notes && ` — "${r.pre_registration.notes}"`}</>
                )}
                {r.notes && !r.pre_registration && ` — ${r.notes}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error === "occupied" && blockedStay && (
        <div style={{ border: "1px solid", padding: "0.75rem", marginBottom: "1rem" }}>
          <p>
            Room {roomLabel} already has an active stay ({blockedStay.last_names.join(", ")}).
            Force-close it first if this is stale.
          </p>
          <form action="/force-close/submit" method="post" style={{ display: "grid", gap: "0.5rem" }}>
            <input type="hidden" name="stayId" value={blockedStay.id} />
            <input type="hidden" name="returnRoomId" value={roomId} />
            <label>
              Reason
              <input name="reason" required />
            </label>
            <button type="submit">Force-close stay</button>
          </form>
        </div>
      )}
      {error === "invalid" && <p role="alert">Check the form and try again.</p>}

      <form action="/checkin/submit" method="post" style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          Room
          <select name="roomId" required defaultValue={roomId ?? ""}>
            <option value="" disabled>
              Select a room
            </option>
            {vacantRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Last name
          <input name="lastName" required />
        </label>
        <label>
          Additional occupant last names (comma-separated, optional)
          <input name="additionalLastNames" />
        </label>
        <label>
          Phone (optional)
          <input name="phone" type="tel" />
        </label>
        <label>
          Checkout
          <input name="checkoutDue" type="datetime-local" defaultValue={defaultCheckoutValue()} required />
        </label>
        <button type="submit">Check in</button>
      </form>
    </MessagePage>
  );
}
