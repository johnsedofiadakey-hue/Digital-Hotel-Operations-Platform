// QR scan entry point (§4.2-§4.3). Exchanges an opaque room_key for a
// session cookie and redirects to a clean URL so the raw key doesn't linger
// in browser history. Runs with the service-role client because an
// unauthenticated scanner has no stay_id yet — there is no anon-scoped RLS
// policy that could answer "what room is this key for."
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { signGuestSessionToken, verifyGuestSessionToken } from "@repo/shared/jwt";
import { resolveScanOutcome } from "@repo/shared/scan-outcome";
import type { StayState } from "@repo/shared/types";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { deviceLabelFromUserAgent } from "@repo/shared/device-label";
import { countActiveGuestSessions } from "../../../lib/guest-sessions";
import { GUEST_SESSION_COOKIE, VACANT_ROOM_COOKIE } from "../../../lib/session-cookie";
import { issueFullSession, type ActiveStayRow } from "../../../lib/issue-full-session";

const POST_STAY_WINDOW_MS = 48 * 60 * 60 * 1000; // §3.2 checkout effects
const VACANT_COOKIE_MAX_AGE_S = 60 * 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ room_key: string }> },
) {
  const { room_key: roomKey } = await params;
  const env = getServiceEnv();
  const jwtSecret = getJwtSecret();
  const db = createServiceRoleClient(env);

  const { data: room } = await db
    .from("rooms")
    .select("id, branch_id, status")
    .eq("room_key", roomKey)
    .maybeSingle();

  if (!room) {
    await db
      .from("security_events")
      .insert({ event_type: "invalid_room_key_scan", metadata: { room_key: roomKey } });
    return NextResponse.redirect(new URL("/invalid", request.url));
  }

  if (room.status === "out_of_order") {
    await db.from("security_events").insert({
      branch_id: room.branch_id,
      event_type: "out_of_order_room_scan",
      metadata: { room_id: room.id },
    });
    return NextResponse.redirect(new URL("/out-of-order", request.url));
  }

  const { data: activeStay } = await db
    .from("stays")
    .select("id, checkout_due, device_cap")
    .eq("room_id", room.id)
    .eq("state", "active")
    .maybeSingle<ActiveStayRow>();

  const activeSessionCount = activeStay ? await countActiveGuestSessions(db, activeStay.id) : 0;

  const existingSession = activeStay
    ? null
    : await resolveExistingSession(request, db, jwtSecret);

  const outcome = resolveScanOutcome({
    room: { status: room.status },
    activeStay: activeStay ? { deviceCap: activeStay.device_cap, activeSessionCount } : null,
    existingSession,
  });

  switch (outcome) {
    case "active_session": {
      if (!activeStay) {
        throw new Error("invariant: active_session outcome without an active stay");
      }
      return issueFullSession(
        db,
        activeStay,
        jwtSecret,
        deviceLabelFromUserAgent(request.headers.get("user-agent")),
        new URL("/portal", request.url),
      );
    }
    case "device_limit":
      return NextResponse.redirect(new URL("/device-limit", request.url));
    case "post_stay":
      return handlePostStay(request, db, jwtSecret);
    case "vacant":
    default: {
      const response = NextResponse.redirect(new URL("/vacant", request.url));
      response.cookies.set(VACANT_ROOM_COOKIE, room.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: VACANT_COOKIE_MAX_AGE_S,
      });
      return response;
    }
  }
}

async function resolveExistingSession(
  request: NextRequest,
  db: SupabaseClient,
  jwtSecret: string,
): Promise<{ stayState: StayState } | null> {
  const token = request.cookies.get(GUEST_SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyGuestSessionToken(token, jwtSecret);
  if (!claims) return null;

  const { data: stay } = await db
    .from("stays")
    .select("state")
    .eq("id", claims.stay_id)
    .maybeSingle<{ state: StayState }>();

  return stay ? { stayState: stay.state } : null;
}

async function handlePostStay(request: NextRequest, db: SupabaseClient, jwtSecret: string) {
  const response = NextResponse.redirect(new URL("/post-stay", request.url));

  const token = request.cookies.get(GUEST_SESSION_COOKIE)?.value;
  const claims = token ? await verifyGuestSessionToken(token, jwtSecret) : null;
  if (!claims || !claims.sub) return response;

  const { data: stay } = await db
    .from("stays")
    .select("closed_at")
    .eq("id", claims.stay_id)
    .maybeSingle<{ closed_at: string | null }>();

  await db
    .from("guest_sessions")
    .update({ tier: "post_stay" })
    .eq("id", claims.sub)
    .neq("tier", "post_stay");

  const expiresAt = new Date(
    (stay?.closed_at ? new Date(stay.closed_at).getTime() : Date.now()) + POST_STAY_WINDOW_MS,
  );

  const newToken = await signGuestSessionToken({
    stayId: claims.stay_id,
    tier: "post_stay",
    sessionId: claims.sub,
    expiresAt,
    secret: jwtSecret,
  });

  response.cookies.set(GUEST_SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
