// Express checkout (§7.4, §3.2). Same shape as pay-now/route.ts and for the
// same reason: initiate_express_checkout() can settle a zero balance
// entirely on its own, but a positive balance needs an actual Paystack
// charge, which needs the secret key — so this has to be a server route,
// not a direct client RPC call.
//
// "If payment fails, guest is routed to the desk — checkout is never
// blocked by a gateway error at the guest's expense" (§7.4): a failed
// charge here just leaves the stay active and the balance unsettled; there
// is deliberately no retry-checkout-automatically path, matching that
// principle — the fallback is a human at the desk, not another silent
// automatic attempt.
import { NextResponse, type NextRequest } from "next/server";
import { createGuestClient, createServiceRoleClient } from "@repo/shared/supabase";
import { verifyGuestSessionToken } from "@repo/shared/jwt";
import { getJwtSecret, getPublicSupabaseEnv, getServiceEnv, getPaystackSecretKey } from "@repo/shared/server-env";
import { initiateMobileMoneyCharge, type MobileMoneyProvider } from "@repo/shared/paystack";
import { GUEST_SESSION_COOKIE } from "../../../../lib/session-cookie";

interface ExpressCheckoutBody {
  phone?: string;
  provider?: MobileMoneyProvider;
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

  const body = (await request.json().catch(() => ({}))) as ExpressCheckoutBody;

  const guestDb = createGuestClient(getPublicSupabaseEnv(), token);
  const { data: initiated, error: initiateError } = await guestDb
    .rpc("initiate_express_checkout")
    .single<{ needs_payment: boolean; provider_ref: string | null; amount_minor_units: number }>();

  if (initiateError || !initiated) {
    return NextResponse.json({ error: initiateError?.message ?? "could not start checkout" }, { status: 400 });
  }

  if (!initiated.needs_payment) {
    return NextResponse.json({ done: true });
  }

  if (!body.phone || !body.provider) {
    return NextResponse.json(
      { error: "phone and provider required to settle the remaining balance", amountMinorUnits: initiated.amount_minor_units },
      { status: 400 },
    );
  }

  const charge = await initiateMobileMoneyCharge({
    secretKey: getPaystackSecretKey(),
    email: `guest-${claims.stay_id}@dhop.invalid`,
    amountMinorUnits: initiated.amount_minor_units,
    reference: initiated.provider_ref!,
    phone: body.phone,
    provider: body.provider,
  });

  if (!charge.ok) {
    const db = createServiceRoleClient(getServiceEnv());
    await db.rpc("resolve_checkout_settlement", {
      p_provider_ref: initiated.provider_ref,
      p_outcome: "failed",
      p_raw: charge.raw,
    });
  }

  return NextResponse.json({
    done: false,
    reference: initiated.provider_ref,
    amountMinorUnits: initiated.amount_minor_units,
    chargeOk: charge.ok,
    displayText: charge.displayText,
  });
}
