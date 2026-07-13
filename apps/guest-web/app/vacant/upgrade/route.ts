// The outcome-B live upgrade (§4.3): reached when the client-side Realtime
// listener on /vacant sees a `checked_in` broadcast for its room and
// navigates here — no rescan needed. Re-resolves the room's active stay
// itself rather than trusting the broadcast payload, since the broadcast is
// just a "something changed, go check" signal, not a source of truth.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { deviceLabelFromUserAgent } from "@repo/shared/device-label";
import { countActiveGuestSessions } from "../../../lib/guest-sessions";
import { issueFullSession, type ActiveStayRow } from "../../../lib/issue-full-session";
import { VACANT_ROOM_COOKIE } from "../../../lib/session-cookie";

export async function GET(request: NextRequest) {
  const roomId = request.cookies.get(VACANT_ROOM_COOKIE)?.value;
  if (!roomId) {
    return NextResponse.redirect(new URL("/vacant", request.url));
  }

  const db = createServiceRoleClient(getServiceEnv());
  const { data: activeStay } = await db
    .from("stays")
    .select("id, checkout_due, device_cap")
    .eq("room_id", roomId)
    .eq("state", "active")
    .maybeSingle<ActiveStayRow>();

  if (!activeStay) {
    // False alarm or already claimed by another device — fall back to the
    // normal vacant page rather than erroring.
    return NextResponse.redirect(new URL("/vacant", request.url));
  }

  const activeSessionCount = await countActiveGuestSessions(db, activeStay.id);
  if (activeSessionCount >= activeStay.device_cap) {
    return NextResponse.redirect(new URL("/device-limit", request.url));
  }

  return issueFullSession(
    db,
    activeStay,
    getJwtSecret(),
    deviceLabelFromUserAgent(request.headers.get("user-agent")),
    new URL("/portal", request.url),
  );
}
