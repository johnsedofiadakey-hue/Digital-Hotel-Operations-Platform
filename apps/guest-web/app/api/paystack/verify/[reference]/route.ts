// Client-driven verify poll (§9.2: "Poll Paystack verify API at 30 s, 60 s,
// then every 60 s up to 15 min" — this is the fallback path for a webhook
// that's delayed or lost). Deliberately client-driven rather than a
// server-side cron: the guest's own pending-payment screen is already open
// and watching, which is the natural place to drive this from, and it
// avoids needing a reachable public URL for a scheduler to hit (unlike
// expire_stale_pending_payments(), which runs via pg_cron since it must
// fire even if nobody's device is open).
import { NextResponse, type NextRequest } from "next/server";
import { verifyTransaction } from "@repo/shared/paystack";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getPaystackSecretKey } from "@repo/shared/server-env";
import { resolvePaymentReference } from "../../../../../lib/resolve-payment-reference";

export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const secretKey = getPaystackSecretKey();

  const verified = await verifyTransaction(reference, secretKey);
  if (!verified.ok || !verified.status) {
    return NextResponse.json({ status: "unknown" });
  }

  if (verified.status !== "success" && verified.status !== "failed") {
    // Still pending on Paystack's side (e.g. "abandoned" isn't terminal
    // until our own 15-min sweep says so) — nothing to resolve yet.
    return NextResponse.json({ status: "pending" });
  }

  const db = createServiceRoleClient(getServiceEnv());
  const resolved = await resolvePaymentReference(db, reference, verified.status, verified.raw);

  return NextResponse.json({ status: verified.status, kind: resolved.kind, result: resolved.result });
}
