"use client";

import { useState, useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGuestClient } from "@repo/shared/supabase";

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface ActivityRow {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_minor_units: number;
  requires_deposit: boolean;
  deposit_amount_minor_units: number;
}

interface SlotRow {
  id: string;
  activity_id: string;
  starts_at: string;
  capacity: number;
}

interface BookingRow {
  id: string;
  slot_id: string;
  activity_id: string;
  guest_count: number;
  state: string;
}

function formatGhs(minorUnits: number): string {
  return `GHS ${(minorUnits / 100).toFixed(2)}`;
}

// §10 [P2]. Booking itself goes through book_activity_slot()/cancel_activity_booking() — never
// a direct insert — so the slot-capacity race is resolved by the RPC's row lock, not by
// anything this component does or doesn't do client-side.
export function ActivitiesBrowser({ supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);

  async function refetch() {
    const client = clientRef.current;
    if (!client) return;
    const [{ data: acts }, { data: sl }, { data: bk }] = await Promise.all([
      client.from("activities").select("id, name, description, duration_minutes, price_minor_units, requires_deposit, deposit_amount_minor_units").eq("active", true),
      client.from("activity_slots").select("id, activity_id, starts_at, capacity").gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }),
      client.from("activity_bookings").select("id, slot_id, activity_id, guest_count, state").eq("state", "confirmed"),
    ]);
    if (acts) setActivities(acts as ActivityRow[]);
    if (sl) setSlots(sl as SlotRow[]);
    if (bk) setBookings(bk as BookingRow[]);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const res = await fetch("/portal/token");
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      if (cancelled) return;
      clientRef.current = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
      await refetch();
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [supabaseUrl, supabaseAnonKey]);

  async function book(slotId: string) {
    const client = clientRef.current;
    if (!client) return;
    setBusySlotId(slotId);
    setStatus(null);
    const { error } = await client.rpc("book_activity_slot", { p_slot_id: slotId, p_guest_count: 1 });
    setStatus(error ? "Sorry — just missed it, that slot filled up." : "Booked.");
    setBusySlotId(null);
    await refetch();
  }

  async function cancel(bookingId: string) {
    const client = clientRef.current;
    if (!client) return;
    await client.rpc("cancel_activity_booking", { p_booking_id: bookingId, p_reason: null });
    await refetch();
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>Activities</h2>
      {status && <p role="status">{status}</p>}
      {activities.map((activity) => {
        const activitySlots = slots.filter((s) => s.activity_id === activity.id);
        return (
          <div key={activity.id} style={{ marginTop: "1rem" }}>
            <strong>{activity.name}</strong> — {formatGhs(activity.price_minor_units)} ·{" "}
            {activity.duration_minutes} min
            {activity.requires_deposit && <span> · deposit {formatGhs(activity.deposit_amount_minor_units)} required</span>}
            <p style={{ margin: "0.25rem 0" }}>{activity.description}</p>
            <ul>
              {activitySlots.map((slot) => {
                const booked = bookings
                  .filter((b) => b.slot_id === slot.id)
                  .reduce((sum, b) => sum + b.guest_count, 0);
                const full = booked >= slot.capacity;
                return (
                  <li key={slot.id}>
                    {new Date(slot.starts_at).toLocaleString()} — {slot.capacity - booked} of {slot.capacity} open{" "}
                    <button type="button" disabled={full || busySlotId === slot.id} onClick={() => book(slot.id)}>
                      {full ? "Full" : busySlotId === slot.id ? "Booking…" : "Book"}
                    </button>
                  </li>
                );
              })}
              {activitySlots.length === 0 && <li>No upcoming slots.</li>}
            </ul>
          </div>
        );
      })}
      {activities.length === 0 && <p>No activities available right now.</p>}

      <h3 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>My bookings</h3>
      <ul>
        {bookings.map((b) => {
          const activity = activities.find((a) => a.id === b.activity_id);
          const slot = slots.find((s) => s.id === b.slot_id);
          return (
            <li key={b.id}>
              {activity?.name ?? "Activity"} {slot && `— ${new Date(slot.starts_at).toLocaleString()}`}{" "}
              <button type="button" onClick={() => cancel(b.id)}>
                Cancel
              </button>
            </li>
          );
        })}
        {bookings.length === 0 && <li>No bookings yet.</li>}
      </ul>
    </div>
  );
}
