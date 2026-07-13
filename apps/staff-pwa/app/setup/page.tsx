import { MessagePage } from "../../components/MessagePage";

// One-time tablet setup (§5.1) — which branch this shared tablet belongs to.
// Reuses the same human-readable branch code the guest second-device flow
// uses (§4.5) rather than inventing a second code namespace.
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <MessagePage title="Set up this tablet">
      <form action="/setup/submit" method="post" style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          Branch code
          <input name="branchCode" placeholder="e.g. ACCRA" required autoCapitalize="characters" />
        </label>
        <button type="submit">Continue</button>
      </form>
      {error && <p role="alert">Branch code not recognized — check with your manager.</p>}
    </MessagePage>
  );
}
