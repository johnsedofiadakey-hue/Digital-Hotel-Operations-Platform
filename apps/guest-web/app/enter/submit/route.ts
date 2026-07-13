// Second-device manual entry (§4.5): g.dhop.app -> room code + last name ->
// a `limited` session. This is the stated abuse surface for the whole
// guest-auth model, so every attempt (match or not) is logged and rate
// limited (5 / 15 min, per IP and per room) before anything about
// correctness is revealed.
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { signGuestSessionToken } from "@repo/shared/jwt";
import {
  lastNameMatches,
  isRateLimited,
  SECOND_DEVICE_RATE_LIMIT_WINDOW_MS,
} from "@repo/shared/second-device";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { deviceLabelFromUserAgent } from "@repo/shared/device-label";
import { clientIp } from "@repo/shared/client-ip";
import { parseRoomCode } from "../../../lib/room-code";
import { countActiveGuestSessions } from "../../../lib/guest-sessions";
import { GUEST_SESSION_COOKIE } from "../../../lib/session-cookie";

// Same outer-ceiling reasoning as the QR scan route — real expiry is
// recomputed live from stay.checkout_due (§4.6).
const SESSION_GRACE_MS = 24 * 60 * 60 * 1000;

interface StayRow {
  id: string;
  last_names: string[];
  checkout_due: string | null;
  device_cap: number;
}

function fail(request: NextRequest, reason: "invalid" | "locked") {
  return NextResponse.redirect(new URL(`/enter?error=${reason}`, request.url), { status: 303 });
}

async function logAttempt(
  db: SupabaseClient,
  fields: {
    ip: string;
    roomCode: string;
    branchId?: string | null;
    roomId?: string | null;
    matched: boolean;
  },
) {
  await db.from("security_events").insert({
    branch_id: fields.branchId ?? null,
    event_type: "second_device_attempt",
    metadata: {
      ip: fields.ip,
      room_code: fields.roomCode,
      room_id: fields.roomId ?? null,
      matched: fields.matched,
    },
  });
}

export async function POST(request: NextRequest) {
  const db = createServiceRoleClient(getServiceEnv());
  const formData = await request.formData();
  const roomCode = String(formData.get("roomCode") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const ip = clientIp(request);

  const windowStart = new Date(Date.now() - SECOND_DEVICE_RATE_LIMIT_WINDOW_MS).toISOString();

  const { count: ipAttempts } = await db
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "second_device_attempt")
    .eq("metadata->>ip", ip)
    .gte("created_at", windowStart);

  if (isRateLimited(ipAttempts ?? 0)) {
    return fail(request, "locked");
  }

  const parsed = parseRoomCode(roomCode);
  if (!parsed) {
    await logAttempt(db, { ip, roomCode, matched: false });
    return fail(request, "invalid");
  }

  const { data: branch } = await db
    .from("branches")
    .select("id")
    .eq("code", parsed.branchCode)
    .maybeSingle<{ id: string }>();

  if (!branch) {
    await logAttempt(db, { ip, roomCode, matched: false });
    return fail(request, "invalid");
  }

  const { data: room } = await db
    .from("rooms")
    .select("id")
    .eq("branch_id", branch.id)
    .ilike("label", parsed.roomLabel)
    .maybeSingle<{ id: string }>();

  if (!room) {
    await logAttempt(db, { ip, roomCode, branchId: branch.id, matched: false });
    return fail(request, "invalid");
  }

  const { count: roomAttempts } = await db
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "second_device_attempt")
    .eq("metadata->>room_id", room.id)
    .gte("created_at", windowStart);

  if (isRateLimited(roomAttempts ?? 0)) {
    await db.from("security_events").insert({
      branch_id: branch.id,
      event_type: "second_device_rate_limited",
      metadata: { room_id: room.id },
    });
    return fail(request, "locked");
  }

  const { data: stay } = await db
    .from("stays")
    .select("id, last_names, checkout_due, device_cap")
    .eq("room_id", room.id)
    .eq("state", "active")
    .maybeSingle<StayRow>();

  if (!stay || !lastNameMatches(lastName, stay.last_names)) {
    await logAttempt(db, { ip, roomCode, branchId: branch.id, roomId: room.id, matched: false });
    return fail(request, "invalid");
  }

  const activeSessionCount = await countActiveGuestSessions(db, stay.id);
  if (activeSessionCount >= stay.device_cap) {
    await logAttempt(db, { ip, roomCode, branchId: branch.id, roomId: room.id, matched: true });
    return NextResponse.redirect(new URL("/device-limit", request.url));
  }

  const deviceLabel = deviceLabelFromUserAgent(request.headers.get("user-agent"));
  const { data: session, error } = await db
    .from("guest_sessions")
    .insert({ stay_id: stay.id, tier: "limited", device_label: deviceLabel })
    .select("id")
    .single<{ id: string }>();

  if (error || !session) {
    throw new Error(`Failed to create guest session: ${error?.message ?? "unknown error"}`);
  }

  await logAttempt(db, { ip, roomCode, branchId: branch.id, roomId: room.id, matched: true });

  const expiresAt = new Date(
    (stay.checkout_due ? new Date(stay.checkout_due).getTime() : Date.now()) + SESSION_GRACE_MS,
  );

  const token = await signGuestSessionToken({
    stayId: stay.id,
    tier: "limited",
    sessionId: session.id,
    expiresAt,
    secret: getJwtSecret(),
  });

  const response = NextResponse.redirect(new URL("/portal", request.url));
  response.cookies.set(GUEST_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
