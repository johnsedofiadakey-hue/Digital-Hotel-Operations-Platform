import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthenticatedAdmin {
  staffId: string;
  userId: string;
  organizationId: string;
  branchId: string | null; // null for owner/super_admin — org/platform-scoped
  name: string;
  roleKey: string;
}

interface StaffRow {
  id: string;
  organization_id: string;
  branch_id: string | null;
  name: string;
  roles: { key: string } | { key: string }[] | null;
}

// admin-web only ever accepts these three roles — everyone else (kitchen,
// housekeeping, reception, ...) lives in staff-pwa. A staff row existing
// with a different role_key but a real auth.users login (possible if
// someone was created with an email for other reasons) must still be
// refused here.
export const ADMIN_ROLES = new Set(["branch_manager", "owner", "super_admin"]);

// Uses the caller's own authenticated client (not service-role) — RLS's
// "staff can view self" policy (user_id = auth.uid()) is exactly the query
// this needs, so there's no reason to bypass RLS for an identity lookup the
// way the PIN-based apps have to (they have no real GoTrue session for RLS
// to key off yet at that point).
export async function getAuthenticatedAdmin(db: SupabaseClient): Promise<AuthenticatedAdmin | null> {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: staff } = await db
    .from("staff")
    .select("id, organization_id, branch_id, name, roles(key), active")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle<StaffRow & { active: boolean }>();

  if (!staff) return null;

  const roleKey = Array.isArray(staff.roles) ? staff.roles[0]?.key : staff.roles?.key;
  if (!roleKey || !ADMIN_ROLES.has(roleKey)) return null;

  return {
    staffId: staff.id,
    userId: user.id,
    organizationId: staff.organization_id,
    branchId: staff.branch_id,
    name: staff.name,
    roleKey,
  };
}
