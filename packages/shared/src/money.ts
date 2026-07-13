// Amounts are stored in minor units (pesewas) everywhere to avoid float
// currency math (§14.3) — this is the one place that turns them back into
// a display string.
export function formatGhs(minorUnits: number): string {
  return `GHS ${(minorUnits / 100).toFixed(2)}`;
}
