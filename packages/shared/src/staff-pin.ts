// Staff PIN tap-in (§5.1) — pure format/rate-limit logic. The actual
// hash comparison happens in Postgres (see verify_staff_pin in the Sprint 1
// migrations); this is just the shape validation and the lockout math.

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

// "5 wrong attempts -> that tablet locks PIN entry for 5 minutes" (§5.1).
export const STAFF_PIN_RATE_LIMIT = 5;
export const STAFF_PIN_LOCKOUT_WINDOW_MS = 5 * 60 * 1000;

export function isPinLockedOut(attemptCountInWindow: number): boolean {
  return attemptCountInWindow >= STAFF_PIN_RATE_LIMIT;
}

// Idle auto-logout (§5.1) — default 5 min, "configurable per station" is not
// implemented yet (no per-station settings table exists).
export const DEFAULT_IDLE_LOGOUT_MS = 5 * 60 * 1000;
