"use client";

import { useState } from "react";
import { createGuestClient } from "@repo/shared/supabase";
import { formatGhs } from "@repo/shared/money";
import type { MobileMoneyProvider } from "@repo/shared/paystack";
import { PendingPayment } from "./PendingPayment";

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const PRESETS_GHS = [5, 10, 20, 50];
const MOMO_PROVIDERS: { value: MobileMoneyProvider; label: string }[] = [
  { value: "mtn", label: "MTN Mobile Money" },
  { value: "vod", label: "Telecel Cash" },
  { value: "atl", label: "AirtelTigo Money" },
];

// §7.3 tipping [P2] — "pay-now by nature, available at both trust tiers."
export function TipForm({ supabaseUrl, supabaseAnonKey }: Props) {
  const [amountGhs, setAmountGhs] = useState(10);
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<MobileMoneyProvider>("mtn");
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<{ reference: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function submit() {
    if (!phone) return;
    setSubmitting(true);
    setStatus(null);

    const tokenRes = await fetch("/portal/token");
    const { token } = (await tokenRes.json()) as { token: string };
    const client = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);

    const { data: initiated, error } = await client
      .rpc("initiate_tip", { p_amount_minor_units: Math.round(amountGhs * 100) })
      .single<{ tip_id: string; provider_ref: string }>();

    if (error || !initiated) {
      setStatus(`Couldn't start: ${error?.message ?? "unknown error"}`);
      setSubmitting(false);
      return;
    }

    const chargeRes = await fetch("/portal/tip/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: initiated.provider_ref, amountMinorUnits: Math.round(amountGhs * 100), phone, provider }),
    });
    const chargeData = (await chargeRes.json()) as { chargeOk: boolean; displayText?: string };
    setSubmitting(false);

    if (!chargeData.chargeOk) {
      setStatus("Couldn't start the payment prompt — check the number and try again.");
      return;
    }
    setPending({ reference: initiated.provider_ref });
  }

  if (pending) {
    return (
      <PendingPayment
        reference={pending.reference}
        onResolved={(s) => {
          setPending(null);
          setStatus(s === "success" ? "Thank you!" : "That didn't go through.");
        }}
      />
    );
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>Leave a tip</h2>
      <div style={{ display: "flex", gap: "0.35rem", margin: "0.5rem 0" }}>
        {PRESETS_GHS.map((amt) => (
          <button key={amt} type="button" onClick={() => setAmountGhs(amt)} style={{ fontWeight: amt === amountGhs ? "bold" : "normal" }}>
            {formatGhs(amt * 100)}
          </button>
        ))}
      </div>
      <label>
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
      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" disabled={submitting || !phone} onClick={submit}>
          {submitting ? "Starting…" : `Tip ${formatGhs(amountGhs * 100)}`}
        </button>
      </div>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
