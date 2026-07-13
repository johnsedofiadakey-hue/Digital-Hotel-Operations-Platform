"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";
import { canTransition, ORDER_KITCHEN_TRANSITIONS } from "@repo/shared/state-machines";
import { formatGhs } from "@repo/shared/money";
import type { OrderKitchenState } from "@repo/shared/types";
import { playChime } from "../lib/chime";

interface OrderRow {
  id: string;
  kitchen_state: OrderKitchenState;
  total_minor_units: number;
  placed_at: string;
  order_items: { name: string; quantity: number }[];
}

interface Props {
  branchId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const NEXT_STATE: Record<OrderKitchenState, OrderKitchenState | null> = {
  placed: "acknowledged",
  acknowledged: "preparing",
  preparing: "ready",
  ready: "delivered",
  delivered: null,
};

const NEXT_LABEL: Record<Exclude<OrderKitchenState, "delivered">, string> = {
  placed: "Acknowledge",
  acknowledged: "Start preparing",
  preparing: "Mark ready",
  ready: "Mark delivered",
};

// §8.2 order lifecycle, kitchen side (§8.3). Live queue + chime, same
// Broadcast-from-Database pattern as the request pool (§4b) — a distinct
// `order_placed` event (vs. `order_updated`) is what lets this component
// chime only for genuinely new orders.
export function KitchenQueue({ branchId, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ready, setReady] = useState(false);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const { data } = await client
      .from("orders")
      .select("id, kitchen_state, total_minor_units, placed_at, order_items(name, quantity)")
      .eq("branch_id", branchId)
      .neq("kitchen_state", "delivered")
      .order("placed_at", { ascending: true });
    if (data) setOrders(data as unknown as OrderRow[]);
  }, [branchId]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const res = await fetch("/session/token");
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      if (cancelled) return;

      clientRef.current = createStaffPinClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      setReady(true);
      await refetch();

      clientRef.current
        .channel(`orders:branch:${branchId}`)
        .on("broadcast", { event: "order_placed" }, () => {
          playChime();
          void refetch();
        })
        .on("broadcast", { event: "order_updated" }, () => void refetch())
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [branchId, supabaseUrl, supabaseAnonKey, refetch]);

  async function advance(order: OrderRow) {
    const client = clientRef.current;
    const next = NEXT_STATE[order.kitchen_state];
    if (!client || !next || !canTransition(ORDER_KITCHEN_TRANSITIONS, order.kitchen_state, next)) return;
    await client.from("orders").update({ kitchen_state: next }).eq("id", order.id);
    await refetch();
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Kitchen queue</h2>
      {!ready && <p>Loading…</p>}
      <ul style={{ display: "grid", gap: "0.75rem", listStyle: "none", padding: 0 }}>
        {orders.map((order) => (
          <li key={order.id} style={{ border: "1px solid", padding: "0.75rem" }}>
            <strong>{order.kitchen_state}</strong> — {formatGhs(order.total_minor_units)}
            <ul>
              {order.order_items.map((item, i) => (
                <li key={i}>
                  {item.quantity}× {item.name}
                </li>
              ))}
            </ul>
            {order.kitchen_state !== "delivered" && (
              <button type="button" onClick={() => advance(order)}>
                {NEXT_LABEL[order.kitchen_state]}
              </button>
            )}
          </li>
        ))}
        {ready && orders.length === 0 && <li>Queue is empty.</li>}
      </ul>
    </div>
  );
}
