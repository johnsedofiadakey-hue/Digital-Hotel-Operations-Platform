"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";

interface BookingRow {
  id: string;
  guest_count: number;
  state: string;
  staff_assigned_id: string | null;
  activities: { name: string } | { name: string }[] | null;
  activity_slots: { starts_at: string } | { starts_at: string }[] | null;
}

interface Props {
  branchId: string;
  canManage: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function activityName(row: BookingRow): string {
  const a = row.activities;
  return (Array.isArray(a) ? a[0]?.name : a?.name) ?? "Activity";
}

function slotStart(row: BookingRow): string | null {
  const s = row.activity_slots;
  const starts = Array.isArray(s) ? s[0]?.starts_at : s?.starts_at;
  return starts ?? null;
}

// §10 [P2] staff side. Reception/concierge get view-only per the role matrix (§5.5) — `canManage`
// (branch_manager/owner) gates the mutation buttons; RLS enforces the same boundary server-side
// regardless of what this component renders, so a role mismatch here is a UX gap, not a security
// hole.
export function ActivitiesPanel({ branchId, canManage, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const { data } = await client
      .from("activity_bookings")
      .select("id, guest_count, state, staff_assigned_id, activities(name), activity_slots(starts_at)")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false });
    if (data) setBookings(data as unknown as BookingRow[]);
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
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [supabaseUrl, supabaseAnonKey, refetch]);

  async function setState(id: string, state: string) {
    const client = clientRef.current;
    if (!client) return;
    await client.from("activity_bookings").update({ state }).eq("id", id);
    await refetch();
  }

  return (
    <div>
      <ul style={{ display: "grid", gap: "0.5rem", listStyle: "none", padding: 0 }}>
        {bookings.map((b) => {
          const starts = slotStart(b);
          return (
            <li key={b.id} style={{ border: "1px solid", padding: "0.5rem 0.75rem" }}>
              {activityName(b)} {starts && `— ${new Date(starts).toLocaleString()}`} — party of{" "}
              {b.guest_count} — <strong>{b.state}</strong>
              {canManage && b.state === "confirmed" && (
                <>
                  <button type="button" style={{ marginLeft: "0.5rem" }} onClick={() => setState(b.id, "completed")}>
                    Mark completed
                  </button>
                  <button type="button" style={{ marginLeft: "0.5rem" }} onClick={() => setState(b.id, "no_show")}>
                    Mark no-show
                  </button>
                </>
              )}
            </li>
          );
        })}
        {bookings.length === 0 && <li>No bookings yet.</li>}
      </ul>
    </div>
  );
}
