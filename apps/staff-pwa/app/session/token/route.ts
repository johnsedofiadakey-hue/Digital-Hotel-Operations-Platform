// Same reasoning as guest-web's /portal/token — hands the staff member's own
// session token to page JS so it can open RLS-scoped Realtime subscriptions
// (department request pool, room board) and issue direct writes. Only
// reachable via the httpOnly session cookie; RLS is still the real gate.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { STAFF_SESSION_COOKIE } from "../../../lib/cookies";
import { getAuthenticatedStaff } from "../../../lib/staff-session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());

  if (!staff || !token) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  return NextResponse.json({
    token,
    staffId: staff.staffId,
    branchId: staff.branchId,
    roleKey: staff.roleKey,
  });
}
