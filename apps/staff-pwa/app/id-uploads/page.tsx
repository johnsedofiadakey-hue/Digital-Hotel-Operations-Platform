import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";
import { getAuthenticatedStaff } from "../../lib/staff-session";

const RECEPTION_ROLES = new Set(["reception", "branch_manager", "owner"]);

interface UploadRow {
  id: string;
  uploaded_at: string;
  stays: { last_names: string[] } | { last_names: string[] }[] | null;
}

// §13: "Reception-role-only access." Listing metadata here is fine under
// RLS (guest_id_uploads has a reception-only SELECT policy) — it's the
// actual file bytes that route through the access-logged view endpoint.
export default async function IdUploadsPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());
  if (!staff) redirect("/pin");

  if (!staff.branchId || !RECEPTION_ROLES.has(staff.roleKey)) {
    return (
      <MessagePage title="ID uploads">
        <p>Your role ({staff.roleKey}) doesn&apos;t access ID uploads.</p>
      </MessagePage>
    );
  }

  const { data: uploads } = await db
    .from("guest_id_uploads")
    .select("id, uploaded_at, stays(last_names)")
    .eq("branch_id", staff.branchId)
    .order("uploaded_at", { ascending: false });

  function guestName(row: UploadRow): string {
    const stays = row.stays;
    const stay = Array.isArray(stays) ? stays[0] : stays;
    return stay?.last_names?.[0] ?? "guest";
  }

  return (
    <MessagePage title="ID uploads">
      <ul>
        {((uploads ?? []) as UploadRow[]).map((u) => (
          <li key={u.id}>
            {guestName(u)} — {new Date(u.uploaded_at).toLocaleString()} —{" "}
            <a href={`/id-uploads/${u.id}/view`} target="_blank" rel="noreferrer">
              View
            </a>
          </li>
        ))}
        {(uploads ?? []).length === 0 && <li>No ID uploads yet.</li>}
      </ul>
      <p style={{ marginTop: "1.5rem" }}>
        <a href="/dashboard">Back</a>
      </p>
    </MessagePage>
  );
}
