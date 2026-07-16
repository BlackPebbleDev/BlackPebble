/**
 * Performance series for Real Trading Analysis.
 *
 * Everything here is derived from ALREADY-INGESTED swap events (local DB) —
 * no Helius calls, no price lookups except optional token metadata for the
 * winners/losers display. Pure builders are exported separately so they stay
 * fully unit-testable.
 *
 * Honest-data note: a true "portfolio value over time" needs historical price
 * snapshots we don't have retroactively. The cumulative REALIZED PnL curve is
 * exact (it comes from FIFO round-trips), so that's what we chart.
 */

import type { ClosedRoundTrip, ParsedSwapEvent } from "./real-trading-math.js";

export interface PnlPoint {
  /** Unix seconds of the sell that realized this cumulative total. */
  t: number;
  cumRealizedPnlSol: number;
}

export interface ActivityBucket {
  /** "YYYY-MM" */
  month: string;
  buys: number;
  sells: number;
  volumeSol: number;
}

export interface HoldBucket {
  label: string;
  count: number;
}

export interface TokenPerformance {
  tokenMint: string;
  symbol: string | null;
  name: string | null;
  logo: string | null;
  realizedPnlSol: number;
  costBasisSol: number;
  roiPercent: number;
  roundTrips: number;
}

export interface PerformanceReport {
  pnlSeries: PnlPoint[];
  monthlyActivity: ActivityBucket[];
  holdBuckets: HoldBucket[];
  topWinners: TokenPerformance[];
  topLosers: TokenPerformance[];
  totalRealizedPnlSol: number;
}

const MAX_SERIES_POINTS = 200;

/** Cumulative realized PnL over time, ordered by sell time, downsampled. */
export function buildPnlSeries(closed: ClosedRoundTrip[]): PnlPoint[] {
  const sorted = [...closed].sort((a, b) => a.sellTime - b.sellTime);
  let cum = 0;
  const points: PnlPoint[] = sorted.map((c) => {
    cum += c.realizedPnlSol;
    return { t: c.sellTime, cumRealizedPnlSol: cum };
  });
  if (points.length <= MAX_SERIES_POINTS) return points;
  // Downsample evenly, but ALWAYS retain the peak, the trough (largest
  // drawdown), the first point and the current total - so major extrema are
  // never smoothed away by even sampling.
  let minIdx = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.cumRealizedPnlSol < points[minIdx]!.cumRealizedPnlSol) minIdx = i;
    if (points[i]!.cumRealizedPnlSol > points[maxIdx]!.cumRealizedPnlSol) maxIdx = i;
  }
  // Reserve extrema first, then fill with even samples up to the hard cap so
  // the returned series never exceeds MAX_SERIES_POINTS.
  const keep = new Set<number>([0, points.length - 1, minIdx, maxIdx]);
  const step = points.length / MAX_SERIES_POINTS;
  for (let i = 0; i < MAX_SERIES_POINTS && keep.size < MAX_SERIES_POINTS; i++) {
    keep.add(Math.floor(i * step));
  }
  return [...keep]
    .filter((i) => i >= 0 && i < points.length)
    .sort((a, b) => a - b)
    .map((i) => points[i]!);
}

/** Buys/sells/volume per calendar month (UTC). */
export function buildMonthlyActivity(
  events: ParsedSwapEvent[],
): ActivityBucket[] {
  const byMonth = new Map<string, ActivityBucket>();
  for (const ev of events) {
    const d = new Date(ev.blockTime * 1000);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    let bucket = byMonth.get(month);
    if (!bucket) {
      bucket = { month, buys: 0, sells: 0, volumeSol: 0 };
      byMonth.set(month, bucket);
    }
    if (ev.side === "buy") bucket.buys++;
    else bucket.sells++;
    bucket.volumeSol += ev.solAmount;
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

const HOLD_BUCKETS: Array<{ label: string; maxSec: number }> = [
  { label: "<10m", maxSec: 600 },
  { label: "10–60m", maxSec: 3600 },
  { label: "1–6h", maxSec: 6 * 3600 },
  { label: "6–24h", maxSec: 86400 },
  { label: "1–7d", maxSec: 7 * 86400 },
  { label: ">7d", maxSec: Infinity },
];

/** Distribution of hold durations across closed round trips. */
export function buildHoldBuckets(closed: ClosedRoundTrip[]): HoldBucket[] {
  const counts = HOLD_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const c of closed) {
    const idx = HOLD_BUCKETS.findIndex((b) => c.holdDurationSec < b.maxSec);
    counts[idx === -1 ? counts.length - 1 : idx]!.count++;
  }
  return counts;
}

/**
 * Aggregate realized performance per token. Metadata fields are left null —
 * the route layer enriches only the mints it will actually display.
 */
export function buildTokenPerformance(
  closed: ClosedRoundTrip[],
): TokenPerformance[] {
  const byMint = new Map<string, TokenPerformance>();
  for (const c of closed) {
    let agg = byMint.get(c.tokenMint);
    if (!agg) {
      agg = {
        tokenMint: c.tokenMint,
        symbol: null,
        name: null,
        logo: null,
        realizedPnlSol: 0,
        costBasisSol: 0,
        roiPercent: 0,
        roundTrips: 0,
      };
      byMint.set(c.tokenMint, agg);
    }
    agg.realizedPnlSol += c.realizedPnlSol;
    agg.costBasisSol += c.costBasisSol;
    agg.roundTrips++;
  }
  for (const agg of byMint.values()) {
    agg.roiPercent =
      agg.costBasisSol > 0 ? (agg.realizedPnlSol / agg.costBasisSol) * 100 : 0;
  }
  return [...byMint.values()];
}

const TOP_N = 5;

/** Build the full performance report from events + matched round trips. */
export function buildPerformanceReport(
  events: ParsedSwapEvent[],
  closed: ClosedRoundTrip[],
): PerformanceReport {
  const perToken = buildTokenPerformance(closed);
  const winners = perToken
    .filter((t) => t.realizedPnlSol > 0)
    .sort((a, b) => b.realizedPnlSol - a.realizedPnlSol)
    .slice(0, TOP_N);
  const losers = perToken
    .filter((t) => t.realizedPnlSol < 0)
    .sort((a, b) => a.realizedPnlSol - b.realizedPnlSol)
    .slice(0, TOP_N);

  return {
    pnlSeries: buildPnlSeries(closed),
    monthlyActivity: buildMonthlyActivity(events),
    holdBuckets: buildHoldBuckets(closed),
    topWinners: winners,
    topLosers: losers,
    totalRealizedPnlSol: closed.reduce((s, c) => s + c.realizedPnlSol, 0),
  };
}
