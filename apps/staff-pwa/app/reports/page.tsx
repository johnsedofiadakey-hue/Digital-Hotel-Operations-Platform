import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";
import { getAuthenticatedStaff } from "../../lib/staff-session";

const MANAGER_ROLES = new Set(["branch_manager", "owner"]);

interface RoomStatusRow {
  status: string;
}

interface RequestRow {
  state: string;
  submitted_at: string;
  claimed_at: string | null;
  done_at: string | null;
}

function avgMinutes(deltasMs: number[]): number | null {
  if (deltasMs.length === 0) return null;
  return Math.round(deltasMs.reduce((sum, d) => sum + d, 0) / deltasMs.length / 60000);
}

// §15 Sprint 5: "branch manager dashboard (occupancy, requests, response
// times)." A snapshot read on page load, not a live view — this is a
// once-in-a-while manager check, not a tablet someone stares at (that's the
// room board and request pool, both already live via §4b's
// Broadcast-from-Database pattern).
export default async function ReportsPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());
  if (!staff) redirect("/pin");

  if (!staff.branchId || !MANAGER_ROLES.has(staff.roleKey)) {
    return (
      <MessagePage title="Reports">
        <p>Reports are available to branch managers and owners.</p>
      </MessagePage>
    );
  }

  const { data: rooms } = await db.from("rooms").select("status").eq("branch_id", staff.branchId);
  const roomRows = (rooms ?? []) as RoomStatusRow[];
  const occupied = roomRows.filter((r) => r.status === "occupied" || r.status === "occupied_dnd").length;
  const occupancyPct = roomRows.length ? Math.round((occupied / roomRows.length) * 100) : 0;

  const { data: openRequests } = await db
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", staff.branchId)
    .not("state", "in", "(confirmed,cancelled)");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRequests } = await db
    .from("requests")
    .select("state, submitted_at, claimed_at, done_at")
    .eq("branch_id", staff.branchId)
    .gte("submitted_at", sevenDaysAgo);

  const requestRows = (recentRequests ?? []) as RequestRow[];
  const claimDeltas = requestRows
    .filter((r) => r.claimed_at)
    .map((r) => new Date(r.claimed_at!).getTime() - new Date(r.submitted_at).getTime());
  const doneDeltas = requestRows
    .filter((r) => r.claimed_at && r.done_at)
    .map((r) => new Date(r.done_at!).getTime() - new Date(r.claimed_at!).getTime());

  return (
    <MessagePage title="Reports">
      <ul>
        <li>
          Occupancy: {occupancyPct}% ({occupied}/{roomRows.length} rooms)
        </li>
        <li>Open requests: {openRequests?.length ?? 0}</li>
        <li>Avg time to claim (7d): {avgMinutes(claimDeltas) ?? "—"} min</li>
        <li>Avg time to complete once claimed (7d): {avgMinutes(doneDeltas) ?? "—"} min</li>
        <li>Requests submitted (7d): {requestRows.length}</li>
      </ul>
      <p style={{ marginTop: "1.5rem" }}>
        <a href="/audit-log">Audit log</a>
      </p>
      <p style={{ marginTop: "0.5rem" }}>
        <a href="/dashboard">Back</a>
      </p>
    </MessagePage>
  );
}
