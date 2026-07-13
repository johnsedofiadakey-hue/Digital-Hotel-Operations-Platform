"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStaffPinClient } from "@repo/shared/supabase";

interface ReservationRow {
  id: string;
  guest_name: string;
  phone: string | null;
  party_size: number;
  arrival_date: string;
  departure_date: string;
  notes: string;
  status: string;
  registration_token: string;
  pre_registration: { full_name: string; phone: string; notes: string } | null;
}

interface Props {
  branchId: string;
  canManage: boolean;
  guestWebUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §17 open item #4 ("reserved-stay/booking entry ships P1-lite... it's cheap") + §7.2
// contactless pre-registration link. Deliberately not wired into `/checkin/submit` — the actual
// stay is still created by the existing desk check-in flow; this only tracks the reservation
// itself and surfaces a shareable pre-registration link.
export function ReservationsPanel({ branchId, canManage, guestWebUrl, supabaseUrl, supabaseAnonKey }: Props) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [arrivalDate, setArrivalDate] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [notes, setNotes] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const { data } = await client
      .from("reservations")
      .select("id, guest_name, phone, party_size, arrival_date, departure_date, notes, status, registration_token, pre_registration")
      .eq("branch_id", branchId)
      .in("status", ["pending", "checked_in"])
      .order("arrival_date");
    if (data) setReservations(data as unknown as ReservationRow[]);
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

  async function create() {
    const client = clientRef.current;
    if (!client || !guestName.trim() || !arrivalDate || !departureDate) return;
    await client.from("reservations").insert({
      branch_id: branchId,
      guest_name: guestName.trim(),
      phone: phone.trim() || null,
      party_size: partySize,
      arrival_date: arrivalDate,
      departure_date: departureDate,
      notes: notes.trim(),
    });
    setGuestName("");
    setPhone("");
    setPartySize(1);
    setArrivalDate("");
    setDepartureDate("");
    setNotes("");
    await refetch();
  }

  async function setStatus(id: string, status: string) {
    const client = clientRef.current;
    if (!client) return;
    await client.from("reservations").update({ status }).eq("id", id);
    await refetch();
  }

  async function copyLink(reservation: ReservationRow) {
    const link = `${guestWebUrl}/register/${reservation.registration_token}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(reservation.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div>
      {canManage && (
        <div style={{ border: "1px solid", padding: "0.75rem", marginBottom: "1rem", display: "grid", gap: "0.5rem" }}>
          <strong>New reservation</strong>
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Guest name" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" />
          <label>
            Party size
            <input type="number" min={1} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} />
          </label>
          <label>
            Arrival
            <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
          </label>
          <label>
            Departure
            <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
          <button type="button" disabled={!guestName.trim() || !arrivalDate || !departureDate} onClick={create}>
            Create reservation
          </button>
        </div>
      )}

      <ul style={{ display: "grid", gap: "0.5rem", listStyle: "none", padding: 0 }}>
        {reservations.map((r) => (
          <li key={r.id} style={{ border: "1px solid", padding: "0.5rem 0.75rem" }}>
            <strong>{r.guest_name}</strong> (party of {r.party_size}) — {r.arrival_date} → {r.departure_date} —{" "}
            <strong>{r.status}</strong>
            {r.pre_registration && (
              <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
                Pre-registered: {r.pre_registration.full_name}, {r.pre_registration.phone}
                {r.pre_registration.notes && ` — "${r.pre_registration.notes}"`}
              </p>
            )}
            {canManage && r.status === "pending" && (
              <div style={{ marginTop: "0.35rem" }}>
                <button type="button" onClick={() => copyLink(r)}>
                  {copiedId === r.id ? "Copied!" : "Copy pre-registration link"}
                </button>
                <button type="button" style={{ marginLeft: "0.5rem" }} onClick={() => setStatus(r.id, "checked_in")}>
                  Mark checked in
                </button>
                <button type="button" style={{ marginLeft: "0.5rem" }} onClick={() => setStatus(r.id, "cancelled")}>
                  Cancel
                </button>
                <button type="button" style={{ marginLeft: "0.5rem" }} onClick={() => setStatus(r.id, "no_show")}>
                  No-show
                </button>
              </div>
            )}
          </li>
        ))}
        {reservations.length === 0 && <li>No upcoming reservations.</li>}
      </ul>
    </div>
  );
}
