import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";
import { MessagePage } from "../../../components/MessagePage";
import { PreRegistrationForm } from "../../../components/PreRegistrationForm";

interface ReservationRow {
  id: string;
  branch_id: string;
  guest_name: string;
  arrival_date: string;
  departure_date: string;
  status: string;
  pre_registered_at: string | null;
}

interface BranchInfoRow {
  wifi_info: string | null;
  directions: string | null;
  house_rules: string | null;
}

// §7.2 contactless pre-registration [P2], deliberately scoped down: Phase 1 check-in still
// happens at the desk (§3.2's 60-second flow) — this page never creates a `stays` row, it only
// lets a guest fill in details ahead of arrival that reception sees as a pre-filled hint. No
// guest session exists yet at this point (that's the whole reason this can't reuse the portal's
// JWT machinery), so the token lookup runs server-side via the service-role client — same
// trust-boundary pattern as `/r/[room_key]`, the QR-scan entry point.
export default async function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createServiceRoleClient(getServiceEnv());

  const { data: reservation } = await db
    .from("reservations")
    .select("id, branch_id, guest_name, arrival_date, departure_date, status, pre_registered_at")
    .eq("registration_token", token)
    .maybeSingle<ReservationRow>();

  if (!reservation || reservation.status !== "pending") {
    return (
      <MessagePage title="Pre-registration">
        <p>This link isn&apos;t valid — it may have expired or already been used. Please check in at the desk.</p>
      </MessagePage>
    );
  }

  const { data: branchInfo } = await db
    .from("branches")
    .select("wifi_info, directions, house_rules")
    .eq("id", reservation.branch_id)
    .maybeSingle<BranchInfoRow>();

  return (
    <MessagePage title={`Welcome, ${reservation.guest_name}`}>
      <p>
        Arriving {new Date(reservation.arrival_date).toLocaleDateString()} — departing{" "}
        {new Date(reservation.departure_date).toLocaleDateString()}.
      </p>
      {branchInfo && (branchInfo.wifi_info || branchInfo.directions || branchInfo.house_rules) && (
        <div style={{ marginTop: "1rem" }}>
          {branchInfo.directions && (
            <p>
              <strong>Getting there:</strong> {branchInfo.directions}
            </p>
          )}
          {branchInfo.wifi_info && (
            <p>
              <strong>Wi-Fi:</strong> {branchInfo.wifi_info}
            </p>
          )}
          {branchInfo.house_rules && (
            <p>
              <strong>House rules:</strong> {branchInfo.house_rules}
            </p>
          )}
        </div>
      )}
      {reservation.pre_registered_at ? (
        <p>You&apos;ve already sent us your details — see you soon. Check-in still happens at the desk.</p>
      ) : (
        <PreRegistrationForm token={token} defaultName={reservation.guest_name} />
      )}
    </MessagePage>
  );
}
