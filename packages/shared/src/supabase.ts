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

// Staff (PIN, phone-OTP, email/password) all authenticate through Supabase Auth —
// same client shape as the anon client, the session just carries a real auth.uid().
export function createStaffClient(env: SupabaseEnv): SupabaseClient {
  return createAnonClient(env);
}

// Server-only. Never import this into anything that ships to the browser.
export function createServiceRoleClient(env: SupabaseServiceEnv): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
