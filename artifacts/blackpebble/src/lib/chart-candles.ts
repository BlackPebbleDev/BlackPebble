import type { CandleResolution } from "@/lib/api";

/**
 * Pure helpers for the native token chart (kept out of the component so the
 * auto-timeframe and marker-snapping rules are unit-testable).
 */

/**
 * Resolutions offered in the UI. 15s/30s are intentionally excluded: our
 * current data source (GeckoTerminal) only serves the `second` timeframe for a
 * brief recent window and returns nothing for most pools, so exposing those
 * pills would let users pick a broken/empty timeframe. They stay in the API's
 * capability set for a future provider that serves real sub-minute candles.
 */
export const UI_RESOLUTIONS: readonly CandleResolution[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];

/**
 * Pick a default resolution from token age (pair creation time).
 *
 * Ladder (never above 15m by default, never below 1m with the current source):
 *   < 6 h           → 1m
 *   6 h – 24 h      → 5m
 *   older / unknown → 15m
 */
export function autoResolution(
  pairCreatedAtMs: number | null | undefined,
  nowMs = Date.now(),
): CandleResolution {
  if (!pairCreatedAtMs || pairCreatedAtMs > nowMs) return "15m";
  const ageMin = (nowMs - pairCreatedAtMs) / 60_000;
  if (ageMin < 360) return "1m";
  if (ageMin < 1440) return "5m";
  return "15m";
}

/**
 * Snap a trade timestamp to the nearest candle open time at-or-before it, so
 * markers land on real bars even when quiet buckets are missing from the
 * series. `candleTimes` must be ascending unix seconds. Returns null when the
 * trade predates the visible history.
 */
export function snapToCandle(
  candleTimes: number[],
  tradeTs: number,
): number | null {
  if (candleTimes.length === 0 || tradeTs < candleTimes[0]) return null;
  let lo = 0;
  let hi = candleTimes.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (candleTimes[mid] <= tradeTs) lo = mid;
    else hi = mid - 1;
  }
  return candleTimes[lo];
}
