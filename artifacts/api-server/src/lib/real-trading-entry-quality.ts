/**
 * Entry Quality Engine (Phase 2C, Part 5).
 *
 * Evaluates how a trader entered a position against ACTUAL historical price
 * paths (candles). Every metric is candle-derived and unit-consistent: all
 * returns and excursions are measured relative to the entry-reference price
 * (the close of the candle nearest the weighted entry time), so SOL-vs-USD
 * denomination never distorts a percentage.
 *
 * Honesty rules:
 *  - No candles → `entryPattern: "insufficient_data"`, `score: null`,
 *    `confidence: "unavailable"`. Nothing is invented.
 *  - The score formula is fully transparent (see `scoreEntry`) and tested.
 *  - Coverage is measured per requested window, never assumed.
 *
 * Pure - no I/O, fully testable. Candles are fetched by the enrichment layer
 * and passed in.
 */

import type { ConfidenceTier } from "./real-trading-confidence.js";
import {
  candlesInRange,
  nearestCandle,
  type HistoricalCandle,
} from "./market-data/types.js";
import type { ReconstructedRoundTrip } from "./real-trading-roundtrips.js";

export type EntryPattern =
  | "rapid_rise"
  | "pullback"
  | "consolidation"
  | "breakdown"
  | "insufficient_data";

export interface EntryQualityConfig {
  /** Look-back windows (seconds) before entry for pre-entry returns. */
  preWindowsSec: [number, number, number];
  /** Look-forward windows (seconds) after entry for follow-through. */
  postWindowsSec: [number, number, number];
  /** Hard cap (seconds) for the MFE/MAE scan after entry. */
  maxAfterSec: number;
}

export const DEFAULT_ENTRY_CONFIG: EntryQualityConfig = {
  preWindowsSec: [300, 900, 3600],
  postWindowsSec: [300, 900, 3600],
  maxAfterSec: 6 * 3600,
};

/** Pattern thresholds (documented, tested). Percent moves before entry. */
const RUNUP_PCT = 25; // bought after a rapid rise
const PULLBACK_PCT = -15; // bought into a dip
const BREAKDOWN_PCT = -45; // bought into a sharp breakdown
const CALM_PCT = 8; // |move| below this = consolidation

export interface EntryQualityEvidence {
  roundTripId: string;
  transactionSignature: string;
  mint: string;
  enteredAt: number;
  entryPrice: number | null;
  entryMarketCapUsd: number | null;
  entryLiquidityUsd: number | null;
  preEntryReturn5m: number | null;
  preEntryReturn15m: number | null;
  preEntryReturn1h: number | null;
  postEntryReturn5m: number | null;
  postEntryReturn15m: number | null;
  postEntryReturn1h: number | null;
  mfePercent: number | null;
  maePercent: number | null;
  timeToMfeSec: number | null;
  timeToMaeSec: number | null;
  entryPattern: EntryPattern;
  score: number | null;
  confidence: ConfidenceTier;
  /** 0..1 fraction of requested windows that had candle data. */
  sampleCoverage: number;
  source: string;
  limitations: string[];
}

export interface EntryQualitySummary {
  eligibleEntries: number;
  analyzedEntries: number;
  coveragePercent: number;
  avgEntryScore: number | null;
  medianEntryScore: number | null;
  buyingAfterRunUpRate: number | null;
  pullbackEntryRate: number | null;
  immediateAdverseMoveRate: number | null;
  positiveFollowThroughRate: number | null;
  bestSupportedPattern: EntryPattern | null;
  weakestSupportedPattern: EntryPattern | null;
  confidence: ConfidenceTier;
  limitations: string[];
  evidence: EntryQualityEvidence[];
}

function pctChange(from: number, to: number): number {
  if (!(from > 0)) return 0;
  return ((to - from) / from) * 100;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Transparent entry score (0..100). Higher = the entry was followed by
 * favorable price action with limited immediate drawdown. Documented terms:
 *   base 50
 *   + 0.4 * clamp(followThrough, -50, 50)   // best available post-entry return
 *   + 0.2 * clamp(mfePercent,     0,  50)   // upside that became available
 *   + 0.4 * clamp(maePercent,   -50,   0)   // immediate adverse move (<=0)
 * then clamped to [0, 100].
 */
export function scoreEntry(
  followThrough: number,
  mfePercent: number,
  maePercent: number,
): number {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));
  const raw =
    50 +
    0.4 * clamp(followThrough, -50, 50) +
    0.2 * clamp(mfePercent, 0, 50) +
    0.4 * clamp(maePercent, -50, 0);
  return Math.round(clamp(raw, 0, 100));
}

