// Server-only env accessors, shared across apps. Importing this into a
// client component fails loudly (missing NEXT_PUBLIC_ vars aside,
// SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET are never exposed to the
// browser) rather than silently leaking undefined into a request.
import "server-only";
import type { SupabaseEnv, SupabaseServiceEnv } from "./supabase.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getPublicSupabaseEnv(): SupabaseEnv {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function getServiceEnv(): SupabaseServiceEnv {
  return {
    ...getPublicSupabaseEnv(),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getJwtSecret(): string {
  return required("SUPABASE_JWT_SECRET");
}

// Paystack signs webhooks with the integration's secret key itself, not a
// separate webhook-specific secret (unlike Stripe) — `PAYSTACK_WEBHOOK_SECRET`
// in .env.example predates this being verified against Paystack's actual
// docs and is unused; kept there harmlessly rather than removed mid-session.
export function getPaystackSecretKey(): string {
  return required("PAYSTACK_SECRET_KEY");
}
