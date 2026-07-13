// Staff session JWTs (§5.1 PIN tap-in). Unlike guest sessions, staff already
// have a real `auth.users` row (staff.user_id) — every RLS helper in the
// Sprint 1 migration (staff_branch_id(), staff_role_key(), ...) resolves off
// `auth.uid()`, which Supabase derives from a JWT's `sub` claim regardless of
// whether that JWT came from GoTrue's login endpoints or was minted by hand.
// So a PIN tap-in only needs to produce a validly-signed JWT with `sub` set
// to that staff member's real user id — no custom claims required for RLS to
// resolve their role/branch correctly, exactly as if they'd logged in with
// email+password.
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface StaffTokenClaims extends JWTPayload {
  role: "authenticated";
  app_role: "staff";
  sub: string; // staff.user_id / auth.users.id
}

export interface SignStaffTokenParams {
  userId: string;
  expiresAt: Date;
  secret: string;
}

export async function signStaffSessionToken(params: SignStaffTokenParams): Promise<string> {
  const key = new TextEncoder().encode(params.secret);
  return new SignJWT({ role: "authenticated", app_role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(params.expiresAt.getTime() / 1000))
    .sign(key);
}

export async function verifyStaffSessionToken(
  token: string,
  secret: string,
): Promise<StaffTokenClaims | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    if (payload.app_role !== "staff" || typeof payload.sub !== "string") {
      return null;
    }
    return payload as StaffTokenClaims;
  } catch {
    return null;
  }
}
