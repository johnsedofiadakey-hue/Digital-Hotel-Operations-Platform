"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";

interface Props {
  branchId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface ActivityBookingRow {
  id: string;
  guest_count: number;
  state: string;
  activities: { name: string } | { name: string }[] | null;
  activity_slots: { starts_at: string } | { starts_at: string }[] | null;
}

interface ReservationRow {
  id: string;
  guest_name: string;
  party_size: number;
  arrival_date: string;
  status: string;
}

interface DayEntry {
  bookings: { id: string; label: string; time: string }[];
  arrivals: { id: string; label: string }[];
}

function activityName(row: ActivityBookingRow): string {
  const a = row.activities;
  return (Array.isArray(a) ? a[0]?.name : a?.name) ?? "Activity";
}

function slotStart(row: ActivityBookingRow): string | null {
  const s = row.activity_slots;
  const starts = Array.isArray(s) ? s[0]?.starts_at : s?.starts_at;
  return starts ?? null;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

// §10/§17 "master calendar"/"full booking calendar" [P3]. Read-only aggregate over
// activity_bookings and reservations — no new schema, this just visualizes what those two
// panels already manage as lists. Month-view only; no drag/reschedule (that's out of scope,
// matching the spec's own "the full booking calendar stays P3" framing — this is the calendar
// view itself, not a booking-management UI replacing ActivitiesPanel/ReservationsPanel).
export function BookingCalendar({ branchId, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [days, setDays] = useState<Record<string, DayEntry>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;

    const rangeStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const rangeEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);

    const [{ data: bookings }, { data: reservations }] = await Promise.all([
      client
        .from("activity_bookings")
        .select("id, guest_count, state, activities(name), activity_slots(starts_at)")
        .eq("branch_id", branchId)
        .eq("state", "confirmed"),
      client
        .from("reservations")
        .select("id, guest_name, party_size, arrival_date, status")
        .eq("branch_id", branchId)
        .gte("arrival_date", toDateKey(rangeStart))
        .lt("arrival_date", toDateKey(rangeEnd)),
    ]);

    const next: Record<string, DayEntry> = {};
    function entry(key: string): DayEntry {
      if (!next[key]) next[key] = { bookings: [], arrivals: [] };
      return next[key];
    }

    for (const row of (bookings ?? []) as unknown as ActivityBookingRow[]) {
      const starts = slotStart(row);
      if (!starts) continue;
      const d = new Date(starts);
      if (d < rangeStart || d >= rangeEnd) continue;
      entry(toDateKey(d)).bookings.push({
        id: row.id,
        label: `${activityName(row)} (${row.guest_count})`,
        time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    }

    for (const row of (reservations ?? []) as ReservationRow[]) {
      if (row.status !== "pending" && row.status !== "checked_in") continue;
      entry(row.arrival_date).arrivals.push({
        id: row.id,
        label: `${row.guest_name} (party of ${row.party_size})`,
      });
    }

    setDays(next);
  }, [branchId, cursor]);

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

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const monthLabel = cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const selected = selectedKey ? days[selectedKey] : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          ‹
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} style={{ fontSize: "0.75rem", textAlign: "center" }}>
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;
          const key = toDateKey(date);
          const entry = days[key];
          const total = (entry?.bookings.length ?? 0) + (entry?.arrivals.length ?? 0);
          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelectedKey(key)}
              style={{
                minHeight: "3rem",
                border: key === selectedKey ? "2px solid" : "1px solid",
                background: "transparent",
                cursor: "pointer",
                padding: "0.25rem",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: "0.8rem" }}>{date.getDate()}</div>
              {total > 0 && <div style={{ fontSize: "0.7rem" }}>{total} booked</div>}
            </button>
          );
        })}
      </div>

      {selectedKey && (
        <div style={{ marginTop: "1rem", border: "1px solid", padding: "0.75rem" }}>
          <strong>{selectedKey}</strong>
          {selected?.arrivals.length ? (
            <ul>
              {selected.arrivals.map((a) => (
                <li key={a.id}>Arriving: {a.label}</li>
              ))}
            </ul>
          ) : null}
          {selected?.bookings.length ? (
            <ul>
              {selected.bookings.map((b) => (
                <li key={b.id}>
                  {b.time} — {b.label}
                </li>
              ))}
            </ul>
          ) : null}
          {!selected?.arrivals.length && !selected?.bookings.length && <p>Nothing scheduled.</p>}
        </div>
      )}
    </div>
  );
}
