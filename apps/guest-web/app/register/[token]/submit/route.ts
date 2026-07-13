import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await request.formData();
  const fullName = String(form.get("full_name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();

  if (!fullName || !phone) {
    return NextResponse.redirect(new URL(`/register/${token}?error=missing_fields`, request.url));
  }

  const db = createServiceRoleClient(getServiceEnv());
  const { data: reservation } = await db
    .from("reservations")
    .select("id, status")
    .eq("registration_token", token)
    .maybeSingle<{ id: string; status: string }>();

  if (!reservation || reservation.status !== "pending") {
    return NextResponse.redirect(new URL(`/register/${token}?error=invalid`, request.url));
  }

  await db
    .from("reservations")
    .update({
      pre_registration: { full_name: fullName, phone, notes },
      pre_registered_at: new Date().toISOString(),
    })
    .eq("id", reservation.id);

  return NextResponse.redirect(new URL(`/register/${token}`, request.url));
}
