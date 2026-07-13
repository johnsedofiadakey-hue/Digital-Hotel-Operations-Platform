import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase-server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";
import { getAuthenticatedAdmin } from "../../lib/admin-session";
import { MessagePage } from "../../components/MessagePage";

const OPEN_REQUEST_STATES = ["submitted", "claimed", "in_progress", "reopened"];
const OCCUPIED_STATUSES = ["occupied", "occupied_dnd"];

interface BranchSummary {
  id: string;
  name: string;
  totalRooms: number;
  occupiedRooms: number;
  openRequests: number;
}

// §8.2/§8.3's Branch Manager / Owner dashboards, deliberately minimal for
// now: occupancy and open-request count per branch, not the full
// revenue/satisfaction/SLA-tracking view the spec describes. Building the
// real analytics is a separate, larger piece — this exists so the
// dashboard isn't just a dead landing page between login and staff
// management, which is where the actual near-term value is (see
// HANDOVER.md).
export default async function DashboardPage() {
  const authDb = await createSupabaseServerClient();
  const admin = await getAuthenticatedAdmin(authDb);
  if (!admin) redirect("/login");

  const db = createServiceRoleClient(getServiceEnv());

  const { data: org } = await db
    .from("organizations")
    .select("name")
    .eq("id", admin.organizationId)
    .single<{ name: string }>();

  let branchQuery = db.from("branches").select("id, name").eq("organization_id", admin.organizationId);
  if (admin.roleKey === "branch_manager" && admin.branchId) {
    branchQuery = branchQuery.eq("id", admin.branchId);
  }
  const { data: branchRows } = await branchQuery;

  const summaries: BranchSummary[] = await Promise.all(
    (branchRows ?? []).map(async (branch) => {
      const [{ data: rooms }, { count: openRequests }] = await Promise.all([
        db.from("rooms").select("status").eq("branch_id", branch.id),
        db
          .from("requests")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", branch.id)
          .in("state", OPEN_REQUEST_STATES),
      ]);
      const totalRooms = rooms?.length ?? 0;
      const occupiedRooms = rooms?.filter((r) => OCCUPIED_STATUSES.includes(r.status)).length ?? 0;
      return { id: branch.id, name: branch.name, totalRooms, occupiedRooms, openRequests: openRequests ?? 0 };
    }),
  );

  return (
    <MessagePage title={org?.name ?? "Dashboard"}>
      <p style={{ marginBottom: "1rem" }}>
        Signed in as {admin.name} ({admin.roleKey.replace("_", " ")}) ·{" "}
        <a href="/staff">Manage staff</a> · <a href="/logout">Sign out</a>
      </p>
      {summaries.map((b) => (
        <div key={b.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid #eee" }}>
          <h2 style={{ fontSize: "1.1rem" }}>{b.name}</h2>
          <p>
            {b.occupiedRooms} / {b.totalRooms} rooms occupied · {b.openRequests} open request
            {b.openRequests === 1 ? "" : "s"}
          </p>
        </div>
      ))}
      {summaries.length === 0 && <p>No branches yet.</p>}
    </MessagePage>
  );
}
