"use client";

import { createBrowserClient } from "@supabase/ssr";

// Client-side Supabase Auth client for the login form — the only place in
// admin-web that needs to run in the browser (signInWithPassword sets the
// session cookie itself via @supabase/ssr's browser client).
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
