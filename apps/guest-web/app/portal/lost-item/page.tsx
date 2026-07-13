import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MessagePage } from "../../../components/MessagePage";
import { LostItemForm } from "../../../components/LostItemForm";
import { GUEST_SESSION_COOKIE } from "../../../lib/session-cookie";

export default async function LostItemPage() {
  const token = (await cookies()).get(GUEST_SESSION_COOKIE)?.value;
  if (!token) redirect("/");

  return (
    <MessagePage title="Lost item">
      <LostItemForm
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
      <p style={{ marginTop: "1.5rem" }}>
        <a href="/portal">Back</a>
      </p>
    </MessagePage>
  );
}
