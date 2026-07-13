"use client";

import { useState } from "react";
import { formatGhs } from "@repo/shared/money";
import type { MobileMoneyProvider } from "@repo/shared/paystack";
import { PendingPayment } from "./PendingPayment";

const MOMO_PROVIDERS: { value: MobileMoneyProvider; label: string }[] = [
  { value: "mtn", label: "MTN Mobile Money" },
  { value: "vod", label: "Telecel Cash" },
  { value: "atl", label: "AirtelTigo Money" },
];

// §7.4 express checkout — pay off whatever's outstanding (if anything) via
// MoMo, then the stay closes. Zero balance means there's nothing to collect
// and checkout happens immediately (see initiate_express_checkout()).
export function CheckoutPanel() {
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<MobileMoneyProvider>("mtn");
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<{ reference: string; displayText?: string } | null>(null);
  const [outcome, setOutcome] = useState<"done" | "failed" | null>(null);
  const [needsBalance, setNeedsBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/portal/checkout/express", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(phone ? { phone, provider } : {}),
    });
    const data = (await res.json()) as {
      done?: boolean;
      reference?: string;
      displayText?: string;
      chargeOk?: boolean;
      amountMinorUnits?: number;
      error?: string;
    };
    setSubmitting(false);

    if (!res.ok) {
      if (data.amountMinorUnits) setNeedsBalance(data.amountMinorUnits);
      else setError(data.error ?? "Couldn't start checkout");
      return;
    }
    if (data.done) {
      setOutcome("done");
      return;
    }
    if (!data.chargeOk) {
      setOutcome("failed");
      return;
    }
    setPending({ reference: data.reference!, displayText: data.displayText });
  }

  if (outcome === "done") {
    return (
      <div>
        <p>You&apos;re checked out. Thanks for staying with us.</p>
        <p>
          <a href="/portal/receipt">View receipt</a>
        </p>
      </div>
    );
  }

  if (outcome === "failed") {
    return <p>That payment didn&apos;t go through — please see reception to settle your bill.</p>;
  }

  if (pending) {
    return (
      <PendingPayment
        reference={pending.reference}
        displayText={pending.displayText}
        onResolved={(status) => setOutcome(status === "success" ? "done" : "failed")}
      />
    );
  }

  return (
    <div>
      {needsBalance !== null && (
        <p>Outstanding balance: {formatGhs(needsBalance)} — enter your MoMo number to settle it.</p>
      )}
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
        <button type="button" disabled={submitting} onClick={submit}>
          {submitting ? "Checking…" : "Check out"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
