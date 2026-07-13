"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

interface Props {
  roomId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// Outcome B's live upgrade (§4.3): listens on the same `room:{room_id}`
// broadcast topic the check-in route sends to (see
// packages/shared/src/realtime-broadcast.ts). On the event, navigates to
// /vacant/upgrade — a real navigation, not a fetch, so the server can set
// the session cookie and land the guest on /portal in one hop.
export function VacantRealtimeUpgrade({ roomId, supabaseUrl, supabaseAnonKey }: Props) {
  useEffect(() => {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const channel = client
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "checked_in" }, () => {
        window.location.href = "/vacant/upgrade";
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [roomId, supabaseUrl, supabaseAnonKey]);

  return null;
}
