import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@repo/shared/server-env";

// Owner/Branch Manager/Super Admin authenticate through real Supabase Auth
// (email+password, §5.3) — unlike guest-web and staff-pwa, which mint their
// own JWTs because guests and PIN tap-ins never hold a GoTrue session. This
// is the one app in the monorepo where a plain @supabase/ssr server client
// is the right tool: it reads/writes the actual GoTrue session cookies.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getPublicSupabaseEnv();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render, where cookies() is
          // read-only — safe to ignore since middleware or the route handler
          // that actually mutated the session already persisted it.
        }
      },
    },
  });
}
