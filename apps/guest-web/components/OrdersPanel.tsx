"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGuestClient } from "@repo/shared/supabase";
import { formatGhs } from "@repo/shared/money";
import type { OrderKitchenState } from "@repo/shared/types";

interface OrderRow {
  id: string;
  kitchen_state: OrderKitchenState;
  total_minor_units: number;
  placed_at: string;
}

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §8.2 order lifecycle, guest side — mirrors RequestsPanel's shape. Live
// updates via Broadcast-from-Database on `orders:stay:{stay_id}` (§4b).
export function OrdersPanel({ supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const stayIdRef = useRef<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    const stayId = stayIdRef.current;
    if (!client || !stayId) return;
    const { data } = await client
      .from("orders")
      .select("id, kitchen_state, total_minor_units, placed_at")
      .eq("stay_id", stayId)
      .order("placed_at", { ascending: false });
    if (data) setOrders(data as OrderRow[]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const res = await fetch("/portal/token");
      if (!res.ok) return;
      const { token, stayId } = (await res.json()) as { token: string; stayId: string };
      if (cancelled) return;

      clientRef.current = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      stayIdRef.current = stayId;
      await refetch();

      clientRef.current
        .channel(`orders:stay:${stayId}`)
        .on("broadcast", { event: "order_placed" }, () => void refetch())
        .on("broadcast", { event: "order_updated" }, () => void refetch())
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [supabaseUrl, supabaseAnonKey, refetch]);

  if (orders.length === 0) return null;

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>Your orders</h2>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            {formatGhs(o.total_minor_units)} — {o.kitchen_state}
          </li>
        ))}
      </ul>
    </div>
  );
}
