import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";
import { isValidPinFormat } from "@repo/shared/staff-pin";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { getAuthenticatedAdmin } from "../../../../lib/admin-session";
import { BRANCH_SCOPED_ROLES, EMAIL_REQUIRED_ROLES, PIN_REQUIRED_ROLES } from "../../../../lib/staff-roles";

function fail(request: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/staff/new?error=${code}`, request.url), { status: 303 });
}

export async function POST(request: NextRequest) {
  const authDb = await createSupabaseServerClient();
  const admin = await getAuthenticatedAdmin(authDb);
  if (!admin) return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const submittedBranchId = String(formData.get("branchId") ?? "").trim() || null;
  const pin = String(formData.get("pin") ?? "").trim();
  const emailInput = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const passwordInput = String(formData.get("password") ?? "");

  if (!name) return fail(request, "missing-fields");

  // Defense in depth beyond the form's own role dropdown, which was already
  // filtered client-side to what this actor is allowed to assign.
  const assignable: readonly string[] =
    admin.roleKey === "owner" ? [...BRANCH_SCOPED_ROLES, "owner"] : BRANCH_SCOPED_ROLES;
  if (!assignable.includes(role)) return fail(request, "role-not-allowed");

  // Owner is org-scoped (branch_id null, forced) regardless of what's
  // submitted. Branch Manager can only ever create staff in their own
  // branch — the form sends this as a hidden field, but it's re-derived
  // here from the session rather than trusted from the request.
  let branchId: string | null;
  if (role === "owner") {
    branchId = null;
  } else if (admin.roleKey === "branch_manager") {
    branchId = admin.branchId;
  } else {
    branchId = submittedBranchId;
  }

  if (role !== "owner") {
    if (!branchId) return fail(request, "missing-fields");
    const db0 = createServiceRoleClient(getServiceEnv());
    const { data: branch } = await db0
      .from("branches")
      .select("id")
      .eq("id", branchId)
      .eq("organization_id", admin.organizationId)
      .maybeSingle<{ id: string }>();
    if (!branch) return fail(request, "role-not-allowed");
  }

  const needsEmail = EMAIL_REQUIRED_ROLES.has(role);
  if (needsEmail && (!emailInput || passwordInput.length < 8)) return fail(request, "missing-fields");

  const needsPin = PIN_REQUIRED_ROLES.has(role);
  if (needsPin && !isValidPinFormat(pin)) return fail(request, "missing-fields");

  const db = createServiceRoleClient(getServiceEnv());

  if (needsPin && branchId) {
    const { data: pinMatch } = await db
      .rpc("verify_staff_pin", { p_branch_id: branchId, p_pin: pin })
      .maybeSingle();
    if (pinMatch) return fail(request, "pin-taken");
  }

  // Every staff row needs a real auth.users row for RLS's auth.uid()-keyed
  // helper functions to resolve, even PIN-only staff who never log in with
  // it directly (see staff-jwt.ts). A synthetic, non-deliverable email is
  // fine for those — nothing ever sends them mail or expects them to use it.
  const email = emailInput || `staff-${crypto.randomUUID()}@staff.dhop.internal`;
  const password = needsEmail ? passwordInput : crypto.randomUUID();

  const { data: created, error: createUserError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createUserError || !created.user) {
    const code = createUserError?.message?.includes("already been registered") ? "email-taken" : "1";
    return fail(request, code);
  }

  const { data: roleRow } = await db.from("roles").select("id").eq("key", role).single<{ id: string }>();
  if (!roleRow) {
    await db.auth.admin.deleteUser(created.user.id);
    return fail(request, "1");
  }

  const { data: staffRow, error: staffError } = await db
    .from("staff")
    .insert({
      user_id: created.user.id,
      organization_id: admin.organizationId,
      branch_id: branchId,
      role_id: roleRow.id,
      name,
      active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (staffError || !staffRow) {
    await db.auth.admin.deleteUser(created.user.id);
    return fail(request, "1");
  }

  if (needsPin && branchId) {
    const { data: hashed } = await db.rpc("hash_staff_pin", { p_pin: pin }).single<string>();
    if (!hashed) {
      // Staff row already exists at this point — don't roll the whole
      // thing back over a PIN-hash failure. Leave the account active
      // without a PIN rather than orphan it. There's no PIN-reset UI yet
      // (a real gap — see HANDOVER.md), so this genuinely leaves the new
      // hire unable to tap in until someone sets one directly in the DB.
      return NextResponse.redirect(new URL("/staff?warning=pin-not-set", request.url), { status: 303 });
    }
    await db.from("staff_pins").insert({ staff_id: staffRow.id, branch_id: branchId, pin_hash: hashed });
  }

  await db.from("audit_log").insert({
    organization_id: admin.organizationId,
    branch_id: branchId,
    actor_staff_id: admin.staffId,
    action: "staff_created",
    entity_type: "staff",
    entity_id: staffRow.id,
    metadata: { role, name },
  });

  return NextResponse.redirect(new URL("/staff?created=1", request.url), { status: 303 });
}
