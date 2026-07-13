// Guest session JWTs (§14.5, §4.6). Guests are never Supabase Auth users —
// this signs a token with the same project JWT secret PostgREST already
// trusts, carrying the custom claims the RLS helpers in the Sprint 1
// migration read: app_role='guest', stay_id, tier. `role: 'authenticated'`
// is what makes PostgREST select the `authenticated` Postgres role (the one
// the guest-facing RLS policies are written against) instead of `anon`.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { GuestSessionTier } from "./types.js";

export interface GuestTokenClaims extends JWTPayload {
  role: "authenticated";
  app_role: "guest";
  stay_id: string;
  tier: GuestSessionTier;
  sub: string; // guest_sessions.id — not yet checked by RLS, reserved for
  // per-device revocation once the session-expiry-sweeper (§14.6) lands.
}

export interface SignGuestTokenParams {
  stayId: string;
  tier: GuestSessionTier;
  sessionId: string;
  expiresAt: Date;
  secret: string;
}

export async function signGuestSessionToken(params: SignGuestTokenParams): Promise<string> {
  const key = new TextEncoder().encode(params.secret);
  return new SignJWT({
    role: "authenticated",
    app_role: "guest",
    stay_id: params.stayId,
    tier: params.tier,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.sessionId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(params.expiresAt.getTime() / 1000))
    .sign(key);
}

export async function verifyGuestSessionToken(
  token: string,
  secret: string,
): Promise<GuestTokenClaims | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    if (payload.app_role !== "guest" || typeof payload.stay_id !== "string") {
      return null;
    }
    return payload as GuestTokenClaims;
  } catch {
    return null;
  }
}
