import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyStaffSessionToken } from "@repo/shared/staff-jwt";

export interface AuthenticatedStaff {
  staffId: string;
  userId: string;
  branchId: string | null;
  name: string;
  roleKey: string;
}

interface StaffRow {
  id: string;
  branch_id: string | null;
  name: string;
  roles: { key: string } | { key: string }[] | null;
}

// Privileged actions (check-in, force-close) run through the service-role
// client — same reasoning as the guest routes — so this re-derives the
// acting staff member's identity and role from their session cookie itself,
// rather than trusting RLS to gate a write it never applies to.
export async function getAuthenticatedStaff(
  db: SupabaseClient,
  sessionToken: string | undefined,
  jwtSecret: string,
): Promise<AuthenticatedStaff | null> {
  if (!sessionToken) return null;

  const claims = await verifyStaffSessionToken(sessionToken, jwtSecret);
  if (!claims) return null;

  const { data: staff } = await db
    .from("staff")
    .select("id, branch_id, name, roles(key), active")
    .eq("user_id", claims.sub)
    .eq("active", true)
    .maybeSingle<StaffRow & { active: boolean }>();

  if (!staff) return null;

  const roleKey = Array.isArray(staff.roles) ? staff.roles[0]?.key : staff.roles?.key;
  if (!roleKey) return null;

  return {
    staffId: staff.id,
    userId: claims.sub,
    branchId: staff.branch_id,
    name: staff.name,
    roleKey,
  };
}

// §3.2's check-in guard, §5.5's access matrix: these roles run reception's
// desk duties. Kitchen/housekeeping/maintenance/finance/concierge never
// check guests in.
export const CHECKIN_CAPABLE_ROLES = new Set(["reception", "branch_manager", "owner"]);
