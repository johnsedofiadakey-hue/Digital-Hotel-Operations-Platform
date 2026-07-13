import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createGuestClient } from "@repo/shared/supabase";
import { verifyGuestSessionToken } from "@repo/shared/jwt";
import { MessagePage } from "../../components/MessagePage";
import { RequestsPanel } from "../../components/RequestsPanel";
import { OrdersPanel } from "../../components/OrdersPanel";
import { ChatPanel } from "../../components/ChatPanel";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { getJwtSecret, getPublicSupabaseEnv } from "@repo/shared/server-env";
import { GUEST_SESSION_COOKIE } from "../../lib/session-cookie";

interface StayRow {
  last_names: string[];
  checkout_due: string | null;
}

// Outcome A (§4.3), full-trust landing page. This also doubles as the
// end-to-end smoke test for the auth pipeline: the stay row below is only
// readable if the JWT's claims actually satisfy the guest RLS policy.
export default async function PortalPage() {
  const token = (await cookies()).get(GUEST_SESSION_COOKIE)?.value;
  if (!token) redirect("/");

  const claims = await verifyGuestSessionToken(token, getJwtSecret());
  if (!claims) redirect("/");

  const guestDb = createGuestClient(getPublicSupabaseEnv(), token);
  const { data: stay } = await guestDb
    .from("stays")
    .select("last_names, checkout_due")
    .eq("id", claims.stay_id)
    .maybeSingle<StayRow>();

  return (
    <MessagePage title={`Welcome${stay?.last_names?.[0] ? `, ${stay.last_names[0]}` : ""}`}>
      <LanguageSwitcher />
      <p>You&apos;re checked in. Trust level: {claims.tier}.</p>
      {stay?.checkout_due && <p>Checkout: {new Date(stay.checkout_due).toLocaleString()}</p>}
      <p style={{ marginTop: "1rem", display: "grid", gap: "0.35rem" }}>
        <a href="/portal/menu">Order food & drink</a>
        {claims.tier !== "post_stay" && <a href="/portal/tip">Leave a tip</a>}
        {claims.tier !== "post_stay" && <a href="/portal/activities">Activities</a>}
        <a href="/portal/lost-item">Report a lost item</a>
        {claims.tier === "full" && <a href="/portal/bill">View bill</a>}
        {claims.tier === "full" && <a href="/portal/id-upload">Upload ID</a>}
        {claims.tier === "full" && <a href="/portal/checkout">Check out</a>}
        {claims.tier === "post_stay" && <a href="/portal/receipt">View receipt</a>}
      </p>
      <OrdersPanel
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
      <RequestsPanel
        tier={claims.tier}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
      <ChatPanel
        tier={claims.tier}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
    </MessagePage>
  );
}
