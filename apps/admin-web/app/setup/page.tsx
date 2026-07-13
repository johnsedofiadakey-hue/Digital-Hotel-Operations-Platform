import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";

// No dynamic API (cookies(), etc.) runs on this page — it's the one
// pre-auth page in admin-web — so without this, Next tries to statically
// prerender it at build time and immediately trips over the service-role
// DB call this page does unconditionally (checking whether bootstrap is
// still open). Every other admin-web page is auto-opted into dynamic
// rendering via its cookies() call inside createSupabaseServerClient().
export const dynamic = "force-dynamic";

// One-time bootstrap for the very first Owner account. Every staff row
// (including PIN-only ones) needs a real auth.users row per staff-jwt.ts's
// reasoning, but there is no self-serve signup anywhere else in admin-web —
// deliberately, this is a B2B tool, not an open-registration product. This
// page is only reachable/functional while zero staff rows exist anywhere;
// once the first Owner exists, further staff creation happens through
// /staff/new, gated behind an actual admin session.
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const db = createServiceRoleClient(getServiceEnv());

  const { count: staffCount } = await db.from("staff").select("id", { count: "exact", head: true });
  if ((staffCount ?? 0) > 0) redirect("/login");

  const { data: organizations } = await db.from("organizations").select("id, name");
  const { error } = await searchParams;

  if ((organizations?.length ?? 0) > 1) {
    return (
      <MessagePage title="Set up your account">
        <p>
          More than one organization already exists — automatic bootstrap doesn&apos;t know which one
          you belong to. Ask whoever set up the database to create your Owner account directly.
        </p>
      </MessagePage>
    );
  }

  const existingOrg = organizations?.[0];

  return (
    <MessagePage title="Set up your account">
      <p style={{ marginBottom: "1rem" }}>
        {existingOrg
          ? `You'll be the first Owner for ${existingOrg.name}.`
          : "No organization exists yet — this creates both your hotel group and your Owner account."}
      </p>
      <form action="/setup/submit" method="post" style={{ display: "grid", gap: "0.75rem" }}>
        {existingOrg ? (
          <input type="hidden" name="organizationId" value={existingOrg.id} />
        ) : (
          <label>
            Organization name
            <input name="organizationName" placeholder="e.g. Stormglide Hotels" required />
          </label>
        )}
        <label>
          Your name
          <input name="name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        <button type="submit">Create Owner account</button>
      </form>
      {error && (
        <p role="alert" style={{ marginTop: "1rem" }}>
          {error === "email-taken"
            ? "That email is already in use."
            : "Something went wrong creating the account — try again."}
        </p>
      )}
    </MessagePage>
  );
}
