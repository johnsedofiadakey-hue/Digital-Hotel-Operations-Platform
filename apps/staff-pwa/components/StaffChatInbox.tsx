"use client";

import { useEffect, useState, useCallback, useRef, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";

interface StayRow {
  id: string;
  last_names: string[];
  rooms: { label: string } | { label: string }[] | null;
}

interface ChatMessageRow {
  id: string;
  sender_type: "guest" | "staff";
  body: string;
  created_at: string;
}

interface Props {
  staffId: string;
  branchId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §7.3/§8.3 — reception's chat inbox. Concierge as a separate portal is
// explicitly [P2] (§8.3) — in P1, chat lands in Reception's inbox, which is
// exactly what this is. One realtime subscription per selected thread
// (`chat:stay:{stay_id}`) rather than subscribing to every active stay's
// topic at once — simpler, and reception opens one guest's thread at a time
// anyway.
export function StaffChatInbox({ staffId, branchId, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [stays, setStays] = useState<StayRow[]>([]);
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const res = await fetch("/session/token");
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      if (cancelled) return;
      clientRef.current = createStaffPinClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);

      const { data } = await clientRef.current
        .from("stays")
        .select("id, last_names, rooms(label)")
        .eq("branch_id", branchId)
        .eq("state", "active");
      if (data) setStays(data as unknown as StayRow[]);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [branchId, supabaseUrl, supabaseAnonKey]);

  const refetchThread = useCallback(async (stayId: string) => {
    const client = clientRef.current;
    if (!client) return;
    const { data } = await client
      .from("chat_messages")
      .select("id, sender_type, body, created_at")
      .eq("stay_id", stayId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as ChatMessageRow[]);
  }, []);

  useEffect(() => {
    if (!selectedStayId) return;
    const client = clientRef.current;
    if (!client) return;

    void refetchThread(selectedStayId);
    const channel = client
      .channel(`chat:stay:${selectedStayId}`)
      .on("broadcast", { event: "chat_message" }, () => void refetchThread(selectedStayId))
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [selectedStayId, refetchThread]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const client = clientRef.current;
    if (!client || !selectedStayId || !draft.trim()) return;
    await client
      .from("chat_messages")
      .insert({ stay_id: selectedStayId, branch_id: branchId, sender_type: "staff", sender_staff_id: staffId, body: draft.trim() });
    setDraft("");
  }

  function roomLabel(stay: StayRow): string {
    const rooms = stay.rooms;
    const room = Array.isArray(rooms) ? rooms[0] : rooms;
    return room?.label ?? "?";
  }

  return (
    <div style={{ display: "flex", gap: "1rem" }}>
      <ul style={{ listStyle: "none", padding: 0, minWidth: 140 }}>
        {stays.map((stay) => (
          <li key={stay.id}>
            <button type="button" onClick={() => setSelectedStayId(stay.id)}>
              Room {roomLabel(stay)} ({stay.last_names[0] ?? "guest"})
            </button>
          </li>
        ))}
        {stays.length === 0 && <li>No active stays.</li>}
      </ul>

      {selectedStayId && (
        <div style={{ flex: 1 }}>
          <ul style={{ display: "grid", gap: "0.35rem", listStyle: "none", padding: 0, maxHeight: 240, overflowY: "auto" }}>
            {messages.map((m) => (
              <li key={m.id} style={{ textAlign: m.sender_type === "staff" ? "right" : "left" }}>
                <span style={{ opacity: 0.6, fontSize: "0.85em" }}>{m.sender_type === "staff" ? "You" : "Guest"}: </span>
                {m.body}
              </li>
            ))}
            {messages.length === 0 && <li>No messages yet.</li>}
          </ul>
          <form onSubmit={send} style={{ display: "flex", gap: "0.35rem", marginTop: "0.5rem" }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1 }} />
            <button type="submit" disabled={!draft.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
