"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";
import { formatGhs } from "@repo/shared/money";
import type { MobileMoneyProvider } from "@repo/shared/paystack";

interface StayRow {
  id: string;
  last_names: string[];
  rooms: { label: string } | { label: string }[] | null;
}

interface DepositRow {
  id: string;
  stay_id: string;
  provider_ref: string;
  state: string;
  amount_minor_units: number;
  created_at: string;
}

interface Props {
  branchId: string;
  roleKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const MOMO_PROVIDERS: { value: MobileMoneyProvider; label: string }[] = [
  { value: "mtn", label: "MTN Mobile Money" },
  { value: "vod", label: "Telecel Cash" },
  { value: "atl", label: "AirtelTigo Money" },
];

// §9.1 deposits / incidental holds [P2]. Refund-at-checkout is NOT wired up
// automatically (see HANDOVER.md) — refunding a held deposit is a manual
// staff action here, matching the spec's own note that "MoMo refunds can
// take time to land," which already implies human oversight of this step.
export function DepositsPanel({ branchId, roleKey, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [stays, setStays] = useState<StayRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [selectedStayId, setSelectedStayId] = useState("");
  const [amountGhs, setAmountGhs] = useState(100);
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<MobileMoneyProvider>("mtn");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const canForfeit = roleKey === "branch_manager" || roleKey === "owner";

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const { data } = await client
      .from("deposits")
      .select("id, stay_id, provider_ref, state, amount_minor_units, created_at")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false });
    if (data) setDeposits(data as DepositRow[]);
  }, [branchId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const res = await fetch("/session/token");
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      if (cancelled) return;
      clientRef.current = createStaffPinClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);

      const { data: stayRows } = await clientRef.current
        .from("stays")
        .select("id, last_names, rooms(label)")
        .eq("branch_id", branchId)
        .eq("state", "active");
      if (stayRows) setStays(stayRows as unknown as StayRow[]);

      await refetch();
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [branchId, supabaseUrl, supabaseAnonKey, refetch]);

  function roomLabel(stay: StayRow): string {
    const rooms = stay.rooms;
    const room = Array.isArray(rooms) ? rooms[0] : rooms;
    return room?.label ?? "?";
  }

  async function collect() {
    if (!selectedStayId || !phone) return;
    setSubmitting(true);
    setStatus(null);
    const res = await fetch("/deposits/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stayId: selectedStayId, amountMinorUnits: Math.round(amountGhs * 100), phone, provider }),
    });
    const data = (await res.json()) as { chargeOk?: boolean; error?: string };
    setSubmitting(false);
    setStatus(data.chargeOk ? "Prompt sent to guest's phone." : `Couldn't start: ${data.error ?? "unknown error"}`);
    await refetch();
  }

  async function refund(deposit: DepositRow) {
    setStatus(null);
    const res = await fetch("/deposits/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depositId: deposit.id, providerRef: deposit.provider_ref }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setStatus(data.ok ? "Refunded." : `Refund failed: ${data.error ?? "unknown error"}`);
    await refetch();
  }

  async function forfeit(deposit: DepositRow) {
    const client = clientRef.current;
    const reason = window.prompt("Reason for forfeiting this deposit?");
    if (!client || reason === null) return;
    const { error } = await client.rpc("forfeit_deposit", {
      p_deposit_id: deposit.id,
      p_amount_minor_units: deposit.amount_minor_units,
      p_reason: reason || "Deposit forfeited",
    });
    setStatus(error ? `Couldn't forfeit: ${error.message}` : "Forfeited — posted to folio.");
    await refetch();
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Collect a deposit</h2>
      <select value={selectedStayId} onChange={(e) => setSelectedStayId(e.target.value)}>
        <option value="">Select a stay</option>
        {stays.map((stay) => (
          <option key={stay.id} value={stay.id}>
            Room {roomLabel(stay)} ({stay.last_names[0] ?? "guest"})
          </option>
        ))}
      </select>
      <div style={{ marginTop: "0.5rem" }}>
        <label>
          Amount (GHS)
          <input type="number" min={1} value={amountGhs} onChange={(e) => setAmountGhs(Number(e.target.value))} />
        </label>
        <label style={{ marginLeft: "0.5rem" }}>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0244000000" />
        </label>
        <label style={{ marginLeft: "0.5rem" }}>
          Network
          <select value={provider} onChange={(e) => setProvider(e.target.value as MobileMoneyProvider)}>
            {MOMO_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" disabled={submitting || !selectedStayId || !phone} onClick={collect}>
          {submitting ? "Starting…" : "Collect deposit"}
        </button>
      </div>
      {status && <p role="status">{status}</p>}

      <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem", marginBottom: "0.75rem" }}>Deposits</h2>
      <ul style={{ display: "grid", gap: "0.5rem", listStyle: "none", padding: 0 }}>
        {deposits.map((d) => (
          <li key={d.id} style={{ border: "1px solid", padding: "0.5rem 0.75rem" }}>
            {formatGhs(d.amount_minor_units)} — <strong>{d.state}</strong>
            {d.state === "held" && (
              <>
                {" "}
                <button type="button" onClick={() => refund(d)}>
                  Refund
                </button>{" "}
                {canForfeit && (
                  <button type="button" onClick={() => forfeit(d)}>
                    Forfeit
                  </button>
                )}
              </>
            )}
          </li>
        ))}
        {deposits.length === 0 && <li>No deposits yet.</li>}
      </ul>
    </div>
  );
}
