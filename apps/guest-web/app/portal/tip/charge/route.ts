// Initiates the Paystack charge for a tip already created via
// initiate_tip() (called directly from the browser — no secret key needed
// for that RPC, it just opens a `pending` row). The charge call itself
// needs PAYSTACK_SECRET_KEY, so it has to be a server route, same reasoning
// as pay-now/route.ts and checkout/express/route.ts.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { verifyGuestSessionToken } from "@repo/shared/jwt";
import { getJwtSecret, getServiceEnv, getPaystackSecretKey } from "@repo/shared/server-env";
import { initiateMobileMoneyCharge, type MobileMoneyProvider } from "@repo/shared/paystack";
import { GUEST_SESSION_COOKIE } from "../../../../lib/session-cookie";

interface TipChargeBody {
  reference: string;
  amountMinorUnits: number;
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

  const body = (await request.json()) as TipChargeBody;
  if (!body.reference || !body.amountMinorUnits || !body.phone || !body.provider) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const charge = await initiateMobileMoneyCharge({
    secretKey: getPaystackSecretKey(),
    email: `guest-${claims.stay_id}@dhop.invalid`,
    amountMinorUnits: body.amountMinorUnits,
    reference: body.reference,
    phone: body.phone,
    provider: body.provider,
  });

  if (!charge.ok) {
    const db = createServiceRoleClient(getServiceEnv());
    await db.rpc("resolve_tip_outcome", { p_provider_ref: body.reference, p_outcome: "failed", p_raw: charge.raw });
  }

  return NextResponse.json({ chargeOk: charge.ok, displayText: charge.displayText });
}
