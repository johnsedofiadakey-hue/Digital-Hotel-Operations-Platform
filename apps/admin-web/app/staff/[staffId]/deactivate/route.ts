import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { getAuthenticatedAdmin } from "../../../../lib/admin-session";

// §5.4 offboarding: kills sessions and PINs immediately, unassigns nothing
// automatically (open requests/orders stay claimed — reassignment is a
// manual follow-up, not modeled here), keeps historical attribution intact.
// "Kills sessions immediately" falls out for free: staff-session.ts's
// getAuthenticatedStaff already filters .eq("active", true) on every call,
// so the very next request with their session cookie fails auth — no
// separate token-revocation list needed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const authDb = await createSupabaseServerClient();
  const admin = await getAuthenticatedAdmin(authDb);
  if (!admin) return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const { staffId } = await params;
  if (staffId === admin.staffId) {
    return NextResponse.redirect(new URL("/staff?error=self", request.url), { status: 303 });
  }

  const db = createServiceRoleClient(getServiceEnv());
  const { data: target } = await db
    .from("staff")
    .select("id, organization_id, branch_id")
    .eq("id", staffId)
    .maybeSingle<{ id: string; organization_id: string; branch_id: string | null }>();

  if (!target || target.organization_id !== admin.organizationId) {
    return NextResponse.redirect(new URL("/staff", request.url), { status: 303 });
  }
  if (admin.roleKey === "branch_manager" && target.branch_id !== admin.branchId) {
    return NextResponse.redirect(new URL("/staff", request.url), { status: 303 });
  }

  await db.from("staff").update({ active: false }).eq("id", staffId);
  await db
    .from("staff_pins")
    .update({ revoked_at: new Date().toISOString() })
    .eq("staff_id", staffId)
    .is("revoked_at", null);

  await db.from("audit_log").insert({
    organization_id: admin.organizationId,
    branch_id: target.branch_id,
    actor_staff_id: admin.staffId,
    action: "staff_deactivated",
    entity_type: "staff",
    entity_id: staffId,
    metadata: {},
  });

  return NextResponse.redirect(new URL("/staff", request.url), { status: 303 });
}
