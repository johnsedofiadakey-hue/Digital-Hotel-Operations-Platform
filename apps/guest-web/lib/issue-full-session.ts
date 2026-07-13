import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signGuestSessionToken } from "@repo/shared/jwt";
import { GUEST_SESSION_COOKIE, VACANT_ROOM_COOKIE } from "./session-cookie";

// Real expiry is always recomputed live from stay.checkout_due (§4.6) — this
// is an outer safety ceiling baked into the JWT itself, so a leaked token
// can't be replayed indefinitely.
const FULL_SESSION_GRACE_MS = 24 * 60 * 60 * 1000;

export interface ActiveStayRow {
  id: string;
  checkout_due: string | null;
  device_cap: number;
}

// Shared by the QR scan route (outcome A) and the vacant-page live upgrade
// (§4.3 outcome B's "check-in upgrades the open page live" clause) — issuing
// a full session is identical in both cases, only how the caller got here
// differs.
export async function issueFullSession(
  db: SupabaseClient,
  stay: ActiveStayRow,
  jwtSecret: string,
  deviceLabel: string,
  redirectUrl: URL,
): Promise<NextResponse> {
  const { data: session, error } = await db
    .from("guest_sessions")
    .insert({ stay_id: stay.id, tier: "full", device_label: deviceLabel })
    .select("id")
    .single<{ id: string }>();

  if (error || !session) {
    throw new Error(`Failed to create guest session: ${error?.message ?? "unknown error"}`);
  }

  const expiresAt = new Date(
    (stay.checkout_due ? new Date(stay.checkout_due).getTime() : Date.now()) +
      FULL_SESSION_GRACE_MS,
  );

  const token = await signGuestSessionToken({
    stayId: stay.id,
    tier: "full",
    sessionId: session.id,
    expiresAt,
    secret: jwtSecret,
  });

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(GUEST_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  response.cookies.delete(VACANT_ROOM_COOKIE);
  return response;
}
