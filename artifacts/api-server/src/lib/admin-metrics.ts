/**
 * Pure admin metric helpers (no DB / IO) so rate math is unit-testable.
 */

/** Percentage `part/whole` rounded to one decimal; 0 when whole <= 0. */
export function ratePct(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
