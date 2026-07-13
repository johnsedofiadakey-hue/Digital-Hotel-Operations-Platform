// Pay-now order placement (§9.1 — available at both trust tiers, unlike
// charge-to-room). Unlike Sprint 3's charge-to-room path, this can't be a
// plain client-side RPC call: initiating the Paystack charge needs the
// secret key, which must never reach the browser. So the guest's cart POSTs
// here; the route calls place_pay_now_order() using the guest's own bearer
// token (the RPC still self-authorizes exactly as it would from the
// browser — using it from our server instead of directly from the client
// changes nothing about what it's allowed to do), then calls Paystack.
//
// Never verified against a real Paystack account (see
// packages/shared/src/paystack.ts) — no PAYSTACK_SECRET_KEY exists yet.
import { NextResponse, type NextRequest } from "next/server";
import { createGuestClient, createServiceRoleClient } from "@repo/shared/supabase";
import { verifyGuestSessionToken } from "@repo/shared/jwt";
import { getJwtSecret, getPublicSupabaseEnv, getServiceEnv, getPaystackSecretKey } from "@repo/shared/server-env";
import { initiateMobileMoneyCharge, type MobileMoneyProvider } from "@repo/shared/paystack";
import { GUEST_SESSION_COOKIE } from "../../../../lib/session-cookie";

interface PayNowRequestBody {
  items: { menu_item_id: string; quantity: number }[];
  phone: string;
  provider: MobileMoneyProvider;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(GUEST_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const claims = await verifyGuestSessionToken(token, getJwtSecret());
  if (!claims) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  const body = (await request.json()) as PayNowRequestBody;
  if (!body.items?.length || !body.phone || !body.provider) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const guestDb = createGuestClient(getPublicSupabaseEnv(), token);
  const { data: placed, error: placeError } = await guestDb
    .rpc("place_pay_now_order", { p_items: body.items })
    .single<{ order_id: string; payment_id: string; provider_ref: string; total_minor_units: number }>();

  if (placeError || !placed) {
    return NextResponse.json({ error: placeError?.message ?? "could not place order" }, { status: 400 });
  }

  const charge = await initiateMobileMoneyCharge({
    secretKey: getPaystackSecretKey(),
    email: `guest-${claims.stay_id}@dhop.invalid`,
    amountMinorUnits: placed.total_minor_units,
    reference: placed.provider_ref,
    phone: body.phone,
    provider: body.provider,
  });

  // If Paystack rejected the charge synchronously (bad phone, provider
  // outage, etc.), no async process was ever started — there is nothing
  // for the guest's poll or the 15-min sweep to eventually resolve. Fail
  // it immediately instead of leaving the order stuck in `pending` for up
  // to 15 minutes with no prompt ever having reached the guest's phone.
  if (!charge.ok) {
    const db = createServiceRoleClient(getServiceEnv());
    await db.rpc("resolve_payment_outcome", {
      p_provider_ref: placed.provider_ref,
      p_outcome: "failed",
      p_raw: charge.raw,
    });
  }

  return NextResponse.json({
    orderId: placed.order_id,
    reference: placed.provider_ref,
    chargeOk: charge.ok,
    displayText: charge.displayText,
    status: charge.status,
  });
}
