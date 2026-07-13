import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createGuestClient } from "@repo/shared/supabase";
import { verifyGuestSessionToken } from "@repo/shared/jwt";
import { RequestsPanel } from "../../components/RequestsPanel";
import { OrdersPanel } from "../../components/OrdersPanel";
import { ChatPanel } from "../../components/ChatPanel";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { getJwtSecret, getPublicSupabaseEnv } from "@repo/shared/server-env";
import { GUEST_SESSION_COOKIE } from "../../lib/session-cookie";
import type { GuestSessionTier } from "@repo/shared/types";

interface StayRow {
  last_names: string[];
  checkout_due: string | null;
}

interface Action {
  href: string;
  icon: string;
  label: string;
  // undefined = visible at every tier
  hideAt?: GuestSessionTier[];
  showOnlyAt?: GuestSessionTier[];
}

const ACTIONS: Action[] = [
  { href: "/portal/menu", icon: "🍽", label: "Order food & drink" },
  { href: "/portal/tip", icon: "💛", label: "Leave a tip", hideAt: ["post_stay"] },
  { href: "/portal/activities", icon: "🎟", label: "Activities", hideAt: ["post_stay"] },
  { href: "/portal/lost-item", icon: "🧳", label: "Report a lost item" },
  { href: "/portal/bill", icon: "🧾", label: "View bill", showOnlyAt: ["full"] },
  { href: "/portal/id-upload", icon: "🪪", label: "Upload ID", showOnlyAt: ["full"] },
  { href: "/portal/checkout", icon: "🚪", label: "Check out", showOnlyAt: ["full"] },
  { href: "/portal/receipt", icon: "🧾", label: "View receipt", showOnlyAt: ["post_stay"] },
];

const TIER_LABEL: Record<GuestSessionTier, string> = {
  full: "Full access",
  limited: "Limited access",
  post_stay: "Stay complete",
};

const TIER_PILL: Record<GuestSessionTier, string> = {
  full: "status-good",
  limited: "status-progress",
  post_stay: "status-neutral",
};

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

  const visibleActions = ACTIONS.filter((a) => {
    if (a.showOnlyAt) return a.showOnlyAt.includes(claims.tier);
    if (a.hideAt) return !a.hideAt.includes(claims.tier);
    return true;
  });

  return (
    <main className="page" style={{ paddingBottom: "3rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="brand-mark">✦</div>
        <LanguageSwitcher />
      </div>

      <h1 className="page-title">
        Welcome{stay?.last_names?.[0] ? `, ${stay.last_names[0]}` : ""}
      </h1>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
        <span className={`status-pill ${TIER_PILL[claims.tier]}`}>{TIER_LABEL[claims.tier]}</span>
        {stay?.checkout_due && (
          <span className="muted">Checkout {new Date(stay.checkout_due).toLocaleString()}</span>
        )}
      </div>

      <div className="action-grid">
        {visibleActions.map((a) => (
          <a key={a.href} href={a.href} className="action-tile">
            <span className="tile-icon">{a.icon}</span>
            {a.label}
          </a>
        ))}
      </div>

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
    </main>
  );
}
