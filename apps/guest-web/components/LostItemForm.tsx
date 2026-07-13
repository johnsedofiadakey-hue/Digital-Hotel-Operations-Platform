"use client";

import { useState, useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGuestClient } from "@repo/shared/supabase";

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface LostItemRow {
  id: string;
  description: string;
  status: string;
  created_at: string;
}

// §7.3 lost item reporting [P2]. Not gated to full trust or even an active
// stay — a guest might realize they lost something after checkout, and
// reporting it involves no money and no elevated risk.
export function LostItemForm({ supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const stayIdRef = useRef<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<LostItemRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const res = await fetch("/portal/token");
      if (!res.ok) return;
      const { token, stayId } = (await res.json()) as { token: string; stayId: string };
      if (cancelled) return;
      clientRef.current = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      stayIdRef.current = stayId;
      const { data } = await clientRef.current
        .from("lost_items")
        .select("id, description, status, created_at")
        .eq("stay_id", stayId)
        .order("created_at", { ascending: false });
      if (data) setItems(data as LostItemRow[]);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [supabaseUrl, supabaseAnonKey]);

  async function submit() {
    const client = clientRef.current;
    const stayId = stayIdRef.current;
    if (!client || !stayId || !description.trim()) return;
    setSubmitting(true);
    await client.from("lost_items").insert({ stay_id: stayId, reported_by: "guest", description: description.trim() });
    setDescription("");
    setSubmitting(false);
    const { data } = await client
      .from("lost_items")
      .select("id, description, status, created_at")
      .eq("stay_id", stayId)
      .order("created_at", { ascending: false });
    if (data) setItems(data as LostItemRow[]);
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>Report a lost item</h2>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What did you lose, and where might you have left it?"
        style={{ width: "100%", minHeight: "4rem" }}
      />
      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" disabled={submitting || !description.trim()} onClick={submit}>
          Report
        </button>
      </div>
      <ul style={{ marginTop: "1rem" }}>
        {items.map((item) => (
          <li key={item.id}>
            {item.description} — {item.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
