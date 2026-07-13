import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentReferenceKind = "payment" | "checkout_settlement" | "tip" | "deposit" | "unknown";

const RESOLVERS: { kind: PaymentReferenceKind; rpc: string }[] = [
  { kind: "payment", rpc: "resolve_payment_outcome" },
  { kind: "checkout_settlement", rpc: "resolve_checkout_settlement" },
  { kind: "tip", rpc: "resolve_tip_outcome" },
  { kind: "deposit", rpc: "resolve_deposit_outcome" },
];

// Every Paystack reference this app mints belongs to exactly one of these
// tables — each with its own `resolve_*_outcome` choke point (§9.2's
// idempotency rule, one per reference namespace). A reference is tried
// against each resolver in turn; the first one that recognizes it
// (anything other than `'unknown_reference'`) stops the chain.
export async function resolvePaymentReference(
  db: SupabaseClient,
  reference: string,
  outcome: "success" | "failed",
  raw: unknown,
): Promise<{ kind: PaymentReferenceKind; result: string | null }> {
  for (const resolver of RESOLVERS) {
    const { data, error } = await db.rpc(resolver.rpc, {
      p_provider_ref: reference,
      p_outcome: outcome,
      p_raw: raw,
    });
    if (error) throw error;
    if (data !== "unknown_reference") {
      return { kind: resolver.kind, result: data };
    }
  }

  return { kind: "unknown", result: null };
}
