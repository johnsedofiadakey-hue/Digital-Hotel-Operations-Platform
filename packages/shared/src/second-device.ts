// Second-device manual entry (§4.5) — pure matching/rate-limit logic. DB
// access (looking up the room, counting recent attempts) stays in the route
// handler; this half is what's actually worth unit-testing.

export function normalizeLastName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function lastNameMatches(candidate: string, recorded: string[]): boolean {
  const normalizedCandidate = normalizeLastName(candidate);
  return recorded.some((name) => normalizeLastName(name) === normalizedCandidate);
}

// "5 attempts per 15 min per room and per source IP" (§4.5).
export const SECOND_DEVICE_RATE_LIMIT = 5;
export const SECOND_DEVICE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export function isRateLimited(attemptCountInWindow: number): boolean {
  return attemptCountInWindow >= SECOND_DEVICE_RATE_LIMIT;
}
