"use client";

import { useEffect, useState, useCallback, useRef, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGuestClient } from "@repo/shared/supabase";
import { canTransition, REQUEST_TRANSITIONS } from "@repo/shared/state-machines";
import type { RequestState, RequestType, GuestSessionTier } from "@repo/shared/types";

interface RequestRow {
  id: string;
  type: RequestType;
  state: RequestState;
  note: string | null;
  submitted_at: string;
}

// Concierge is chat, not a request type a guest submits from this form (§4.4).
const REQUEST_TYPES: RequestType[] = ["housekeeping", "maintenance", "laundry"];

const REQUEST_STATE_PILL: Record<RequestState, string> = {
  submitted: "status-neutral",
  claimed: "status-progress",
  in_progress: "status-progress",
  done: "status-good",
  confirmed: "status-good",
  cancelled: "status-critical",
  reopened: "status-progress",
};

interface Props {
  tier: GuestSessionTier;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §8.1 request lifecycle, guest side. Live updates are "Broadcast from
// Database" (§14.4) — the `requests:stay:{stay_id}` topic gets a
// content-free ping on every insert/update (see the trigger in
// 20260711170000_requests.sql), and this component just re-reads through
// its own RLS-scoped connection on receipt, rather than trusting broadcast
// payload data. "guest sees it live" (§15 Sprint 2 exit test) depends on it.
export function RequestsPanel({ tier, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const stayIdRef = useRef<string | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [ready, setReady] = useState(false);
  const [type, setType] = useState<RequestType>("housekeeping");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    const stayId = stayIdRef.current;
    if (!client || !stayId) return;
    const { data } = await client
      .from("requests")
      .select("id, type, state, note, submitted_at")
      .eq("stay_id", stayId)
      .order("submitted_at", { ascending: false });
    if (data) setRequests(data as RequestRow[]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const res = await fetch("/portal/token");
      if (!res.ok) return;
      const { token, stayId: sid } = (await res.json()) as { token: string; stayId: string };
      if (cancelled) return;

      clientRef.current = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      stayIdRef.current = sid;
      setReady(true);
      await refetch();

      clientRef.current
        .channel(`requests:stay:${sid}`)
        .on("broadcast", { event: "request_submitted" }, () => void refetch())
        .on("broadcast", { event: "request_updated" }, () => void refetch())
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [supabaseUrl, supabaseAnonKey, refetch]);

  const submitRequest = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const client = clientRef.current;
      const stayId = stayIdRef.current;
      if (!client || !stayId) return;
      setSubmitting(true);
      await client.from("requests").insert({ stay_id: stayId, type, note: note || null });
      setNote("");
      setSubmitting(false);
      await refetch();
    },
    [type, note, refetch],
  );

  const respondToDone = useCallback(
    async (request: RequestRow, next: "confirmed" | "reopened") => {
      const client = clientRef.current;
      if (!client || !canTransition(REQUEST_TRANSITIONS, request.state, next)) return;
      await client.from("requests").update({ state: next }).eq("id", request.id);
      await refetch();
    },
    [refetch],
  );

  return (
    <div>
      <h2 className="section-title">Requests</h2>

      {tier !== "post_stay" && (
        <form onSubmit={submitRequest} className="card" style={{ marginBottom: "0.75rem" }}>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as RequestType)}>
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="submit" className="btn-gold" disabled={!ready || submitting}>
            Submit request
          </button>
        </form>
      )}

      {requests.map((r) => (
        <div key={r.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
            <div>
              <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{r.type}</div>
              {r.note && <div className="muted">{r.note}</div>}
            </div>
            <span className={`status-pill ${REQUEST_STATE_PILL[r.state]}`}>{r.state.replace("_", " ")}</span>
          </div>
          {r.state === "done" && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button type="button" className="btn-gold" onClick={() => respondToDone(r, "confirmed")}>
                Confirm
              </button>
              <button type="button" className="btn-outline" onClick={() => respondToDone(r, "reopened")}>
                Reopen
              </button>
            </div>
          )}
        </div>
      ))}
      {requests.length === 0 && <p className="muted">No requests yet.</p>}
    </div>
  );
}
