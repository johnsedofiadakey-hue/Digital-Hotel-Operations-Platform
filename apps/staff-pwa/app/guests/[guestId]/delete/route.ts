import { NextResponse, type NextRequest } from "next/server";
import { createStaffPinClient, createServiceRoleClient } from "@repo/shared/supabase";
import { getJwtSecret, getPublicSupabaseEnv, getServiceEnv } from "@repo/shared/server-env";
import { STAFF_SESSION_COOKIE } from "../../../../lib/cookies";
import { getAuthenticatedStaff } from "../../../../lib/staff-session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ guestId: string }> }) {
  const { guestId } = await params;
  const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const serviceDb = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(serviceDb, token, getJwtSecret());
  if (!staff || !token) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const staffDb = createStaffPinClient(getPublicSupabaseEnv(), token);
  const { error } = await staffDb.rpc("delete_guest_profile", { p_guest_id: guestId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(new URL("/guests", request.url));
}
