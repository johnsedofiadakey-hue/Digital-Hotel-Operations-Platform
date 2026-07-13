// Collects a deposit (§9.1 [P2]) — staff enters the guest's MoMo number,
// this creates the deposit row then calls Paystack the same way
// guest-web's pay-now route does. Never verified against a real Paystack
// account (see packages/shared/src/paystack.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createStaffPinClient, createServiceRoleClient } from "@repo/shared/supabase";
import { getJwtSecret, getPublicSupabaseEnv, getServiceEnv, getPaystackSecretKey } from "@repo/shared/server-env";
import { initiateMobileMoneyCharge, type MobileMoneyProvider } from "@repo/shared/paystack";
import { STAFF_SESSION_COOKIE } from "../../../lib/cookies";
import { getAuthenticatedStaff } from "../../../lib/staff-session";

interface DepositChargeBody {
  stayId: string;
  amountMinorUnits: number;
  phone: string;
  provider: MobileMoneyProvider;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const serviceDb = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(serviceDb, token, getJwtSecret());
  if (!staff || !token) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const body = (await request.json()) as DepositChargeBody;
  if (!body.stayId || !body.amountMinorUnits || !body.phone || !body.provider) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const staffDb = createStaffPinClient(getPublicSupabaseEnv(), token);
  const { data: created, error } = await staffDb
    .rpc("create_deposit", { p_stay_id: body.stayId, p_amount_minor_units: body.amountMinorUnits })
    .single<{ deposit_id: string; provider_ref: string }>();

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? "could not create deposit" }, { status: 400 });
  }

  const charge = await initiateMobileMoneyCharge({
    secretKey: getPaystackSecretKey(),
    email: `staff-${staff.staffId}@dhop.invalid`,
    amountMinorUnits: body.amountMinorUnits,
    reference: created.provider_ref,
    phone: body.phone,
    provider: body.provider,
  });

  if (!charge.ok) {
    await serviceDb.rpc("resolve_deposit_outcome", {
      p_provider_ref: created.provider_ref,
      p_outcome: "failed",
      p_raw: charge.raw,
    });
  }

  return NextResponse.json({ chargeOk: charge.ok, displayText: charge.displayText, reference: created.provider_ref });
}
