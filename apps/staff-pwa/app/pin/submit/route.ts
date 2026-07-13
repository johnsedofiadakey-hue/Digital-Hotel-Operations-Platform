// PIN tap-in (§5.1). Every attempt is logged and rate-limited per tablet
// (not per branch — one compromised/bruteforced tablet shouldn't lock out
// the whole department) before the PIN is even format-checked.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { signStaffSessionToken } from "@repo/shared/staff-jwt";
import {
  isValidPinFormat,
  isPinLockedOut,
  STAFF_PIN_LOCKOUT_WINDOW_MS,
} from "@repo/shared/staff-pin";
import { STAFF_BRANCH_COOKIE, STAFF_TABLET_COOKIE, STAFF_SESSION_COOKIE } from "../../../lib/cookies";

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // per-shift ceiling; idle logout is the real timeout
const TABLET_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

function fail(request: NextRequest, reason: "invalid" | "locked", tabletId: string) {
  const response = NextResponse.redirect(new URL(`/pin?error=${reason}`, request.url), {
    status: 303,
  });
  response.cookies.set(STAFF_TABLET_COOKIE, tabletId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TABLET_COOKIE_MAX_AGE_S,
  });
  return response;
}

export async function POST(request: NextRequest) {
  const store = request.cookies;
  const branchId = store.get(STAFF_BRANCH_COOKIE)?.value;
  if (!branchId) {
    return NextResponse.redirect(new URL("/setup", request.url), { status: 303 });
  }

  const tabletId = store.get(STAFF_TABLET_COOKIE)?.value ?? crypto.randomUUID();
  const db = createServiceRoleClient(getServiceEnv());

  const windowStart = new Date(Date.now() - STAFF_PIN_LOCKOUT_WINDOW_MS).toISOString();
  const { count: recentAttempts } = await db
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "staff_pin_attempt")
    .eq("metadata->>tablet_id", tabletId)
    .gte("created_at", windowStart);

  if (isPinLockedOut(recentAttempts ?? 0)) {
    await db.from("security_events").insert({
      branch_id: branchId,
      event_type: "staff_pin_lockout",
      metadata: { tablet_id: tabletId },
    });
    return fail(request, "locked", tabletId);
  }

  const formData = await request.formData();
  const pin = String(formData.get("pin") ?? "");

  if (!isValidPinFormat(pin)) {
    await db.from("security_events").insert({
      branch_id: branchId,
      event_type: "staff_pin_attempt",
      metadata: { tablet_id: tabletId, matched: false },
    });
    return fail(request, "invalid", tabletId);
  }

  const { data: match } = await db
    .rpc("verify_staff_pin", { p_branch_id: branchId, p_pin: pin })
    .maybeSingle<{ staff_id: string; user_id: string | null; name: string; role_key: string }>();

  if (!match || !match.user_id) {
    await db.from("security_events").insert({
      branch_id: branchId,
      event_type: "staff_pin_attempt",
      metadata: { tablet_id: tabletId, matched: false },
    });
    return fail(request, "invalid", tabletId);
  }

  await db.from("security_events").insert({
    branch_id: branchId,
    event_type: "staff_pin_attempt",
    metadata: { tablet_id: tabletId, matched: true, staff_id: match.staff_id },
  });

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await signStaffSessionToken({
    userId: match.user_id,
    expiresAt,
    secret: getJwtSecret(),
  });

  const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  response.cookies.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  response.cookies.set(STAFF_TABLET_COOKIE, tabletId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TABLET_COOKIE_MAX_AGE_S,
  });
  return response;
}
