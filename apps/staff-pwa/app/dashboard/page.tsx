import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createStaffPinClient } from "@repo/shared/supabase";
import { verifyStaffSessionToken } from "@repo/shared/staff-jwt";
import { getJwtSecret, getPublicSupabaseEnv } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";
import { IdleLogout } from "../../components/IdleLogout";

interface StaffRow {
  name: string;
  roles: { key: string } | { key: string }[] | null;
}

// PIN tap-in landing page (§5.1). Same role as guest-web's /portal — this
// doubles as the end-to-end smoke test: the staff row below is only
// readable because the JWT's `sub` resolves to a real auth.uid() that RLS's
// "staff can view self" policy accepts.
export default async function DashboardPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const claims = await verifyStaffSessionToken(token, getJwtSecret());
  if (!claims) redirect("/pin");

  const staffDb = createStaffPinClient(getPublicSupabaseEnv(), token);
  const { data: staff } = await staffDb
    .from("staff")
    .select("name, roles(key)")
    .eq("user_id", claims.sub)
    .maybeSingle<StaffRow>();

  const role = Array.isArray(staff?.roles) ? staff?.roles[0]?.key : staff?.roles?.key;

  return (
    <MessagePage title={`Welcome${staff?.name ? `, ${staff.name}` : ""}`}>
      {role && <p>Role: {role}</p>}
      <p style={{ marginTop: "1rem", display: "grid", gap: "0.35rem" }}>
        <a href="/checkin">Check in a guest</a>
        {(role === "reception" ||
          role === "concierge" ||
          role === "branch_manager" ||
          role === "owner") && (
          <>
            <a href="/reservations">Reservations</a>
            <a href="/calendar">Calendar</a>
          </>
        )}
        {(role === "reception" || role === "branch_manager" || role === "owner") && (
          <a href="/guests">Guests</a>
        )}
        <a href="/requests">Request queue</a>
        <a href="/rooms">Room board</a>
        <a href="/kitchen">Kitchen</a>
        <a href="/chat">Chat</a>
        <a href="/lost-found">Lost & found</a>
        {(role === "reception" ||
          role === "concierge" ||
          role === "branch_manager" ||
          role === "owner") && <a href="/activities">Activities</a>}
        {(role === "reception" || role === "branch_manager" || role === "owner") && (
          <>
            <a href="/deposits">Deposits</a>
            <a href="/id-uploads">ID uploads</a>
          </>
        )}
        {(role === "branch_manager" || role === "owner") && <a href="/reports">Reports</a>}
      </p>
      <form action="/logout" method="post" style={{ marginTop: "1.5rem" }}>
        <button type="submit">Switch user</button>
      </form>
      <IdleLogout />
    </MessagePage>
  );
}
