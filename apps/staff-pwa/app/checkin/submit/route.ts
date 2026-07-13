// Check-in (§3.2). Runs through the service-role client — same reasoning as
// the migration's own comment on `stays`: the guard check, the row insert,
// and the room-status flip need to happen atomically, which isn't something
// a staff-scoped RLS INSERT policy could express cleanly.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { broadcastRoomCheckedIn } from "@repo/shared/realtime-broadcast";
import { STAFF_SESSION_COOKIE } from "../../../lib/cookies";
import { getAuthenticatedStaff, CHECKIN_CAPABLE_ROLES } from "../../../lib/staff-session";

function fail(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/checkin?error=${reason}`, request.url), { status: 303 });
}

export async function POST(request: NextRequest) {
  const env = getServiceEnv();
  const db = createServiceRoleClient(env);
  const staff = await getAuthenticatedStaff(
    db,
    request.cookies.get(STAFF_SESSION_COOKIE)?.value,
    getJwtSecret(),
  );

  if (!staff) {
    return NextResponse.redirect(new URL("/pin", request.url), { status: 303 });
  }
  if (!staff.branchId || !CHECKIN_CAPABLE_ROLES.has(staff.roleKey)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const roomId = String(formData.get("roomId") ?? "");
  const lastName = String(formData.get("lastName") ?? "").trim();
  const additionalLastNames = String(formData.get("additionalLastNames") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const phone = String(formData.get("phone") ?? "").trim();
  const checkoutDueRaw = String(formData.get("checkoutDue") ?? "");

  if (!roomId || !lastName || !checkoutDueRaw) {
    return fail(request, "invalid");
  }

  const checkoutDue = new Date(checkoutDueRaw);
  if (Number.isNaN(checkoutDue.getTime())) {
    return fail(request, "invalid");
  }

  const { data: room } = await db
    .from("rooms")
    .select("id, label, branch_id, status")
    .eq("id", roomId)
    .eq("branch_id", staff.branchId)
    .maybeSingle<{ id: string; label: string; branch_id: string; status: string }>();

  if (!room || room.status === "out_of_order") {
    return fail(request, "invalid");
  }

  // §3.2's check-in guard — a room can never have two active stays. The
  // database also enforces this (one_active_stay_per_room), this check just
  // produces a useful redirect instead of a raw constraint-violation error.
  const { data: blockingStay } = await db
    .from("stays")
    .select("id")
    .eq("room_id", room.id)
    .eq("state", "active")
    .maybeSingle<{ id: string }>();

  if (blockingStay) {
    const url = new URL("/checkin", request.url);
    url.searchParams.set("error", "occupied");
    url.searchParams.set("roomId", room.id);
    url.searchParams.set("roomLabel", room.label);
    url.searchParams.set("stayId", blockingStay.id);
    return NextResponse.redirect(url, { status: 303 });
  }

  const { error: insertError } = await db.from("stays").insert({
    room_id: room.id,
    branch_id: room.branch_id,
    state: "active",
    last_names: [lastName, ...additionalLastNames],
    phone: phone || null,
    checkin_at: new Date().toISOString(),
    checkout_due: checkoutDue.toISOString(),
  });

  if (insertError) {
    // Most likely the unique-active-stay-per-room index tripped on a race
    // between the guard check above and this insert — same user-facing
    // outcome as the guard catching it up front.
    return fail(request, "occupied");
  }

  await db.from("rooms").update({ status: "occupied" }).eq("id", room.id);

  await db.from("audit_log").insert({
    branch_id: staff.branchId,
    actor_staff_id: staff.staffId,
    action: "staff_checked_in",
    entity_type: "room",
    entity_id: room.id,
    metadata: { last_names: [lastName, ...additionalLastNames] },
  });

  await broadcastRoomCheckedIn(env, room.id);

  const url = new URL("/checkin", request.url);
  url.searchParams.set("success", "1");
  url.searchParams.set("roomLabel", room.label);
  return NextResponse.redirect(url, { status: 303 });
}
