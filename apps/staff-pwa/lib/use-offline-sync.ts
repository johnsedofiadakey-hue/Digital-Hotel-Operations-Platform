"use client";

import { useEffect, useState, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listQueuedActions, replayQueue } from "./offline-queue";

// "The UI always shows sync state ('3 actions waiting to sync') — staff
// must never wonder whether their work counted." (§12) `clientGetter` is a
// function rather than the client itself because the caller's client is
// often set asynchronously after a token fetch (see RoomBoard/RequestPool)
// — reading it lazily avoids a stale-closure null client.
export function useOfflineSync(clientGetter: () => SupabaseClient | null) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const actions = await listQueuedActions();
    setPendingCount(actions.length);
  }, []);

  const trySync = useCallback(async () => {
    const client = clientGetter();
    if (!client || typeof navigator !== "undefined" && !navigator.onLine) return;
    setSyncing(true);
    await replayQueue(client);
    setSyncing(false);
    await refreshCount();
  }, [clientGetter, refreshCount]);

  useEffect(() => {
    void refreshCount();
    void trySync();

    window.addEventListener("online", trySync);
    return () => window.removeEventListener("online", trySync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pendingCount, syncing, refreshCount, trySync };
}
