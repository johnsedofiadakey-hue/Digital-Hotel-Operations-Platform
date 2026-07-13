import { cookies } from "next/headers";
import { MessagePage } from "../../components/MessagePage";
import { VacantRealtimeUpgrade } from "../../components/VacantRealtimeUpgrade";
import { VACANT_ROOM_COOKIE } from "../../lib/session-cookie";

// Outcome B (§4.3) — the single most important screen in the product for
// pilot survival per the spec. The live upgrade on check-in (§3.2, §4.3)
// listens on this room's Realtime broadcast topic — no rescan needed.
export default async function VacantPage({
  searchParams,
}: {
  searchParams: Promise<{ notified?: string }>;
}) {
  const { notified } = await searchParams;
  const roomId = (await cookies()).get(VACANT_ROOM_COOKIE)?.value;

  return (
    <MessagePage title="Welcome">
      <p>This room doesn&apos;t have an active check-in yet.</p>
      <ul>
        <li>Wi-Fi and hotel info — coming in Sprint 2</li>
        <li>Menus — coming in Sprint 3</li>
      </ul>
      {notified ? (
        <p>
          Reception has been notified — this page will update automatically once you&apos;re
          checked in.
        </p>
      ) : roomId ? (
        <form action="/vacant/notify" method="post">
          <button type="submit">Staying in this room? Tap here and we&apos;ll notify reception.</button>
        </form>
      ) : null}
      {roomId && (
        <VacantRealtimeUpgrade
          roomId={roomId}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
          supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
        />
      )}
    </MessagePage>
  );
}
