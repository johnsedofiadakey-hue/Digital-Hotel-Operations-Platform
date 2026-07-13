// Supabase client factories. Guests are never Supabase Auth users (§14.5) —
// guest-facing queries go through the anon client, scoped by RLS policies keyed
// off the signed guest-session cookie -> stay -> branch chain, not auth.uid().
//
// The service-role client must only ever be constructed in server-only code
// (Edge Functions, route handlers, cron jobs) — importing it into a client
// bundle defeats every RLS policy in the database.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export interface SupabaseServiceEnv extends SupabaseEnv {
  serviceRoleKey: string;
}

export function createAnonClient(env: SupabaseEnv): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

// Staff who authenticate through Supabase Auth natively (phone OTP,
// email/password, §5.2-§5.3) — same client shape as the anon client, the
// session just carries a real auth.uid().
export function createStaffClient(env: SupabaseEnv): SupabaseClient {
  return createAnonClient(env);
}

// `accessToken` (not a manual Authorization header) is what makes Realtime's
// postgres_changes respect RLS for these custom-signed JWTs too — supabase-js
// uses this callback to authenticate both PostgREST *and* the Realtime
// socket, whereas a plain header only covers REST calls. Needed for §14.4's
// department pools and per-stay request lists, both RLS-gated Realtime
// subscriptions held by guests/staff who never went through GoTrue.
function createBearerTokenClient(env: SupabaseEnv, token: string): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => token,
  });
}

// Guest-facing queries (§14.5). Guests never hold a Supabase Auth session, so
// the signed guest JWT (see jwt.ts) is attached as a bearer header directly —
// PostgREST verifies it with the project JWT secret and evaluates RLS against
// its custom claims, exactly like a real Auth token, without ever touching
// GoTrue's session/refresh machinery.
export function createGuestClient(env: SupabaseEnv, guestToken: string): SupabaseClient {
  return createBearerTokenClient(env, guestToken);
}

// Staff who tap in via PIN (§5.1, shared department tablets) rather than a
// GoTrue login. Same bearer-token approach as guests — the signed staff JWT
// (see staff-jwt.ts) carries a real auth.uid() in its `sub` claim, so RLS
// resolves exactly as it would for a normal Supabase Auth session.
export function createStaffPinClient(env: SupabaseEnv, staffToken: string): SupabaseClient {
  return createBearerTokenClient(env, staffToken);
}

// Server-only. Never import this into anything that ships to the browser.
export function createServiceRoleClient(env: SupabaseServiceEnv): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
