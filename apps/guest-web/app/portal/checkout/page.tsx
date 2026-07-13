import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyGuestSessionToken } from "@repo/shared/jwt";
import { getJwtSecret } from "@repo/shared/server-env";
import { MessagePage } from "../../../components/MessagePage";
import { CheckoutPanel } from "../../../components/CheckoutPanel";
import { GUEST_SESSION_COOKIE } from "../../../lib/session-cookie";

export default async function CheckoutPage() {
  const token = (await cookies()).get(GUEST_SESSION_COOKIE)?.value;
  if (!token) redirect("/");

  const claims = await verifyGuestSessionToken(token, getJwtSecret());
  if (!claims) redirect("/");

  if (claims.tier !== "full") {
    return (
      <MessagePage title="Check out">
        <p>Express checkout requires full trust — scan the QR code in your room to unlock it.</p>
      </MessagePage>
    );
  }

  return (
    <MessagePage title="Check out">
      <CheckoutPanel />
      <p style={{ marginTop: "1.5rem" }}>
        <a href="/portal">Back</a>
      </p>
    </MessagePage>
  );
}
