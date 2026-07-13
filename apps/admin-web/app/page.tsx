import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase-server";
import { getAuthenticatedAdmin } from "../lib/admin-session";

// Entry point routing (mirrors staff-pwa's root page): signed in and
// staff-linked with an admin-web-eligible role -> /dashboard; anything
// else -> /login, which itself points first-timers at /setup.
export default async function RootPage() {
  const db = await createSupabaseServerClient();
  const admin = await getAuthenticatedAdmin(db);
  redirect(admin ? "/dashboard" : "/login");
}
