import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";

// Mirrors /setup/page.tsx's guard: refuse to create a second bootstrap
// Owner once any staff exist, even if someone posts here directly.
export async function POST(request: NextRequest) {
  const db = createServiceRoleClient(getServiceEnv());

  const { count: staffCount } = await db.from("staff").select("id", { count: "exact", head: true });
  if ((staffCount ?? 0) > 0) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const organizationId = formData.get("organizationId") ? String(formData.get("organizationId")) : null;
  const organizationName = String(formData.get("organizationName") ?? "").trim();

  if (!name || !email || password.length < 8) {
    return NextResponse.redirect(new URL("/setup?error=1", request.url), { status: 303 });
  }

  let orgId = organizationId;
  if (!orgId) {
    if (!organizationName) {
      return NextResponse.redirect(new URL("/setup?error=1", request.url), { status: 303 });
    }
    const { data: org, error: orgError } = await db
      .from("organizations")
      .insert({ name: organizationName })
      .select("id")
      .single<{ id: string }>();
    if (orgError || !org) {
      return NextResponse.redirect(new URL("/setup?error=1", request.url), { status: 303 });
    }
    orgId = org.id;
  }

  const { data: created, error: createUserError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createUserError || !created.user) {
    const reason = createUserError?.message?.includes("already been registered")
      ? "email-taken"
      : "1";
    return NextResponse.redirect(new URL(`/setup?error=${reason}`, request.url), { status: 303 });
  }

  const { data: ownerRole } = await db.from("roles").select("id").eq("key", "owner").single<{ id: string }>();
  if (!ownerRole) {
    // Should never happen — 'owner' is seeded in the Sprint 1 migration —
    // but don't leave an orphaned auth.users row with no staff record.
    await db.auth.admin.deleteUser(created.user.id);
    return NextResponse.redirect(new URL("/setup?error=1", request.url), { status: 303 });
  }

  const { error: staffError } = await db.from("staff").insert({
    user_id: created.user.id,
    organization_id: orgId,
    branch_id: null,
    role_id: ownerRole.id,
    name,
    active: true,
  });
  if (staffError) {
    await db.auth.admin.deleteUser(created.user.id);
    return NextResponse.redirect(new URL("/setup?error=1", request.url), { status: 303 });
  }

  return NextResponse.redirect(new URL("/login?created=1", request.url), { status: 303 });
}
