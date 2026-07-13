"use client";

import { useEffect, useState, useCallback, useRef, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGuestClient } from "@repo/shared/supabase";
import type { GuestSessionTier } from "@repo/shared/types";

interface ChatMessageRow {
  id: string;
  sender_type: "guest" | "staff";
  body: string;
  created_at: string;
}

interface Props {
  tier: GuestSessionTier;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §7.3 live chat — one thread per stay, full/limited trust only (§4.4).
// Live via Broadcast-from-Database on `chat:stay:{stay_id}` (§4b).
export function ChatPanel({ tier, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const stayIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    const stayId = stayIdRef.current;
    if (!client || !stayId) return;
    const { data } = await client
      .from("chat_messages")
      .select("id, sender_type, body, created_at")
      .eq("stay_id", stayId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as ChatMessageRow[]);
  }, []);

  useEffect(() => {
    if (tier === "post_stay") return;
    let cancelled = false;

    async function init() {
      const res = await fetch("/portal/token");
      if (!res.ok) return;
      const { token, stayId } = (await res.json()) as { token: string; stayId: string };
      if (cancelled) return;

      clientRef.current = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      stayIdRef.current = stayId;
      await refetch();

      clientRef.current
        .channel(`chat:stay:${stayId}`)
        .on("broadcast", { event: "chat_message" }, () => void refetch())
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [tier, supabaseUrl, supabaseAnonKey, refetch]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const client = clientRef.current;
    const stayId = stayIdRef.current;
    if (!client || !stayId || !draft.trim()) return;
    setSending(true);
    await client.from("chat_messages").insert({ stay_id: stayId, sender_type: "guest", body: draft.trim() });
    setDraft("");
    setSending(false);
  }

  if (tier === "post_stay") return null;

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>Chat with reception</h2>
      <ul style={{ display: "grid", gap: "0.35rem", listStyle: "none", padding: 0, maxHeight: 240, overflowY: "auto" }}>
        {messages.map((m) => (
          <li key={m.id} style={{ textAlign: m.sender_type === "guest" ? "right" : "left" }}>
            <span style={{ opacity: 0.6, fontSize: "0.85em" }}>{m.sender_type === "guest" ? "You" : "Reception"}: </span>
            {m.body}
          </li>
        ))}
        {messages.length === 0 && <li>No messages yet — say hello.</li>}
      </ul>
      <form onSubmit={send} style={{ display: "flex", gap: "0.35rem", marginTop: "0.5rem" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message reception…"
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