function classifyPattern(preReturn1h: number | null): EntryPattern {
  if (preReturn1h == null) return "insufficient_data";
  if (preReturn1h <= BREAKDOWN_PCT) return "breakdown";
  if (preReturn1h <= PULLBACK_PCT) return "pullback";
  if (preReturn1h >= RUNUP_PCT) return "rapid_rise";
  if (Math.abs(preReturn1h) <= CALM_PCT) return "consolidation";
  // Mild directional drift that is neither a run-up nor a pullback.
  return preReturn1h > 0 ? "rapid_rise" : "pullback";
}

/**
 * Analyze one round trip's entry against a fetched candle window. `candles`
 * should span from before the earliest entry to at least `maxAfterSec` after.
 */
export function analyzeEntry(
  trip: ReconstructedRoundTrip,
  candles: HistoricalCandle[],
  source: string,
  config: EntryQualityConfig = DEFAULT_ENTRY_CONFIG,
): EntryQualityEvidence {
  const entries = trip.entryExecutions;
  const firstSig = entries[0]?.signature ?? "";
  // Weighted entry time (by SOL committed) - the representative entry instant.
  const totalSol = entries.reduce((s, e) => s + e.solAmount, 0);
  const enteredAt =
    totalSol > 0
      ? Math.round(
          entries.reduce((s, e) => s + e.blockTime * e.solAmount, 0) / totalSol,
        )
      : (entries[0]?.blockTime ?? trip.buyTime);

  const base: EntryQualityEvidence = {
    roundTripId: trip.roundTripId,
    transactionSignature: firstSig,
    mint: trip.tokenMint,
    enteredAt,
    entryPrice: null,
    entryMarketCapUsd: null,
    entryLiquidityUsd: null,
    preEntryReturn5m: null,
    preEntryReturn15m: null,
    preEntryReturn1h: null,
    postEntryReturn5m: null,
    postEntryReturn15m: null,
    postEntryReturn1h: null,
    mfePercent: null,
    maePercent: null,
    timeToMfeSec: null,
    timeToMaeSec: null,
    entryPattern: "insufficient_data",
    score: null,
    confidence: "insufficient",
    sampleCoverage: 0,
    source,
    limitations: [],
  };

  if (candles.length === 0) {
    base.limitations.push("No historical candles available for this entry.");
    base.confidence = "insufficient";
    return base;
  }

  const entryCandle = nearestCandle(candles, enteredAt);
  if (!entryCandle || !(entryCandle.close > 0)) {
    base.limitations.push("No candle near the entry timestamp.");
    return base;
  }
  const entryRef = entryCandle.close;
  base.entryPrice = entryRef;
  base.entryMarketCapUsd = entryCandle.marketCapUsd ?? null;
  base.entryLiquidityUsd = entryCandle.liquidityUsd ?? null;

  let windowsRequested = 0;
  let windowsFilled = 0;
  const priceAt = (offsetSec: number): number | null => {
    windowsRequested++;
    const c = nearestCandle(candles, enteredAt + offsetSec);
    if (!c || Math.abs(c.timestamp - (enteredAt + offsetSec)) > 2 * 3600) {
      return null;
    }
    windowsFilled++;
    return c.close;
  };

  const [p5, p15, p1h] = config.preWindowsSec;
  const preAt = (sec: number) => priceAt(-sec);
  const pre5 = preAt(p5);
  const pre15 = preAt(p15);
  const pre1h = preAt(p1h);
  base.preEntryReturn5m = pre5 != null ? pctChange(pre5, entryRef) : null;
  base.preEntryReturn15m = pre15 != null ? pctChange(pre15, entryRef) : null;
  base.preEntryReturn1h = pre1h != null ? pctChange(pre1h, entryRef) : null;

  const [q5, q15, q1h] = config.postWindowsSec;
  const post5 = priceAt(q5);
  const post15 = priceAt(q15);
  const post1h = priceAt(q1h);
  base.postEntryReturn5m = post5 != null ? pctChange(entryRef, post5) : null;
  base.postEntryReturn15m = post15 != null ? pctChange(entryRef, post15) : null;
  base.postEntryReturn1h = post1h != null ? pctChange(entryRef, post1h) : null;

  // MFE/MAE scan across candles from entry to entry+maxAfterSec.
  const scanEnd = enteredAt + config.maxAfterSec;
  const forward = candlesInRange(candles, enteredAt, scanEnd);
  if (forward.length > 0) {
    let mfe = 0;
    let mae = 0;
    let tMfe: number | null = null;
    let tMae: number | null = null;
    for (const c of forward) {
      const upPct = pctChange(entryRef, c.high);
      const downPct = pctChange(entryRef, c.low);
      if (upPct > mfe) {
        mfe = upPct;
        tMfe = c.timestamp - enteredAt;
      }
      if (downPct < mae) {
        mae = downPct;
        tMae = c.timestamp - enteredAt;
      }
    }
    base.mfePercent = mfe;
    base.maePercent = mae;
    base.timeToMfeSec = tMfe;
    base.timeToMaeSec = tMae;
  }

  base.entryPattern = classifyPattern(base.preEntryReturn1h);

  const followThrough =
    base.postEntryReturn1h ??
    base.postEntryReturn15m ??
    base.postEntryReturn5m ??
    0;
  base.score = scoreEntry(
    followThrough,
    base.mfePercent ?? 0,
    base.maePercent ?? 0,
  );

  base.sampleCoverage =
    windowsRequested > 0 ? windowsFilled / windowsRequested : 0;
  base.confidence =
    base.sampleCoverage >= 0.66
      ? "high"
      : base.sampleCoverage >= 0.33
        ? "medium"
        : "low";
  if (base.sampleCoverage < 1) {
    base.limitations.push(
      "Some analysis windows had no candle data; metrics use the closest available candle.",
    );
  }
  return base;
}

