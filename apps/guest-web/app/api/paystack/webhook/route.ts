// Paystack webhook receiver (§9.2). Never verified against a real Paystack
// account (see packages/shared/src/paystack.ts) — signature verification
// and payload parsing are implemented against Paystack's documented
// contract and exercised locally with synthetic self-signed payloads.
//
// Must read the raw body text *before* parsing JSON — the signature is
// computed over the exact bytes Paystack sent, and re-serializing parsed
// JSON would produce a different byte sequence and always fail to verify.
import { NextResponse, type NextRequest } from "next/server";
import { verifyPaystackWebhookSignature, refundTransaction } from "@repo/shared/paystack";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getPaystackSecretKey } from "@repo/shared/server-env";
import { resolvePaymentReference } from "../../../../lib/resolve-payment-reference";

interface PaystackWebhookBody {
  event: string;
  data: { reference: string; status: string };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secretKey = getPaystackSecretKey();

  const valid = await verifyPaystackWebhookSignature(
    rawBody,
    request.headers.get("x-paystack-signature"),
    secretKey,
  );
  if (!valid) {
    // Deliberately generic — never confirm/deny which part of the check failed.
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as PaystackWebhookBody;
  const reference = body.data?.reference;
  if (!reference) {
    return NextResponse.json({ ok: true }); // nothing to do, but ack so Paystack stops retrying
  }

  // Paystack's primary success signal is `charge.success`; declines are
  // more commonly caught by the verify poller than a dedicated webhook, but
  // handled here defensively too in case one arrives.
  const outcome = body.event === "charge.success" || body.data.status === "success" ? "success" : "failed";

  const db = createServiceRoleClient(getServiceEnv());
  let resolved: Awaited<ReturnType<typeof resolvePaymentReference>>;
  try {
    resolved = await resolvePaymentReference(db, reference, outcome, body);
  } catch (error) {
    console.error("resolvePaymentReference failed", error);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  if (resolved.result === "refund_late_success" || resolved.result === "refund_double_payment") {
    const refund = await refundTransaction(reference, secretKey);
    if (!refund.ok) {
      console.error("Paystack refund call failed", reference, refund.raw);
    }
  }

  return NextResponse.json({ ok: true, kind: resolved.kind, result: resolved.result });
}
