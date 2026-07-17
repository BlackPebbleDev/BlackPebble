/**
 * Exit Quality Engine (Phase 2C, Part 6).
 *
 * Evaluates how a trader exited a completed round trip against real post-entry
 * and post-exit price paths. Post-exit metrics are explicitly HINDSIGHT: they
 * describe price action after the exit and do NOT imply the move was
 * predictable. UI copy must use "historical hindsight" / "price action after
 * exit" language (enforced in the frontend layer).
 *
 * All returns are candle-derived and measured relative to reference closes so
 * denomination never distorts a percentage.
 *
 * Pure - no I/O, fully testable.
 */

import type { ConfidenceTier } from "./real-trading-confidence.js";
import {
  candlesInRange,
  nearestCandle,
  type HistoricalCandle,
} from "./market-data/types.js";
import type { ReconstructedRoundTrip } from "./real-trading-roundtrips.js";

export type ExitPattern =
  | "near_local_high"
  | "before_further_upside"
  | "before_further_downside"
  | "sharp_reversal"
  | "panic"
  | "insufficient_data";

export interface ExitQualityConfig {
  /** Post-exit look-forward windows (seconds). */
  postWindowsSec: [number, number, number, number];
  /** Cap (seconds) for the missed-upside / avoided-downside scan after exit. */
  maxAfterSec: number;
}

export const DEFAULT_EXIT_CONFIG: ExitQualityConfig = {
  postWindowsSec: [300, 900, 3600, 14400],
  maxAfterSec: 4 * 3600,
};

export interface ExitQualityEvidence {
  roundTripId: string;
  transactionSignature: string;
  mint: string;
  exitedAt: number;
  exitPrice: number | null;
  realizedPnlSol: number;
  capturedMfePercent: number | null;
  postExitReturn5m: number | null;
  postExitReturn15m: number | null;
  postExitReturn1h: number | null;
  postExitReturn4h: number | null;
  missedUpsidePercent: number | null;
  avoidedDownsidePercent: number | null;
  exitPattern: ExitPattern;
  score: number | null;
  confidence: ConfidenceTier;
  source: string;
  /** True to remind consumers post-exit metrics are hindsight, not prediction. */
  hindsight: boolean;
  limitations: string[];
}

export interface ExitQualitySummary {
  eligibleExits: number;
  analyzedExits: number;
  coveragePercent: number;
  avgExitScore: number | null;
  medianExitScore: number | null;
  earlyExitRate: number | null;
  panicExitRate: number | null;
  strongProfitCaptureRate: number | null;
  downsideAvoidanceRate: number | null;
  avgCapturedFavorableExcursion: number | null;
  confidence: ConfidenceTier;
  limitations: string[];
  evidence: ExitQualityEvidence[];
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
 * Transparent exit score (0..100). Documented terms:
 *   base 50
 *   + clamp((capturedMfePercent - 50) * 0.5, -25, 25)  // how much of the run captured
 *   + clamp(avoidedDownsidePercent * 0.5,   0,  15)    // downside dodged after exit
 *   - clamp(missedUpsidePercent    * 0.5,   0,  15)    // upside left after exit
 * clamped to [0, 100]. Post-exit terms are hindsight.
 */
export function scoreExit(
  capturedMfePercent: number | null,
  avoidedDownsidePercent: number | null,
  missedUpsidePercent: number | null,
): number {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));
  const captured = capturedMfePercent ?? 50;
  const raw =
    50 +
    clamp((captured - 50) * 0.5, -25, 25) +
    clamp((avoidedDownsidePercent ?? 0) * 0.5, 0, 15) -
    clamp((missedUpsidePercent ?? 0) * 0.5, 0, 15);
  return Math.round(clamp(raw, 0, 100));
}

