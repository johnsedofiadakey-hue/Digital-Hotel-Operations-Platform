import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";
import { DepositsPanel } from "../../components/DepositsPanel";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";
import { getAuthenticatedStaff, CHECKIN_CAPABLE_ROLES } from "../../lib/staff-session";

export default async function DepositsPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());
  if (!staff) redirect("/pin");

  if (!staff.branchId || !CHECKIN_CAPABLE_ROLES.has(staff.roleKey)) {
    return (
      <MessagePage title="Deposits">
        <p>Your role ({staff.roleKey}) doesn&apos;t manage deposits.</p>
      </MessagePage>
    );
  }

  return (
    <MessagePage title="Deposits">
      <DepositsPanel
        branchId={staff.branchId}
        roleKey={staff.roleKey}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
      <p style={{ marginTop: "1.5rem" }}>
        <a href="/dashboard">Back</a>
      </p>
    </MessagePage>
  );
}
