"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";
import { canTransition, REQUEST_TRANSITIONS } from "@repo/shared/state-machines";
import type { RequestState, RequestType } from "@repo/shared/types";
import { playChime } from "../lib/chime";
import { executeOrQueue } from "../lib/offline-queue";
import { useOfflineSync } from "../lib/use-offline-sync";

interface RequestRow {
  id: string;
  type: RequestType;
  state: RequestState;
  priority: string;
  note: string | null;
  claimed_by: string | null;
  submitted_at: string;
}

interface Props {
  staffId: string;
  branchId: string;
  roleKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §8.1 request lifecycle, department-pool side. `roleKey` scopes which
// types this tablet's queue shows (§5.5). Live updates are "Broadcast from
// Database" (§14.4, see the trigger in 20260711170000_requests.sql) — a
// distinct `request_submitted` event (vs. `request_updated`) is what lets
// this component chime only for genuinely new requests, not every state
// change, without needing the postgres_changes payload this local Supabase
// build doesn't reliably deliver.
export function RequestPool({ staffId, branchId, roleKey, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [ready, setReady] = useState(false);

  const typeFilter: RequestType | null =
    roleKey === "housekeeping" ? "housekeeping" : roleKey === "maintenance" ? "maintenance" : null;

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    let query = client
      .from("requests")
      .select("id, type, state, priority, note, claimed_by, submitted_at")
      .eq("branch_id", branchId)
      .not("state", "in", "(confirmed,cancelled)")
      .order("submitted_at", { ascending: true });
    if (typeFilter) query = query.eq("type", typeFilter);
    const { data } = await query;
    if (data) setRequests(data as RequestRow[]);
  }, [branchId, typeFilter]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const res = await fetch("/session/token");
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      if (cancelled) return;

      clientRef.current = createStaffPinClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      setReady(true);
      await refetch();

      clientRef.current
        .channel(`requests:branch:${branchId}`)
        .on("broadcast", { event: "request_submitted" }, () => {
          playChime();
          void refetch();
        })
        .on("broadcast", { event: "request_updated" }, () => void refetch())
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [branchId, supabaseUrl, supabaseAnonKey, refetch]);

  const { pendingCount } = useOfflineSync(() => clientRef.current);

  // §12: "claim request" and "close ticket" are two of the spec's own three
  // named offline actions — executeOrQueue queues the write if it fails,
  // and the local list updates optimistically either way.
  const advance = useCallback(
    async (request: RequestRow, next: RequestState, extra: Record<string, unknown> = {}) => {
      const client = clientRef.current;
      if (!client || !canTransition(REQUEST_TRANSITIONS, request.state, next)) return;
      setRequests((prev) => prev.map((r) => (r.id === request.id ? { ...r, state: next, ...extra } : r)));
      const { queued } = await executeOrQueue(client, "requests", request.id, { state: next, ...extra });
      if (!queued) await refetch();
    },
    [refetch],
  );

  return (
    <div>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Request queue</h2>
      {pendingCount > 0 && <p role="status">{pendingCount} action(s) waiting to sync</p>}
      {!ready && <p>Loading…</p>}
      <ul style={{ display: "grid", gap: "0.75rem", listStyle: "none", padding: 0 }}>
        {requests.map((r) => {
          const mine = r.claimed_by === staffId;
          return (
            <li key={r.id} style={{ border: "1px solid", padding: "0.75rem" }}>
              <strong>{r.type}</strong> — {r.priority} — {r.state}
              {r.note && <div>{r.note}</div>}
              <div style={{ marginTop: "0.5rem" }}>
                {(r.state === "submitted" || r.state === "reopened") && (
                  <button
                    type="button"
                    onClick={() => advance(r, "claimed", { claimed_by: staffId, claimed_at: new Date().toISOString() })}
                  >
                    Claim
                  </button>
                )}
                {r.state === "claimed" && mine && (
                  <button type="button" onClick={() => advance(r, "in_progress")}>
                    Start
                  </button>
                )}
                {r.state === "in_progress" && mine && (
                  <button type="button" onClick={() => advance(r, "done", { done_at: new Date().toISOString() })}>
                    Complete
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {ready && requests.length === 0 && <li>Nothing in the queue.</li>}
      </ul>
    </div>
  );
}