/** Analyze one closed round trip's exit against a fetched candle window. */
export function analyzeExit(
  trip: ReconstructedRoundTrip,
  candles: HistoricalCandle[],
  source: string,
  config: ExitQualityConfig = DEFAULT_EXIT_CONFIG,
): ExitQualityEvidence {
  const lastExit = trip.exitExecutions[trip.exitExecutions.length - 1];
  const exitedAt = trip.sellTime ?? lastExit?.blockTime ?? trip.buyTime;
  const sig = lastExit?.signature ?? trip.entryExecutions[0]?.signature ?? "";

  const base: ExitQualityEvidence = {
    roundTripId: trip.roundTripId,
    transactionSignature: sig,
    mint: trip.tokenMint,
    exitedAt,
    exitPrice: null,
    realizedPnlSol: trip.realizedPnlSol,
    capturedMfePercent: null,
    postExitReturn5m: null,
    postExitReturn15m: null,
    postExitReturn1h: null,
    postExitReturn4h: null,
    missedUpsidePercent: null,
    avoidedDownsidePercent: null,
    exitPattern: "insufficient_data",
    score: null,
    confidence: "insufficient",
    source,
    hindsight: true,
    limitations: [],
  };

  if (candles.length === 0) {
    base.limitations.push("No historical candles available for this exit.");
    return base;
  }

  const exitCandle = nearestCandle(candles, exitedAt);
  if (!exitCandle || !(exitCandle.close > 0)) {
    base.limitations.push("No candle near the exit timestamp.");
    return base;
  }
  const exitRef = exitCandle.close;
  base.exitPrice = exitRef;

  // Captured favorable excursion: how much of the in-trade high the exit locked.
  const entryCandle = nearestCandle(candles, trip.buyTime);
  const entryRef = entryCandle?.close ?? null;
  if (entryRef != null && entryRef > 0) {
    const held = candlesInRange(candles, trip.buyTime, exitedAt);
    let peak = entryRef;
    for (const c of held) if (c.high > peak) peak = c.high;
    const availablePct = pctChange(entryRef, peak); // max favorable
    const exitReturnPct = pctChange(entryRef, exitRef);
    if (availablePct > 0.0001) {
      base.capturedMfePercent = Math.max(
        0,
        Math.min(100, (exitReturnPct / availablePct) * 100),
      );
    }
  }

  let windowsRequested = 0;
  let windowsFilled = 0;
  const priceAfter = (offsetSec: number): number | null => {
    windowsRequested++;
    const c = nearestCandle(candles, exitedAt + offsetSec);
    if (!c || Math.abs(c.timestamp - (exitedAt + offsetSec)) > 4 * 3600) {
      return null;
    }
    windowsFilled++;
    return c.close;
  };
  const [w5, w15, w1h, w4h] = config.postWindowsSec;
  const a5 = priceAfter(w5);
  const a15 = priceAfter(w15);
  const a1h = priceAfter(w1h);
  const a4h = priceAfter(w4h);
  base.postExitReturn5m = a5 != null ? pctChange(exitRef, a5) : null;
  base.postExitReturn15m = a15 != null ? pctChange(exitRef, a15) : null;
  base.postExitReturn1h = a1h != null ? pctChange(exitRef, a1h) : null;
  base.postExitReturn4h = a4h != null ? pctChange(exitRef, a4h) : null;

  // Missed upside / avoided downside across the post-exit scan window.
  const scanEnd = exitedAt + config.maxAfterSec;
  const forward = candlesInRange(candles, exitedAt, scanEnd);
  if (forward.length > 0) {
    let maxUp = 0;
    let maxDown = 0;
    for (const c of forward) {
      const up = pctChange(exitRef, c.high);
      const down = pctChange(exitRef, c.low);
      if (up > maxUp) maxUp = up;
      if (down < maxDown) maxDown = down;
    }
    base.missedUpsidePercent = maxUp;
    base.avoidedDownsidePercent = Math.abs(maxDown);
  }

  // Pattern classification (hindsight). Post-exit price action is the more
  // actionable story, so it is evaluated before the in-trade capture label.
  if (
    trip.realizedPnlSol < 0 &&
    (base.avoidedDownsidePercent ?? 0) < 5 &&
    (base.missedUpsidePercent ?? 0) >= 15
  ) {
    base.exitPattern = "panic";
  } else if ((base.missedUpsidePercent ?? 0) >= 25) {
    base.exitPattern = "before_further_upside";
  } else if ((base.avoidedDownsidePercent ?? 0) >= 25) {
    base.exitPattern = "before_further_downside";
  } else if ((base.capturedMfePercent ?? 0) >= 80) {
    base.exitPattern = "near_local_high";
  } else {
    base.exitPattern = "sharp_reversal";
  }

  base.score = scoreExit(
    base.capturedMfePercent,
    base.avoidedDownsidePercent,
    base.missedUpsidePercent,
  );

  const cov = windowsRequested > 0 ? windowsFilled / windowsRequested : 0;
  base.confidence = cov >= 0.66 ? "high" : cov >= 0.33 ? "medium" : "low";
  base.limitations.push(
    "Post-exit figures are historical hindsight; they do not imply the move was predictable.",
  );
  return base;
}

function rate(
  xs: ExitQualityEvidence[],
  pred: (e: ExitQualityEvidence) => boolean,
): number | null {
  const scored = xs.filter((e) => e.score != null);
  if (scored.length === 0) return null;
  return scored.filter(pred).length / scored.length;
}

export function summarizeExitQuality(
  eligibleExits: number,
  evidence: ExitQualityEvidence[],
  overallTier: ConfidenceTier,
): ExitQualitySummary {
  const analyzed = evidence.filter((e) => e.score != null);
  const scores = analyzed.map((e) => e.score!) as number[];
  const captured = analyzed
    .map((e) => e.capturedMfePercent)
    .filter((v): v is number => v != null);

  const limitations: string[] = [
    "Post-exit metrics are historical hindsight, not predictions.",
  ];
  if (analyzed.length < eligibleExits) {
    limitations.push(
      `${eligibleExits - analyzed.length} of ${eligibleExits} exits lacked sufficient historical candles.`,
    );
  }
  if (analyzed.length === 0) {
    limitations.push(
      "Exit quality is unavailable until historical price data is enriched.",
    );
  }

  return {
    eligibleExits,
    analyzedExits: analyzed.length,
    coveragePercent:
      eligibleExits > 0
        ? Math.round((analyzed.length / eligibleExits) * 100)
        : 0,
    avgExitScore:
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
    medianExitScore: median(scores),
    earlyExitRate: rate(analyzed, (e) => (e.missedUpsidePercent ?? 0) >= 25),
    panicExitRate: rate(analyzed, (e) => e.exitPattern === "panic"),
    strongProfitCaptureRate: rate(
      analyzed,
      (e) => (e.capturedMfePercent ?? 0) >= 70,
    ),
    downsideAvoidanceRate: rate(
      analyzed,
      (e) => (e.avoidedDownsidePercent ?? 0) >= 15,
    ),
    avgCapturedFavorableExcursion:
      captured.length > 0
        ? Math.round(captured.reduce((a, b) => a + b, 0) / captured.length)
        : null,
    confidence: analyzed.length === 0 ? "insufficient" : overallTier,
    limitations,
    evidence,
  };
}
