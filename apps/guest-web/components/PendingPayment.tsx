"use client";

import { useEffect, useState, useRef } from "react";

interface Props {
  reference: string;
  displayText?: string;
  onResolved: (status: "success" | "failed") => void;
}

// §9.2's stated backoff: "Poll Paystack verify API at 30 s, 60 s, then
// every 60 s up to 15 min." This is the fallback path for a delayed/lost
// webhook — the webhook (server-side) and this poll (client-side) both
// call the same resolve_payment_outcome() choke point, so whichever
// signal lands first wins and the other is a no-op (§9.2's idempotency
// rule, verified in packages/shared's migration tests).
const BACKOFF_MS = [30_000, 60_000];
const STEADY_INTERVAL_MS = 60_000;
const TIMEOUT_MS = 15 * 60_000;

export function PendingPayment({ reference, displayText, onResolved }: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const stepRef = useRef(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await fetch(`/api/paystack/verify/${encodeURIComponent(reference)}`);
      const data = (await res.json()) as { status: string };
      if (cancelled) return;

      if (data.status === "success" || data.status === "failed") {
        onResolved(data.status);
        return;
      }

      const elapsed = Date.now() - startRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= TIMEOUT_MS) return; // the 15-min server-side sweep takes it from here

      const delay = BACKOFF_MS[stepRef.current] ?? STEADY_INTERVAL_MS;
      stepRef.current += 1;
      timer = setTimeout(poll, delay);
    }

    timer = setTimeout(poll, BACKOFF_MS[0]);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reference, onResolved]);

  const secondsLeft = Math.max(0, Math.round((TIMEOUT_MS - elapsedMs) / 1000));

  return (
    <div style={{ marginTop: "1rem", border: "1px solid", padding: "0.75rem" }}>
      <p>{displayText ?? "Approve the prompt on your phone."}</p>
      <p style={{ opacity: 0.7 }}>Waiting for confirmation… ({secondsLeft}s left before this expires)</p>
    </div>
  );
}
