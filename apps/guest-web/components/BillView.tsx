"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGuestClient } from "@repo/shared/supabase";
import { formatGhs } from "@repo/shared/money";

interface FolioLineRow {
  id: string;
  description: string;
  amount_minor_units: number;
  flagged: boolean;
  posted_at: string;
}

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §7.3 "Live bill view (full trust) — every folio line as it happens. Kills
// the checkout-surprise dispute." Live via Broadcast-from-Database on
// `folio:stay:{stay_id}` (§4b).
export function BillView({ supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const stayIdRef = useRef<string | null>(null);
  const [lines, setLines] = useState<FolioLineRow[] | null>(null);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    const stayId = stayIdRef.current;
    if (!client || !stayId) return;
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
      .select("id, description, amount_minor_units, flagged, posted_at")
      .eq("folio_id", folio.id)
      .order("posted_at", { ascending: true });
    setLines((data as FolioLineRow[]) ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const res = await fetch("/portal/token");
      if (!res.ok) return;
      const { token, stayId, tier } = (await res.json()) as { token: string; stayId: string; tier: string };
      if (cancelled || tier !== "full") return;

      clientRef.current = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      stayIdRef.current = stayId;
      await refetch();

      clientRef.current
        .channel(`folio:stay:${stayId}`)
        .on("broadcast", { event: "folio_updated" }, () => void refetch())
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [supabaseUrl, supabaseAnonKey, refetch]);

  const total = (lines ?? []).reduce((sum, l) => sum + l.amount_minor_units, 0);

  if (lines === null) {
    return <p>To view the bill, scan the QR code in your room.</p>;
  }

  return (
    <div>
      <ul>
        {lines.map((line) => (
          <li key={line.id}>
            {line.description} — {formatGhs(line.amount_minor_units)}
            {line.flagged ? " (pending delivery)" : ""}
          </li>
        ))}
        {lines.length === 0 && <li>No charges yet.</li>}
      </ul>
      <p>
        <strong>Total: {formatGhs(total)}</strong>
      </p>
    </div>
  );
}
