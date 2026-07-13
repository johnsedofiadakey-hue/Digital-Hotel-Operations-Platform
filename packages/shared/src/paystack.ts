// Paystack API client (§9). Every function takes `secretKey` as a
// parameter rather than reading an env var directly — same reasoning as
// jwt.ts's `secret` parameter: this module is environment-agnostic, the
// caller (a server-only route handler) is responsible for supplying the key.
//
// IMPORTANT — this has never been called against a real Paystack account.
// No PAYSTACK_SECRET_KEY exists anywhere in this project (see
// HANDOVER.md) — everything here is implemented strictly against Paystack's
// public API docs (stable, versionless REST contract) and verified by
// constructing synthetic signed payloads locally, not by a real charge ever
// succeeding. Treat the shapes below as "written correctly against the
// spec," not "proven against the live service."

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export type MobileMoneyProvider = "mtn" | "vod" | "atl";

export interface InitiateMobileMoneyChargeParams {
  secretKey: string;
  email: string;
  amountMinorUnits: number; // pesewas
  reference: string;
  phone: string;
  provider: MobileMoneyProvider;
}

export interface PaystackChargeResult {
  ok: boolean;
  reference: string;
  status?: string; // 'pay_offline' | 'success' | 'failed' | ...
  displayText?: string; // "Approve the prompt on your phone" instructions
  raw: unknown;
}

async function paystackFetch(path: string, secretKey: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  return res.json();
}

export async function initiateMobileMoneyCharge(
  params: InitiateMobileMoneyChargeParams,
): Promise<PaystackChargeResult> {
  const raw = (await paystackFetch("/charge", params.secretKey, {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      amount: params.amountMinorUnits,
      currency: "GHS",
      reference: params.reference,
      mobile_money: { phone: params.phone, provider: params.provider },
    }),
  })) as {
    status: boolean;
    data?: { reference: string; status: string; display_text?: string };
  };

  return {
    ok: raw.status === true,
    reference: raw.data?.reference ?? params.reference,
    status: raw.data?.status,
    displayText: raw.data?.display_text,
    raw,
  };
}

export interface VerifyTransactionResult {
  ok: boolean;
  reference: string;
  status?: "success" | "failed" | "abandoned" | string;
  amountMinorUnits?: number;
  channel?: string;
  raw: unknown;
}

export async function verifyTransaction(reference: string, secretKey: string): Promise<VerifyTransactionResult> {
  const raw = (await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`, secretKey)) as {
    status: boolean;
    data?: { reference: string; status: string; amount: number; channel?: string };
  };

  return {
    ok: raw.status === true,
    reference: raw.data?.reference ?? reference,
    status: raw.data?.status,
    amountMinorUnits: raw.data?.amount,
    channel: raw.data?.channel,
    raw,
  };
}

export interface RefundResult {
  ok: boolean;
  raw: unknown;
}

export async function refundTransaction(
  reference: string,
  secretKey: string,
  amountMinorUnits?: number,
): Promise<RefundResult> {
  const raw = (await paystackFetch("/refund", secretKey, {
    method: "POST",
    body: JSON.stringify({
      transaction: reference,
      ...(amountMinorUnits ? { amount: amountMinorUnits } : {}),
    }),
  })) as { status: boolean };

  return { ok: raw.status === true, raw };
}

// Paystack signs webhook bodies with HMAC-SHA512 of the raw request body,
// hex-encoded, sent as the `x-paystack-signature` header. Must be checked
// against the *raw* body text — never re-serialize parsed JSON before
// verifying, formatting differences would break the signature.
export async function verifyPaystackWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretKey: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computedHex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqualHex(computedHex, signatureHeader);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
