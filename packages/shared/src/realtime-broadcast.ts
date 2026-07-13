import type { SupabaseServiceEnv } from "./supabase.js";

// Server-side one-shot broadcast via Realtime's REST API, not a websocket
// channel — a request handler can't reliably hold a socket open long enough
// to subscribe-then-send, and serverless runtimes make that worse. This is
// the outcome-B live upgrade (§4.3, §14.4): the guest's still-open /vacant
// page listens on `room:{room_id}` for this event and re-resolves its
// session without a rescan. Best-effort — a dropped broadcast never fails
// check-in itself; the guest can always fall back to rescanning the QR.
export async function broadcastRoomCheckedIn(
  env: SupabaseServiceEnv,
  roomId: string,
): Promise<void> {
  try {
    await fetch(`${env.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [{ topic: `room:${roomId}`, event: "checked_in", payload: {} }],
      }),
    });
  } catch (error) {
    console.error("broadcastRoomCheckedIn failed", error);
  }
}
