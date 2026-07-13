interface Props {
  token: string;
  defaultName: string;
}

// Plain HTML form POSTing to a Route Handler — no client-side Supabase call needed since
// there's no guest session yet at this point in the journey (see the page's comment).
export function PreRegistrationForm({ token, defaultName }: Props) {
  return (
    <form action={`/register/${token}/submit`} method="post" style={{ marginTop: "1rem", display: "grid", gap: "0.5rem" }}>
      <label>
        Full name
        <input name="full_name" defaultValue={defaultName} required style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        Phone number
        <input name="phone" required style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        Anything we should know before you arrive?
        <textarea name="notes" style={{ display: "block", width: "100%", minHeight: "3rem" }} />
      </label>
      <button type="submit">Send to the front desk</button>
    </form>
  );
}
