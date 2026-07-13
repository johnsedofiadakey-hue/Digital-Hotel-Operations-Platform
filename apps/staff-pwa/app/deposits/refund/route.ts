// Refunds a held deposit (§9.1). The Paystack refund call happens here
// (application code, needs the secret key); mark_deposit_refunded only
// updates our own database afterward and re-checks the 'held' state itself,
// so this never marks something refunded that wasn't actually sent to
// Paystack.
import { NextResponse, type NextRequest } from "next/server";
import { createStaffPinClient, createServiceRoleClient } from "@repo/shared/supabase";
import { getJwtSecret, getPublicSupabaseEnv, getServiceEnv, getPaystackSecretKey } from "@repo/shared/server-env";
import { refundTransaction } from "@repo/shared/paystack";
import { STAFF_SESSION_COOKIE } from "../../../lib/cookies";
import { getAuthenticatedStaff } from "../../../lib/staff-session";

interface RefundBody {
  depositId: string;
  providerRef: string;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const serviceDb = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(serviceDb, token, getJwtSecret());
  if (!staff || !token) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const body = (await request.json()) as RefundBody;
  if (!body.depositId || !body.providerRef) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const refund = await refundTransaction(body.providerRef, getPaystackSecretKey());
  if (!refund.ok) {
    return NextResponse.json({ error: "Paystack refund call failed", raw: refund.raw }, { status: 502 });
  }

  const staffDb = createStaffPinClient(getPublicSupabaseEnv(), token);
  const { error } = await staffDb.rpc("mark_deposit_refunded", { p_deposit_id: body.depositId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
