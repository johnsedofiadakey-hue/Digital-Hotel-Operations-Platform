// Pure resolver for the QR scan decision table — DHOP_Build_Spec.md §4.3,
// outcomes A-F. Kept side-effect free (no DB/cookie access) so the decision
// logic is unit-testable and the route handler stays a thin adapter.

import type { RoomStatus, StayState } from "./types.js";

export type ScanOutcome =
  | "active_session" // A — issue a full session
  | "vacant" // B — no active stay, read-only + notify-reception tap
  | "out_of_order" // C — apology page, notify reception
  | "invalid_room" // D — room_key doesn't resolve to a room
  | "device_limit" // E — active stay, but device cap reached
  | "post_stay"; // F — existing session, stay recently checked out

export interface ScanRoom {
  status: RoomStatus;
}

export interface ScanActiveStay {
  deviceCap: number;
  activeSessionCount: number;
}

export interface ScanExistingSession {
  stayState: StayState;
}

export interface ResolveScanOutcomeInput {
  room: ScanRoom | null;
  activeStay: ScanActiveStay | null;
  existingSession: ScanExistingSession | null;
}

export function resolveScanOutcome(input: ResolveScanOutcomeInput): ScanOutcome {
  if (!input.room) return "invalid_room";
  if (input.room.status === "out_of_order") return "out_of_order";

  if (input.activeStay) {
    return input.activeStay.activeSessionCount >= input.activeStay.deviceCap
      ? "device_limit"
      : "active_session";
  }

  if (input.existingSession?.stayState === "checked_out") return "post_stay";
  return "vacant";
}
