import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { MessagePage } from "../../components/MessagePage";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";
import { getAuthenticatedStaff } from "../../lib/staff-session";

const VIEW_ROLES = new Set(["reception", "branch_manager", "owner"]);

interface GuestRow {
  id: string;
  full_name: string;
  phone: string;
  marketing_opt_in: boolean;
}

interface StayRow {
  id: string;
  checkin_at: string | null;
  checkout_due: string | null;
  state: string;
}

// §13 guest profile memory [P2], staff side. Phone-search only (no bulk browse) — this is a
// "recognize a returning guest at the desk" lookup, not a marketing CRM list view.
export default async function GuestsPage({ searchParams }: { searchParams: Promise<{ phone?: string }> }) {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());
  if (!staff) redirect("/pin");

  if (!VIEW_ROLES.has(staff.roleKey)) {
    return (
      <MessagePage title="Guests">
        <p>Your role ({staff.roleKey}) doesn&apos;t access guest profiles.</p>
      </MessagePage>
    );
  }

  const { phone } = await searchParams;
  let guest: GuestRow | null = null;
  let stays: StayRow[] = [];

  if (phone?.trim()) {
    const { data } = await db
      .from("guests")
      .select("id, full_name, phone, marketing_opt_in")
      .eq("phone", phone.trim())
      .maybeSingle<GuestRow>();
    guest = data ?? null;

    if (guest) {
      const { data: stayRows } = await db
        .from("stays")
        .select("id, checkin_at, checkout_due, state")
        .eq("guest_id", guest.id)
        .order("checkin_at", { ascending: false });
      stays = (stayRows ?? []) as StayRow[];
    }
  }

  return (
    <MessagePage title="Guests">
      <form method="get" style={{ display: "flex", gap: "0.5rem" }}>
        <input name="phone" defaultValue={phone ?? ""} placeholder="Search by phone number" />
        <button type="submit">Search</button>
      </form>

      {phone?.trim() && !guest && <p style={{ marginTop: "1rem" }}>No guest profile found for that number.</p>}

      {guest && (
        <div style={{ marginTop: "1rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>{guest.full_name}</h2>
          <p>
            {guest.phone} — {guest.marketing_opt_in ? "opted in to offers" : "not opted in to offers"}
          </p>
          <h3 style={{ fontSize: "1rem", marginTop: "1rem" }}>Past stays</h3>
          <ul>
            {stays.map((s) => (
              <li key={s.id}>
                {s.checkin_at ? new Date(s.checkin_at).toLocaleDateString() : "—"} —{" "}
                {s.checkout_due ? new Date(s.checkout_due).toLocaleDateString() : "—"} ({s.state})
              </li>
            ))}
            {stays.length === 0 && <li>No stays on record.</li>}
          </ul>
          <form action={`/guests/${guest.id}/delete`} method="post" style={{ marginTop: "1rem" }}>
            <button type="submit">Delete this profile (Act 843 request)</button>
          </form>
        </div>
      )}

      <p style={{ marginTop: "1.5rem" }}>
        <a href="/dashboard">Back</a>
      </p>
    </MessagePage>
  );
}
