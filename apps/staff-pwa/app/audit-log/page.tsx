import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";
import { getAuthenticatedStaff } from "../../lib/staff-session";

const MANAGER_ROLES = new Set(["branch_manager", "owner"]);

interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}

interface SecurityEventRow {
  id: string;
  event_type: string;
  created_at: string;
}

// §13: "Audit log from day one... append-only." §5.5's role matrix already
// gates this to branch_manager/owner at the RLS layer
// (managers can view audit log/security events for own branch); this page
// just surfaces what's already there rather than leaving it Studio-only.
export default async function AuditLogPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());
  if (!staff) redirect("/pin");

  if (!staff.branchId || !MANAGER_ROLES.has(staff.roleKey)) {
    return (
      <MessagePage title="Audit log">
        <p>The audit log is available to branch managers and owners.</p>
      </MessagePage>
    );
  }

  const { data: auditRows } = await db
    .from("audit_log")
    .select("id, action, entity_type, entity_id, created_at")
    .eq("branch_id", staff.branchId)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: securityRows } = await db
    .from("security_events")
    .select("id, event_type, created_at")
    .eq("branch_id", staff.branchId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <MessagePage title="Audit log">
      <h2 style={{ fontSize: "1.1rem" }}>Actions</h2>
      <ul>
        {((auditRows ?? []) as AuditLogRow[]).map((row) => (
          <li key={row.id}>
            {new Date(row.created_at).toLocaleString()} — {row.action} ({row.entity_type})
          </li>
        ))}
        {(auditRows ?? []).length === 0 && <li>No actions logged yet.</li>}
      </ul>

      <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>Security events</h2>
      <ul>
        {((securityRows ?? []) as SecurityEventRow[]).map((row) => (
          <li key={row.id}>
            {new Date(row.created_at).toLocaleString()} — {row.event_type}
          </li>
        ))}
        {(securityRows ?? []).length === 0 && <li>No security events.</li>}
      </ul>

      <p style={{ marginTop: "1.5rem" }}>
        <a href="/reports">Back</a>
      </p>
    </MessagePage>
  );
}
