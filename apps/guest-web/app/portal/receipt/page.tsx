import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MessagePage } from "../../../components/MessagePage";
import { ReceiptView } from "../../../components/ReceiptView";
import { FeedbackForm } from "../../../components/FeedbackForm";
import { ProfileOptIn } from "../../../components/ProfileOptIn";
import { GUEST_SESSION_COOKIE } from "../../../lib/session-cookie";

export default async function ReceiptPage() {
  const token = (await cookies()).get(GUEST_SESSION_COOKIE)?.value;
  if (!token) redirect("/");

  return (
    <MessagePage title="Receipt">
      <ReceiptView
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
      <FeedbackForm
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
      <ProfileOptIn
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      />
    </MessagePage>
  );
}
