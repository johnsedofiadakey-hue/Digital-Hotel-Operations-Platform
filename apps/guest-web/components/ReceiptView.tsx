"use client";

import { useEffect, useState } from "react";
import { createGuestClient } from "@repo/shared/supabase";
import { formatGhs } from "@repo/shared/money";

interface FolioLineRow {
  id: string;
  description: string;
  amount_minor_units: number;
  posted_at: string;
}

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §7.4 digital receipt. Unlike BillView (live, full-trust only, mid-stay),
// this is a one-time read available to full *and* post_stay tier — no
// Realtime subscription, a receipt is historical, not live. Note: this
// still depends on the guest's session (full or the 48h post_stay window)
// rather than the "stable link that outlives the 48h session" the spec
// asks for — that needs a separate long-lived signed-URL mechanism this
// session didn't build (see HANDOVER.md).
export function ReceiptView({ supabaseUrl, supabaseAnonKey }: Props) {
  const [lines, setLines] = useState<FolioLineRow[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch("/portal/token");
      if (!res.ok) return;
      const { token, stayId, tier } = (await res.json()) as { token: string; stayId: string; tier: string };
      if (cancelled) return;
      if (tier !== "full" && tier !== "post_stay") {
        setDenied(true);
        return;
      }

      const client = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      const { data: folio } = await client
        .from("folios")
        .select("id")
        .eq("stay_id", stayId)
        .maybeSingle<{ id: string }>();
      if (!folio) {
        setLines([]);
        return;
      }
      const { data } = await client
        .from("folio_lines")
        .select("id, description, amount_minor_units, posted_at")
        .eq("folio_id", folio.id)
        .order("posted_at", { ascending: true });
      if (!cancelled) setLines((data as FolioLineRow[]) ?? []);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabaseUrl, supabaseAnonKey]);

  if (denied) return <p>Receipts are available to checked-in and recently-checked-out guests.</p>;
  if (lines === null) return <p>Loading…</p>;

  const total = lines.reduce((sum, l) => sum + l.amount_minor_units, 0);

  return (
    <div>
      <ul>
        {lines.map((line) => (
          <li key={line.id}>
            {new Date(line.posted_at).toLocaleDateString()} — {line.description} — {formatGhs(line.amount_minor_units)}
          </li>
        ))}
        {lines.length === 0 && <li>No charges.</li>}
      </ul>
      <p>
        <strong>Total: {formatGhs(total)}</strong>
      </p>
    </div>
  );
}
