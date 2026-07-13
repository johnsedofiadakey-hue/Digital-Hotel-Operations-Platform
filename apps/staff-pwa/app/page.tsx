import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STAFF_BRANCH_COOKIE, STAFF_SESSION_COOKIE } from "../lib/cookies";

// Entry point routing for a shared department tablet (§5.1): not set up for
// a branch yet -> /setup; set up but no active PIN session -> /pin; both ->
// /dashboard.
export default async function RootPage() {
  const store = await cookies();
  const branchId = store.get(STAFF_BRANCH_COOKIE)?.value;
  const session = store.get(STAFF_SESSION_COOKIE)?.value;

  if (!branchId) redirect("/setup");
  if (!session) redirect("/pin");
  redirect("/dashboard");
}
