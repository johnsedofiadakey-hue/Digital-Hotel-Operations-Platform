// Force-close (§3.2) — the escape hatch the check-in guard depends on.
// Kills every session on the stay immediately and frees the room so the
// blocked check-in can proceed right after.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { STAFF_SESSION_COOKIE } from "../../../lib/cookies";
import { getAuthenticatedStaff, CHECKIN_CAPABLE_ROLES } from "../../../lib/staff-session";

export async function POST(request: NextRequest) {
  const db = createServiceRoleClient(getServiceEnv());
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
  const stayId = String(formData.get("stayId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const returnRoomId = formData.get("returnRoomId");

  if (!stayId || !reason) {
    return NextResponse.redirect(new URL("/checkin?error=invalid", request.url), { status: 303 });
  }

  const { data: stay } = await db
    .from("stays")
    .select("id, room_id, branch_id")
    .eq("id", stayId)
    .eq("branch_id", staff.branchId)
    .eq("state", "active")
    .maybeSingle<{ id: string; room_id: string; branch_id: string }>();

  if (!stay) {
    return NextResponse.redirect(new URL("/checkin?error=invalid", request.url), { status: 303 });
  }

  await db
    .from("stays")
    .update({ state: "force_closed", closed_at: new Date().toISOString(), closed_reason: reason })
    .eq("id", stay.id);

  await db
    .from("guest_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("stay_id", stay.id)
    .is("revoked_at", null);

  // Room status isn't mentioned in §3.2's force-close bullet, but leaving it
  // `occupied` after an abnormal end would misreport the room the same way
  // the seed-data gap this session's HANDOVER.md flagged did — so this
  // mirrors normal checkout's room-status effect.
  await db.from("rooms").update({ status: "vacant_dirty" }).eq("id", stay.room_id);

  await db.from("audit_log").insert({
    branch_id: staff.branchId,
    actor_staff_id: staff.staffId,
    action: "staff_force_closed_stay",
    entity_type: "stay",
    entity_id: stay.id,
    metadata: { reason },
  });

  // "Notifies branch manager" — real notification fanout is Sprint 5; this
  // logs the event so it exists to notify from once that's built.
  await db.from("security_events").insert({
    branch_id: staff.branchId,
    event_type: "stay_force_closed",
    metadata: { stay_id: stay.id, reason, actor_staff_id: staff.staffId },
  });

  const url = new URL("/checkin", request.url);
  if (typeof returnRoomId === "string" && returnRoomId) {
    url.searchParams.set("roomId", returnRoomId);
  }
  return NextResponse.redirect(url, { status: 303 });
}
