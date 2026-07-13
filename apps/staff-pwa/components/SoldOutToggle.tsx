"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";

interface MenuItemRow {
  id: string;
  name: string;
  available: boolean;
  stock_quantity: number | null;
  low_stock_threshold: number;
}

interface Props {
  branchId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §8.3 "sold-out toggle." Writes go through the existing "staff can update
// menu items in own branch scope" RLS policy; the trigger on `menu_items`
// (20260711180000_menu_and_orders.sql) fans the change out live to any open
// guest menu (§4b Broadcast-from-Database), so this component itself
// doesn't need to broadcast anything — it just flips the row.
export function SoldOutToggle({ branchId, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [items, setItems] = useState<MenuItemRow[]>([]);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const { data } = await client
      .from("menu_items")
      .select("id, name, available, stock_quantity, low_stock_threshold")
      .eq("branch_id", branchId)
      .order("name");
    if (data) setItems(data as MenuItemRow[]);
  }, [branchId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const res = await fetch("/session/token");
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      if (cancelled) return;
      clientRef.current = createStaffPinClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      await refetch();
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [supabaseUrl, supabaseAnonKey, refetch]);

  async function toggle(item: MenuItemRow) {
    const client = clientRef.current;
    if (!client) return;
    await client.from("menu_items").update({ available: !item.available }).eq("id", item.id);
    await refetch();
  }

  async function setStock(item: MenuItemRow, value: string) {
    const client = clientRef.current;
    if (!client) return;
    const stock = value === "" ? null : Number(value);
    await client.from("menu_items").update({ stock_quantity: stock }).eq("id", item.id);
    await refetch();
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Menu availability</h2>
      <ul style={{ display: "grid", gap: "0.35rem", listStyle: "none", padding: 0 }}>
        {items.map((item) => {
          const lowStock = item.stock_quantity !== null && item.stock_quantity <= item.low_stock_threshold;
          return (
            <li key={item.id}>
              <label>
                <input type="checkbox" checked={item.available} onChange={() => toggle(item)} /> {item.name}
                {!item.available && " (sold out)"}
              </label>
              <input
                type="number"
                min={0}
                placeholder="stock (optional)"
                defaultValue={item.stock_quantity ?? ""}
                onBlur={(e) => setStock(item, e.target.value)}
                style={{ marginLeft: "0.5rem", width: "6rem" }}
              />
              {lowStock && <span style={{ marginLeft: "0.5rem" }}>⚠ low stock</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
