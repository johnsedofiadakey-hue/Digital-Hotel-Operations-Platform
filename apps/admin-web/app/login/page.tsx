import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase-server";
import { getAuthenticatedAdmin } from "../../lib/admin-session";
import { MessagePage } from "../../components/MessagePage";
import { LoginForm } from "../../components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const db = await createSupabaseServerClient();
  const admin = await getAuthenticatedAdmin(db);
  if (admin) redirect("/dashboard");

  const { error, created } = await searchParams;

  return (
    <MessagePage title="DHOP Admin">
      {created && <p style={{ marginBottom: "1rem" }}>Account created — sign in below.</p>}
      <LoginForm />
      {error && (
        <p role="alert" style={{ marginTop: "1rem" }}>
          {error === "not-admin"
            ? "That account isn't set up for branch manager, owner, or platform access."
            : "Sign-in failed — check your email and password."}
        </p>
      )}
    </MessagePage>
  );
}
