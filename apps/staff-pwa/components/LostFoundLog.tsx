"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";

interface LostItemRow {
  id: string;
  description: string;
  status: string;
  reported_by: "guest" | "staff";
  created_at: string;
}

interface Props {
  branchId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const NEXT_STATUS: Record<string, string | null> = {
  reported: "found",
  found: "returned",
  returned: null,
  closed: null,
};

// §8.3 housekeeping "Lost & found log [P2]." Snapshot on load, refetched
// after each action — this is a periodic log to check, not a live queue
// like the kitchen or request pool.
export function LostFoundLog({ branchId, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [items, setItems] = useState<LostItemRow[]>([]);
  const [newDescription, setNewDescription] = useState("");

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const { data } = await client
      .from("lost_items")
      .select("id, description, status, reported_by, created_at")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false });
    if (data) setItems(data as LostItemRow[]);
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

  async function logFoundItem() {
    const client = clientRef.current;
    if (!client || !newDescription.trim()) return;
    await client
      .from("lost_items")
      .insert({ branch_id: branchId, reported_by: "staff", description: newDescription.trim(), status: "found" });
    setNewDescription("");
    await refetch();
  }

  async function advance(item: LostItemRow) {
    const client = clientRef.current;
    const next = NEXT_STATUS[item.status];
    if (!client || !next) return;
    await client.from("lost_items").update({ status: next }).eq("id", item.id);
    await refetch();
  }

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <input
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Log a found item…"
        />
        <button type="button" onClick={logFoundItem} disabled={!newDescription.trim()}>
          Log
        </button>
      </div>
      <ul style={{ display: "grid", gap: "0.5rem", listStyle: "none", padding: 0 }}>
        {items.map((item) => (
          <li key={item.id} style={{ border: "1px solid", padding: "0.5rem 0.75rem" }}>
            {item.description} — <strong>{item.status}</strong> ({item.reported_by})
            {NEXT_STATUS[item.status] && (
              <button type="button" style={{ marginLeft: "0.5rem" }} onClick={() => advance(item)}>
                Mark {NEXT_STATUS[item.status]}
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && <li>Nothing logged yet.</li>}
      </ul>
    </div>
  );
}