function rate(xs: EntryQualityEvidence[], pred: (e: EntryQualityEvidence) => boolean): number | null {
  const scored = xs.filter((e) => e.score != null);
  if (scored.length === 0) return null;
  return scored.filter(pred).length / scored.length;
}

/** Aggregate per-entry evidence into a wallet-level summary. */
export function summarizeEntryQuality(
  eligibleEntries: number,
  evidence: EntryQualityEvidence[],
  overallTier: ConfidenceTier,
): EntryQualitySummary {
  const analyzed = evidence.filter((e) => e.score != null);
  const scores = analyzed.map((e) => e.score!) as number[];
  const patternCounts = new Map<EntryPattern, { n: number; sum: number }>();
  for (const e of analyzed) {
    if (e.entryPattern === "insufficient_data") continue;
    const agg = patternCounts.get(e.entryPattern) ?? { n: 0, sum: 0 };
    agg.n++;
    agg.sum += e.score ?? 0;
    patternCounts.set(e.entryPattern, agg);
  }
  let best: EntryPattern | null = null;
  let worst: EntryPattern | null = null;
  let bestAvg = -Infinity;
  let worstAvg = Infinity;
  for (const [pat, agg] of patternCounts) {
    if (agg.n < 2) continue; // need at least 2 samples to name a pattern
    const avg = agg.sum / agg.n;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = pat;
    }
    if (avg < worstAvg) {
      worstAvg = avg;
      worst = pat;
    }
  }

  const limitations: string[] = [];
  if (analyzed.length < eligibleEntries) {
    limitations.push(
      `${eligibleEntries - analyzed.length} of ${eligibleEntries} entries lacked sufficient historical candles.`,
    );
  }
  if (analyzed.length === 0) {
    limitations.push(
      "Entry quality is unavailable until historical price data is enriched.",
    );
  }

  return {
    eligibleEntries,
    analyzedEntries: analyzed.length,
    coveragePercent:
      eligibleEntries > 0
        ? Math.round((analyzed.length / eligibleEntries) * 100)
        : 0,
    avgEntryScore:
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
    medianEntryScore: median(scores),
    buyingAfterRunUpRate: rate(analyzed, (e) => e.entryPattern === "rapid_rise"),
    pullbackEntryRate: rate(analyzed, (e) => e.entryPattern === "pullback"),
    immediateAdverseMoveRate: rate(
      analyzed,
      (e) => (e.maePercent ?? 0) <= -10,
    ),
    positiveFollowThroughRate: rate(
      analyzed,
      (e) =>
        (e.postEntryReturn1h ??
          e.postEntryReturn15m ??
          e.postEntryReturn5m ??
          0) > 0,
    ),
    bestSupportedPattern: best,
    weakestSupportedPattern: worst,
    confidence: analyzed.length === 0 ? "insufficient" : overallTier,
    limitations,
    evidence,
  };
}
