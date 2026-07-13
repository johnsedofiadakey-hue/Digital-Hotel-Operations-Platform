"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGuestClient } from "@repo/shared/supabase";
import { formatGhs } from "@repo/shared/money";
import type { GuestSessionTier } from "@repo/shared/types";
import type { MobileMoneyProvider } from "@repo/shared/paystack";
import { PendingPayment } from "./PendingPayment";

interface MenuSectionRow {
  id: string;
  name: string;
  room_category_id: string | null;
  sort_order: number;
}

interface MenuItemRow {
  id: string;
  section_id: string;
  name: string;
  description: string | null;
  price_minor_units: number;
  available: boolean;
  sort_order: number;
}

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const MOMO_PROVIDERS: { value: MobileMoneyProvider; label: string }[] = [
  { value: "mtn", label: "MTN Mobile Money" },
  { value: "vod", label: "Telecel Cash" },
  { value: "atl", label: "AirtelTigo Money" },
];

// §7.3 F&B ordering, §8.2 order lifecycle, §9.1 payment methods. Charge to
// room is full trust only; pay-now (MoMo, §9.2) is available at both trust
// tiers. Live updates (sold-out items vanishing everywhere the moment the
// kitchen toggles them) are Broadcast-from-Database on
// `menu:branch:{branch_id}` — see §4b in HANDOVER.md for why this isn't
// postgres_changes.
export function MenuBrowser({ supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const branchIdRef = useRef<string | null>(null);
  const [tier, setTier] = useState<GuestSessionTier | null>(null);
  const [roomCategoryId, setRoomCategoryId] = useState<string | null>(null);
  const [sections, setSections] = useState<MenuSectionRow[]>([]);
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [placing, setPlacing] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<MobileMoneyProvider>("mtn");
  const [pending, setPending] = useState<{ reference: string; displayText?: string } | null>(null);

  const refetchMenu = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const [{ data: sectionRows }, { data: itemRows }] = await Promise.all([
      client.from("menu_sections").select("id, name, room_category_id, sort_order").order("sort_order"),
      client
        .from("menu_items")
        .select("id, section_id, name, description, price_minor_units, available, sort_order")
        .order("sort_order"),
    ]);
    if (sectionRows) setSections(sectionRows as MenuSectionRow[]);
    if (itemRows) setItems(itemRows as MenuItemRow[]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const res = await fetch("/portal/token");
      if (!res.ok) return;
      const data = (await res.json()) as {
        token: string;
        tier: GuestSessionTier;
        branchId: string | null;
        roomCategoryId: string | null;
      };
      if (cancelled) return;

      clientRef.current = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, data.token);
      branchIdRef.current = data.branchId;
      setTier(data.tier);
      setRoomCategoryId(data.roomCategoryId);
      await refetchMenu();

      if (data.branchId) {
        clientRef.current
          .channel(`menu:branch:${data.branchId}`)
          .on("broadcast", { event: "menu_availability_changed" }, () => void refetchMenu())
          .subscribe();
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [supabaseUrl, supabaseAnonKey, refetchMenu]);

  const visibleSections = useMemo(
    () => sections.filter((s) => !s.room_category_id || s.room_category_id === roomCategoryId),
    [sections, roomCategoryId],
  );

  const itemsBySection = useMemo(() => {
    const map = new Map<string, MenuItemRow[]>();
    for (const item of items) {
      if (!item.available) continue;
      const list = map.get(item.section_id) ?? [];
      list.push(item);
      map.set(item.section_id, list);
    }
    return map;
  }, [items]);

  const cartTotal = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [itemId, qty]) => {
        const item = items.find((i) => i.id === itemId);
        return sum + (item ? item.price_minor_units * qty : 0);
      }, 0),
    [cart, items],
  );

  function setQuantity(itemId: string, qty: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[itemId];
      else next[itemId] = qty;
      return next;
    });
  }

  async function placeChargeToRoom() {
    const client = clientRef.current;
    if (!client || Object.keys(cart).length === 0) return;
    setPlacing(true);
    setConfirmation(null);
    const p_items = Object.entries(cart).map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }));
    const { error } = await client.rpc("place_charge_to_room_order", { p_items });
    setPlacing(false);
    if (error) {
      setConfirmation(`Couldn't place order: ${error.message}`);
      return;
    }
    setCart({});
    setConfirmation("Order placed — charged to your room.");
  }

  async function placePayNow() {
    if (Object.keys(cart).length === 0 || !phone) return;
    setPlacing(true);
    setConfirmation(null);
    const items = Object.entries(cart).map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }));
    const res = await fetch("/portal/order/pay-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, phone, provider }),
    });
    const data = (await res.json()) as {
      reference?: string;
      displayText?: string;
      chargeOk?: boolean;
      error?: string;
    };
    setPlacing(false);
    if (!res.ok || !data.reference) {
      setConfirmation(`Couldn't start payment: ${data.error ?? "unknown error"}`);
      return;
    }
    setCart({});
    if (!data.chargeOk) {
      // The route already marked this failed server-side (see
      // pay-now/route.ts) — no prompt was ever sent, so there's nothing to
      // wait for. Tell the guest now rather than showing a pending screen
      // that would just sit there until the next poll catches up.
      setConfirmation("Couldn't start the payment prompt — check the number and try again.");
      return;
    }
    setPending({ reference: data.reference, displayText: data.displayText });
  }

  if (pending) {
    return (
      <div style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Menu</h2>
        <PendingPayment
          reference={pending.reference}
          displayText={pending.displayText}
          onResolved={(status) => {
            setPending(null);
            setConfirmation(status === "success" ? "Payment received — order sent to the kitchen." : "Payment didn't go through — you can try again.");
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>Menu</h2>
      {tier === null && <p>Loading…</p>}
      {visibleSections.map((section) => {
        const sectionItems = itemsBySection.get(section.id) ?? [];
        if (sectionItems.length === 0) return null;
        return (
          <div key={section.id} style={{ marginTop: "1rem" }}>
            <h3 style={{ fontSize: "1rem" }}>{section.name}</h3>
            <ul style={{ display: "grid", gap: "0.5rem", listStyle: "none", padding: 0 }}>
              {sectionItems.map((item) => (
                <li key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span>
                    {item.name} — {formatGhs(item.price_minor_units)}
                    {item.description && <div style={{ opacity: 0.7 }}>{item.description}</div>}
                  </span>
                  <span style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                    <button type="button" onClick={() => setQuantity(item.id, (cart[item.id] ?? 0) - 1)}>
                      −
                    </button>
                    {cart[item.id] ?? 0}
                    <button type="button" onClick={() => setQuantity(item.id, (cart[item.id] ?? 0) + 1)}>
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div style={{ marginTop: "1.5rem" }}>
        <strong>Total: {formatGhs(cartTotal)}</strong>

        <div style={{ marginTop: "0.75rem" }}>
          <label>
            Phone (for MoMo)
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0244000000" />
          </label>
          <label style={{ marginLeft: "0.5rem" }}>
            Network
            <select value={provider} onChange={(e) => setProvider(e.target.value as MobileMoneyProvider)}>
              {MOMO_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
          <button type="button" disabled={cartTotal === 0 || !phone || placing} onClick={placePayNow}>
            {placing ? "Starting…" : "Pay now (MoMo)"}
          </button>
          {tier === "full" && (
            <button type="button" disabled={cartTotal === 0 || placing} onClick={placeChargeToRoom}>
              {placing ? "Placing…" : "Charge to room"}
            </button>
          )}
        </div>
        {confirmation && <p role="status">{confirmation}</p>}
      </div>
    </div>
  );
}
