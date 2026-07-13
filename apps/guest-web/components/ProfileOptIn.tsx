"use client";

import { useState, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGuestClient } from "@repo/shared/supabase";

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §13 guest profile memory [P2]. "Opt-in at checkout" per the retention table — this only ever
// runs from a full/post_stay session that's already reached the receipt, never presented as a
// condition of checking out. Writes go through opt_in_guest_profile(), a SECURITY DEFINER RPC —
// guests have no direct RLS write policy on `guests`, matching the money-adjacent RPC pattern
// used everywhere else in this codebase.
export function ProfileOptIn({ supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function getClient(): Promise<SupabaseClient | null> {
    if (clientRef.current) return clientRef.current;
    const res = await fetch("/portal/token");
    if (!res.ok) return null;
    const { token } = (await res.json()) as { token: string };
    clientRef.current = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
    return clientRef.current;
  }

  async function submit() {
    if (!name.trim() || !phone.trim()) return;
    setSubmitting(true);
    setStatus(null);
    const client = await getClient();
    if (!client) {
      setSubmitting(false);
      return;
    }
    const { error } = await client.rpc("opt_in_guest_profile", {
      p_phone: phone.trim(),
      p_full_name: name.trim(),
      p_marketing_opt_in: marketingOptIn,
    });
    setStatus(error ? `Couldn't save: ${error.message}` : "Saved — thanks for staying with us.");
    setSubmitting(false);
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>Remember me next time?</h2>
      <p style={{ fontSize: "0.9rem" }}>
        Optional — we&apos;ll recognize you on your next stay. You can ask us to delete this anytime.
      </p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" style={{ display: "block", marginTop: "0.5rem" }} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" style={{ display: "block", marginTop: "0.5rem" }} />
      <label style={{ display: "block", marginTop: "0.5rem" }}>
        <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} /> Send me
        offers and updates
      </label>
      <button type="button" disabled={submitting || !name.trim() || !phone.trim()} onClick={submit} style={{ marginTop: "0.5rem" }}>
        {submitting ? "Saving…" : "Save"}
      </button>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
