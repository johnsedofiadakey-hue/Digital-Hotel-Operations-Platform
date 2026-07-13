import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";
import { ReservationsPanel } from "../../components/ReservationsPanel";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";
import { getAuthenticatedStaff } from "../../lib/staff-session";

const VIEW_ROLES = new Set(["reception", "concierge", "branch_manager", "owner"]);
const MANAGE_ROLES = new Set(["reception", "branch_manager", "owner"]);

export default async function ReservationsPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());
  if (!staff) redirect("/pin");

  if (!staff.branchId || !VIEW_ROLES.has(staff.roleKey)) {
    return (
      <MessagePage title="Reservations">
        <p>Your role ({staff.roleKey}) doesn&apos;t access reservations.</p>
      </MessagePage>
    );
  }

  return (
    <MessagePage title="Reservations">
      <ReservationsPanel
        branchId={staff.branchId}
        canManage={MANAGE_ROLES.has(staff.roleKey)}
        guestWebUrl={process.env.NEXT_PUBLIC_GUEST_WEB_URL ?? ""}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
      <p style={{ marginTop: "1.5rem" }}>
        <a href="/dashboard">Back</a>
      </p>
    </MessagePage>
  );
}
