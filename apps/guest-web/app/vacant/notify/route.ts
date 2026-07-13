// Outcome B's "notify reception" tap. Logs an audit entry against the room —
// this is a stub until the requests table (Sprint 2) exists to actually
// route a task into reception's queue.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";
import { VACANT_ROOM_COOKIE } from "../../../lib/session-cookie";

export async function POST(request: NextRequest) {
  const roomId = request.cookies.get(VACANT_ROOM_COOKIE)?.value;

  if (roomId) {
    const db = createServiceRoleClient(getServiceEnv());
    const { data: room } = await db
      .from("rooms")
      .select("branch_id")
      .eq("id", roomId)
      .maybeSingle<{ branch_id: string }>();

    await db.from("audit_log").insert({
      branch_id: room?.branch_id ?? null,
      action: "guest_tapped_notify_reception",
      entity_type: "room",
      entity_id: roomId,
      metadata: {},
    });
  }

  return NextResponse.redirect(new URL("/vacant?notified=1", request.url), { status: 303 });
}
