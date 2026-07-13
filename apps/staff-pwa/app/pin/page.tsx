import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MessagePage } from "../../components/MessagePage";
import { STAFF_BRANCH_COOKIE } from "../../lib/cookies";

// PIN tap-in (§5.1). Wrong-PIN feedback is direct (not vague like the guest
// second-device flow) — this runs on a physically-controlled tablet, not a
// remote attack surface, so the rate limit is the real defense, not secrecy.
export default async function PinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const branchId = (await cookies()).get(STAFF_BRANCH_COOKIE)?.value;
  if (!branchId) redirect("/setup");

  const { error } = await searchParams;

  return (
    <MessagePage title="Enter your PIN">
      <form action="/pin/submit" method="post" style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          4-digit PIN
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
            autoFocus
          />
        </label>
        <button type="submit">Tap in</button>
      </form>
      {error === "locked" && (
        <p role="alert">Too many wrong attempts — this tablet is locked for 5 minutes.</p>
      )}
      {error === "invalid" && <p role="alert">Incorrect PIN — try again.</p>}
      <p style={{ marginTop: "1.5rem" }}>
        <a href="/setup">Wrong branch? Set up this tablet again.</a>
      </p>
    </MessagePage>
  );
}
