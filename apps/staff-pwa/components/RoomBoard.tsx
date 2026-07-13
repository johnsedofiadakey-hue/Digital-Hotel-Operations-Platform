"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";
import { canTransition, ROOM_STATUS_TRANSITIONS } from "@repo/shared/state-machines";
import type { RoomStatus } from "@repo/shared/types";
import { executeOrQueue } from "../lib/offline-queue";
import { useOfflineSync } from "../lib/use-offline-sync";

interface RoomRow {
  id: string;
  label: string;
  status: RoomStatus;
}

interface Props {
  branchId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const ROOM_STATUSES: RoomStatus[] = [
  "vacant_clean",
  "vacant_dirty",
  "occupied",
  "occupied_dnd",
  "out_of_order",
];

// §6.2 room status machine, live board (§15 Sprint 2 exit test: "room status
// flips propagate to two devices at once"). Writes go through the
// staff-scoped RLS client; live updates are "Broadcast from Database"
// (§14.4, see the trigger in 20260711170000_requests.sql) — this local
// Supabase build doesn't reliably deliver postgres_changes (confirmed by
// testing), so a content-free `room_status_changed` ping plus a re-read is
// the mechanism, same as the request pool.
export function RoomBoard({ branchId, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const { data } = await client
      .from("rooms")
      .select("id, label, status")
      .eq("branch_id", branchId)
      .order("label");
    if (data) setRooms(data as RoomRow[]);
  }, [branchId]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const res = await fetch("/session/token");
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      if (cancelled) return;

      clientRef.current = createStaffPinClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      await refetch();

      clientRef.current
        .channel(`rooms:branch:${branchId}`)
        .on("broadcast", { event: "room_status_changed" }, () => void refetch())
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [branchId, supabaseUrl, supabaseAnonKey, refetch]);

  const { pendingCount } = useOfflineSync(() => clientRef.current);

  // §12: an offline "mark clean" (or any status flip) must not be lost —
  // executeOrQueue tries the write, falls back to the local queue on
  // failure, and the room list updates optimistically either way so staff
  // see their tap took effect immediately, not just once it's synced.
  async function setStatus(room: RoomRow, next: RoomStatus) {
    const client = clientRef.current;
    if (!client || !canTransition(ROOM_STATUS_TRANSITIONS, room.status, next)) return;
    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, status: next } : r)));
    const { queued } = await executeOrQueue(client, "rooms", room.id, { status: next });
    // If queued, the write hasn't actually happened server-side yet — a
    // refetch right now would stomp the optimistic update with stale data.
    // Leave it as-is until replayQueue() lands it and the next broadcast
    // (or manual refetch) catches up.
    if (!queued) await refetch();
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Room board</h2>
      {pendingCount > 0 && <p role="status">{pendingCount} action(s) waiting to sync</p>}
      <ul style={{ display: "grid", gap: "0.5rem", listStyle: "none", padding: 0 }}>
        {rooms.map((room) => (
          <li key={room.id} style={{ border: "1px solid", padding: "0.5rem 0.75rem" }}>
            <strong>{room.label}</strong> — {room.status}
            <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {ROOM_STATUSES.filter((s) => canTransition(ROOM_STATUS_TRANSITIONS, room.status, s)).map(
                (next) => (
                  <button key={next} type="button" onClick={() => setStatus(room, next)}>
                    → {next}
                  </button>
                ),
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
