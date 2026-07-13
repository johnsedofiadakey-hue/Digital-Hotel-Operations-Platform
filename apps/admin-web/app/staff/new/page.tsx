import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase-server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";
import { getAuthenticatedAdmin } from "../../../lib/admin-session";
import { MessagePage } from "../../../components/MessagePage";
import { BRANCH_SCOPED_ROLES } from "../../../lib/staff-roles";

export default async function NewStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authDb = await createSupabaseServerClient();
  const admin = await getAuthenticatedAdmin(authDb);
  if (!admin) redirect("/login");

  const db = createServiceRoleClient(getServiceEnv());
  const { error } = await searchParams;

  const assignableRoles = admin.roleKey === "owner" ? [...BRANCH_SCOPED_ROLES, "owner"] : BRANCH_SCOPED_ROLES;

  let branches: { id: string; name: string }[] = [];
  if (admin.roleKey === "owner") {
    const { data } = await db.from("branches").select("id, name").eq("organization_id", admin.organizationId);
    branches = data ?? [];
  }

  return (
    <MessagePage title="Add staff member">
      <form action="/staff/new/submit" method="post" style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          Name
          <input name="name" required />
        </label>
        <label>
          Role
          <select name="role" id="role-select" required defaultValue="">
            <option value="" disabled>
              Choose a role
            </option>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>

        {admin.roleKey === "owner" ? (
          <label>
            Branch (leave blank for org-wide Owner)
            <select name="branchId" defaultValue="">
              <option value="">— org-wide —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="branchId" value={admin.branchId ?? ""} />
        )}

        <label>
          4-digit PIN{" "}
          <span style={{ fontWeight: "normal", fontSize: "0.85em" }}>
            (for shared-tablet tap-in — required for every role except Owner)
          </span>
          <input name="pin" pattern="\d{4}" maxLength={4} inputMode="numeric" placeholder="e.g. 4821" />
        </label>

        <label>
          Email{" "}
          <span style={{ fontWeight: "normal", fontSize: "0.85em" }}>
            (required for Owner/Branch Manager — they sign in here in admin-web; optional otherwise)
          </span>
          <input name="email" type="email" autoComplete="off" />
        </label>
        <label>
          Password{" "}
          <span style={{ fontWeight: "normal", fontSize: "0.85em" }}>(only used if an email is set)</span>
          <input name="password" type="password" minLength={8} autoComplete="new-password" />
        </label>

        <button type="submit">Create staff member</button>
      </form>
      {error && (
        <p role="alert" style={{ marginTop: "1rem" }}>
          {errorMessage(error)}
        </p>
      )}
      <p style={{ marginTop: "1rem" }}>
        <a href="/staff">Cancel</a>
      </p>
    </MessagePage>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case "role-not-allowed":
      return "You can't assign that role.";
    case "pin-taken":
      return "That PIN is already in use at this branch — pick a different one.";
    case "email-taken":
      return "That email is already in use.";
    case "missing-fields":
      return "Missing required fields for that role — check email/password or PIN.";
    default:
      return "Something went wrong creating the staff member — try again.";
  }
}
