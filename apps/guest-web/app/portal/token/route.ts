// Hands the guest's own session token to page JS so it can open an
// RLS-scoped Realtime subscription and issue direct writes for requests
// (§8.1) — Realtime's postgres_changes needs the JWT in the browser to
// authenticate the socket, and there's no way around that for a client-side
// subscription. Only reachable because the browser already carries the
// httpOnly session cookie; RLS is still the real gate on what this token
// can do, exactly as it is for every other guest-facing query in this app.
import { NextResponse, type NextRequest } from "next/server";
import { verifyGuestSessionToken } from "@repo/shared/jwt";
import { getJwtSecret, getServiceEnv } from "@repo/shared/server-env";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { GUEST_SESSION_COOKIE } from "../../../lib/session-cookie";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(GUEST_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const claims = await verifyGuestSessionToken(token, getJwtSecret());
  if (!claims) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  // branchId/roomCategoryId spare the menu/orders components an extra
  // round trip — cheap to look up here since we already hold a service-role
  // client, and neither value is sensitive (same trust level as stay_id,
  // which is already in the token itself).
  const db = createServiceRoleClient(getServiceEnv());
  const { data: stay } = await db
    .from("stays")
    .select("branch_id, room_id")
    .eq("id", claims.stay_id)
    .maybeSingle<{ branch_id: string; room_id: string }>();

  let roomCategoryId: string | null = null;
  if (stay?.room_id) {
    const { data: room } = await db
      .from("rooms")
      .select("category_id")
      .eq("id", stay.room_id)
      .maybeSingle<{ category_id: string }>();
    roomCategoryId = room?.category_id ?? null;
  }

  return NextResponse.json({
    token,
    stayId: claims.stay_id,
    tier: claims.tier,
    branchId: stay?.branch_id ?? null,
    roomCategoryId,
  });
}
