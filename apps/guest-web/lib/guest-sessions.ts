import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by both entry points that issue a session (`/r/[room_key]` and
// `/enter/submit`) — the device cap (§4.6) counts all non-revoked sessions
// on a stay regardless of trust tier.
export async function countActiveGuestSessions(
  db: SupabaseClient,
  stayId: string,
): Promise<number> {
  const { count } = await db
    .from("guest_sessions")
    .select("id", { count: "exact", head: true })
    .eq("stay_id", stayId)
    .is("revoked_at", null);
  return count ?? 0;
}
