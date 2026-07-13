import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase-server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";
import { getAuthenticatedAdmin } from "../../lib/admin-session";
import { MessagePage } from "../../components/MessagePage";

interface StaffListRow {
  id: string;
  name: string;
  active: boolean;
  branch_id: string | null;
  roles: { key: string } | { key: string }[] | null;
  branches: { name: string } | { name: string }[] | null;
}

function oneOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// §5.5's RBAC matrix: Branch Manager manages their own branch's staff,
// Owner manages every branch in their organization. Filtered here in
// application code rather than trusted to RLS — see the note in
// admin-session.ts and HANDOVER.md about the "owners can view all staff"
// policy also (unintentionally, per its own condition) covering
// branch_manager org-wide; this app enforces the tighter, spec-correct
// scope regardless of what the DB policy alone would allow.
export default async function StaffListPage() {
  const authDb = await createSupabaseServerClient();
  const admin = await getAuthenticatedAdmin(authDb);
  if (!admin) redirect("/login");

  const db = createServiceRoleClient(getServiceEnv());
  let query = db
    .from("staff")
    .select("id, name, active, branch_id, roles(key), branches(name)")
    .eq("organization_id", admin.organizationId)
    .order("active", { ascending: false })
    .order("name");

  if (admin.roleKey === "branch_manager") {
    if (!admin.branchId) redirect("/login"); // shouldn't happen — branch_manager is always branch-scoped
    query = query.eq("branch_id", admin.branchId);
  }

  const { data } = await query;
  const staff = (data ?? []) as StaffListRow[];

  return (
    <MessagePage title="Staff">
      <p style={{ marginBottom: "1rem" }}>
        <a href="/staff/new">+ Add staff member</a> · <a href="/dashboard">Back</a>
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: "0.4rem 0.5rem 0.4rem 0" }}>Name</th>
            <th style={{ padding: "0.4rem 0.5rem" }}>Role</th>
            <th style={{ padding: "0.4rem 0.5rem" }}>Branch</th>
            <th style={{ padding: "0.4rem 0.5rem" }}>Status</th>
            <th style={{ padding: "0.4rem 0 0.4rem 0.5rem" }}></th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => {
            const roleKey = oneOf(s.roles)?.key ?? "—";
            const branchName = oneOf(s.branches)?.name ?? "— (org-wide)";
            return (
              <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.4rem 0.5rem 0.4rem 0" }}>{s.name}</td>
                <td style={{ padding: "0.4rem 0.5rem" }}>{roleKey}</td>
                <td style={{ padding: "0.4rem 0.5rem" }}>{branchName}</td>
                <td style={{ padding: "0.4rem 0.5rem" }}>{s.active ? "Active" : "Deactivated"}</td>
                <td style={{ padding: "0.4rem 0 0.4rem 0.5rem" }}>
                  {s.active && s.id !== admin.staffId && (
                    <form action={`/staff/${s.id}/deactivate`} method="post">
                      <button type="submit">Deactivate</button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
          {staff.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: "0.75rem 0" }}>
                No staff yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </MessagePage>
  );
}
