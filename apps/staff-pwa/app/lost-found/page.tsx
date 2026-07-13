import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";
import { LostFoundLog } from "../../components/LostFoundLog";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";
import { getAuthenticatedStaff } from "../../lib/staff-session";

export default async function LostFoundPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());
  if (!staff) redirect("/pin");

  if (!staff.branchId) {
    return (
      <MessagePage title="Lost & found">
        <p>No branch assigned.</p>
      </MessagePage>
    );
  }

  return (
    <MessagePage title="Lost & found">
      <LostFoundLog
        branchId={staff.branchId}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
      <p style={{ marginTop: "1.5rem" }}>
        <a href="/dashboard">Back</a>
      </p>
    </MessagePage>
  );
}
