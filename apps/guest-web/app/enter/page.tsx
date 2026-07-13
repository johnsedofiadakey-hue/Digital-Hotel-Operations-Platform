import { MessagePage } from "../../components/MessagePage";

// Second-device manual entry (§4.5) — the no-camera / partner's-phone path.
// Deliberately vague on failure: never confirm or deny which part didn't
// match (room code vs. last name vs. no active stay).
export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <MessagePage title="Enter your room">
      <form action="/enter/submit" method="post" style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          Room code
          <input name="roomCode" placeholder="e.g. ACCRA-204" required autoCapitalize="characters" />
        </label>
        <label>
          Last name on the booking
          <input name="lastName" required />
        </label>
        <button type="submit">Continue</button>
      </form>
      {error === "locked" && (
        <p role="alert">Too many attempts — please try again in 15 minutes, or ask reception.</p>
      )}
      {error === "invalid" && (
        <p role="alert">
          That didn&apos;t match — double check the room code and last name, or ask reception for
          help.
        </p>
      )}
    </MessagePage>
  );
}
