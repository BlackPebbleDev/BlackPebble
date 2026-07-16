/**
 * Signal Registry - the reputation engine foundation.
 *
 * Every score BlackPebble surfaces (profiles, feed, achievements, future AI
 * coaching, competitions, discovery) reads from this registry rather than
 * computing its own ad-hoc numbers. Each signal is a named, versioned 0–100
 * value with confidence and human-readable evidence.
 *
 * Pure computation lives here (testable, no I/O); persistence + delta helpers
 * are the thin DB layer at the bottom.
 */

import { dbAll, dbRun } from "./database.js";
import type {
  ClosedRoundTrip,
  OpenPosition,
  ParsedSwapEvent,
  TradingMetrics,
} from "./real-trading-math.js";
import { stdDev } from "./real-trading-math.js";
import {
  confidenceTier,
  MIN_SAMPLES_FOR_SCORE,
  type ConfidenceTier,
} from "./real-trading-confidence.js";

export const SIGNAL_KEYS = [
  "consistency",
  "risk",
  "discipline",
  "timing",
  "patience",
  "recovery",
  "profitability",
  "conviction",
  "position_sizing",
  "diversification",
  "drawdown_management",
  "activity",
] as const;

export type SignalKey = (typeof SIGNAL_KEYS)[number];

/**
 * How to read a signal's direction of "good". A raw +/- delta is meaningless
 * without this: a lower Risk Appetite can be safer, not worse. Change badges
 * and colours MUST respect this rather than the sign alone.
 *  - higher_better: more is better (consistency, discipline, profitability...)
 *  - descriptive:   a style, not a grade (risk appetite, patience, conviction,
 *                   activity) - never coloured good/bad.
 */
export type SignalDirection = "higher_better" | "descriptive";

/** Which raw inputs each signal is computed from (for honest explainability). */
export type SignalBasis =
  | "completed_round_trips"
  | "swaps"
  | "buys"
  | "current_holdings"
  | "combination";

export interface SignalMeta {
  direction: SignalDirection;
  basis: SignalBasis;
}

export const SIGNAL_META: Record<SignalKey, SignalMeta> = {
  consistency: { direction: "higher_better", basis: "combination" },
  risk: { direction: "descriptive", basis: "combination" },
  discipline: { direction: "higher_better", basis: "completed_round_trips" },
  timing: { direction: "higher_better", basis: "completed_round_trips" },
  patience: { direction: "descriptive", basis: "completed_round_trips" },
  recovery: { direction: "higher_better", basis: "completed_round_trips" },
  profitability: { direction: "higher_better", basis: "completed_round_trips" },
  conviction: { direction: "descriptive", basis: "buys" },
  position_sizing: { direction: "higher_better", basis: "buys" },
  diversification: { direction: "higher_better", basis: "combination" },
  drawdown_management: { direction: "higher_better", basis: "completed_round_trips" },
  activity: { direction: "descriptive", basis: "swaps" },
};

export interface SignalResult {
  key: SignalKey;
  /** 0–100. For `risk`, higher = MORE risk taken (not better/worse). */
  value: number;
  /** 0–1 - how much data backs this reading. */
  confidence: number;
  /** Number of observations this signal was computed from (evidence count). */
  sampleSize: number;
  /**
   * Discrete honesty gate. When "insufficient", display layers MUST NOT present
   * `value` as a precise number - there is not enough evidence to trust it.
   */
  tier: ConfidenceTier;
  /** Human-readable reasons, consumable by UI and future AI coaching. */
  evidence: string[];
}

export interface SignalContext {
  events: ParsedSwapEvent[];
  closed: ClosedRoundTrip[];
  openPositions: OpenPosition[];
  metrics: TradingMetrics;
  behaviorTags: string[];
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Confidence ramps with closed-trade count; full confidence at `full`. */
function dataConfidence(n: number, full: number): number {
  return Math.max(0, Math.min(1, n / full));
}

/** A signal before the confidence tier + sample size are attached. */
type RawSignal = Omit<SignalResult, "sampleSize" | "tier">;

type SignalFn = (ctx: SignalContext) => RawSignal;

const SIGNAL_COMPUTERS: Record<SignalKey, SignalFn> = {
  consistency: (ctx) => {
    const { metrics, closed } = ctx;
    const evidence: string[] = [];
    // Regularity of activity + stability of trade sizing + closed volume.
    const freq = Math.min(100, metrics.tradingFrequencyPerWeek * 12);
    const closedScore = Math.min(100, closed.length * 3);
    const sizes = ctx.events.filter((e) => e.side === "buy").map((e) => e.solAmount);
    const mean = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
    const cv = mean > 0 ? stdDev(sizes) / mean : 1;
    const sizeStability = Math.max(0, 100 - cv * 60);
    if (freq > 50) evidence.push("Trades regularly week over week");
    if (sizeStability > 65) evidence.push("Stable position sizing across entries");
    if (closed.length >= 20) evidence.push(`${closed.length} closed round trips analyzed`);
    return {
      key: "consistency",
      value: clamp100(freq * 0.35 + closedScore * 0.25 + sizeStability * 0.4),
      confidence: dataConfidence(closed.length, 20),
      evidence,
    };
  },

  risk: (ctx) => {
    const { metrics } = ctx;
    const evidence: string[] = [];
    const concentration = metrics.holdingConcentration * 100;
    const sizeRisk = Math.min(100, metrics.avgPositionSizeSol * 15);
    const lossExposure =
      metrics.avgLossSol > 0 && metrics.avgPositionSizeSol > 0
        ? Math.min(100, (metrics.avgLossSol / metrics.avgPositionSizeSol) * 120)
        : 0;
    if (concentration > 60) evidence.push("Portfolio concentrated in few tokens");
    if (sizeRisk > 50) evidence.push("Large average position sizes");
    if (lossExposure > 60) evidence.push("Losses run deep relative to position size");
    if (evidence.length === 0) evidence.push("Measured risk profile");
    return {
      key: "risk",
      value: clamp100(concentration * 0.4 + sizeRisk * 0.3 + lossExposure * 0.3),
      confidence: dataConfidence(ctx.closed.length, 10),
      evidence,
    };
  },

  discipline: (ctx) => {
    const { metrics, behaviorTags, closed } = ctx;
    const evidence: string[] = [];
    let v = metrics.winRate * 55;
    if (behaviorTags.includes("good_sizing")) {
      v += 20;
      evidence.push("Consistent, planned position sizing");
    }
    if (behaviorTags.includes("disciplined_risk")) {
      v += 15;
      evidence.push("Sustained win rate across many closes");
    }
    if (behaviorTags.includes("panic_seller")) {
      v -= 25;
      evidence.push("Panic exits detected within an hour of entry");
    }
    if (behaviorTags.includes("fomo_entries")) {
      v -= 15;
      evidence.push("Momentum-chasing entries detected");
    }
    return {
      key: "discipline",
      value: clamp100(v),
      confidence: dataConfidence(closed.length, 15),
      evidence,
    };
  },

  timing: (ctx) => {
    const { closed } = ctx;
    const evidence: string[] = [];
    // Proxy: ROI distribution of closed trades - good timers capture more of
    // the move (higher median ROI on winners, shallower losers).
    const winners = closed.filter((c) => c.realizedPnlSol > 0);
    const losers = closed.filter((c) => c.realizedPnlSol <= 0);
    const avgWinRoi = winners.length
      ? winners.reduce((s, c) => s + c.roiPercent, 0) / winners.length
      : 0;
    const avgLossRoi = losers.length
      ? Math.abs(losers.reduce((s, c) => s + c.roiPercent, 0) / losers.length)
      : 0;
    const captureScore = Math.min(100, avgWinRoi);
    const exitScore = Math.max(0, 100 - avgLossRoi * 1.5);
    if (avgWinRoi > 40) evidence.push(`Winners average +${avgWinRoi.toFixed(0)}% ROI`);
    if (avgLossRoi < 25 && losers.length > 0)
      evidence.push("Losses are cut before they run deep");
    return {
      key: "timing",
      value: clamp100(captureScore * 0.55 + exitScore * 0.45),
      confidence: dataConfidence(closed.length, 15),
      evidence,
    };
  },

  patience: (ctx) => {
    const { closed, metrics } = ctx;
    const evidence: string[] = [];
    const winners = closed.filter((c) => c.realizedPnlSol > 0);
    const avgWinHold = winners.length
      ? winners.reduce((s, c) => s + c.holdDurationSec, 0) / winners.length
      : 0;
    // Holding winners > 1 day scores high; sub-hour scalps score low (that's a
    // style, not a flaw - patience just measures it).
    const holdScore = Math.min(100, (avgWinHold / 86400) * 60 + (metrics.medianHoldDurationSec / 86400) * 40);
    if (avgWinHold > 86400) evidence.push("Winners held for days, not minutes");
    if (ctx.behaviorTags.includes("early_seller"))
      evidence.push("Winners often sold faster than losers");
    return {
      key: "patience",
      value: clamp100(holdScore),
      confidence: dataConfidence(closed.length, 10),
      evidence,
    };
  },

  recovery: (ctx) => {
    const { closed } = ctx;
    const evidence: string[] = [];
    // Chronological equity walk: how well realized losses are followed by
    // recovering gains.
    const sorted = [...closed].sort((a, b) => a.sellTime - b.sellTime);
    let running = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let recovered = 0;
    let drawdowns = 0;
    let inDrawdown = false;
    for (const c of sorted) {
      running += c.realizedPnlSol;
      if (running > peak) {
        if (inDrawdown) {
          recovered++;
          inDrawdown = false;
        }
        peak = running;
      } else {
        const dd = peak - running;
        if (dd > maxDrawdown) maxDrawdown = dd;
        if (dd > 0.05 && !inDrawdown) {
          inDrawdown = true;
          drawdowns++;
        }
      }
    }
    const recoveryRate = drawdowns > 0 ? recovered / drawdowns : 0.5;
    if (recovered > 0) evidence.push(`Recovered from ${recovered} of ${drawdowns} drawdowns`);
    if (drawdowns === 0 && sorted.length >= 5) evidence.push("No meaningful drawdowns yet");
    return {
      key: "recovery",
      value: clamp100(recoveryRate * 100),
      confidence: dataConfidence(drawdowns, 3) * dataConfidence(closed.length, 10),
      evidence,
    };
  },

  profitability: (ctx) => {
    const { metrics, closed } = ctx;
    const evidence: string[] = [];
    const totalCost = closed.reduce((s, c) => s + c.costBasisSol, 0);
    const roi = totalCost > 0 ? (metrics.realizedPnlSol / totalCost) * 100 : 0;
    let v = 50 + roi; // ROI of +50% → 100; −50% → 0
    if (metrics.realizedPnlSol > 0) evidence.push(`Net realized profit of ${metrics.realizedPnlSol.toFixed(2)} SOL`);
    else if (closed.length > 0) evidence.push("Currently net negative on closed trades");
    if (roi > 20) evidence.push(`+${roi.toFixed(0)}% realized ROI overall`);
    return {
      key: "profitability",
      value: clamp100(v),
      confidence: dataConfidence(closed.length, 15),
      evidence,
    };
  },

  conviction: (ctx) => {
    const { events, behaviorTags } = ctx;
    const evidence: string[] = [];
    const sizes = events.filter((e) => e.side === "buy").map((e) => e.solAmount);
    if (sizes.length === 0) {
      return { key: "conviction", value: 0, confidence: 0, evidence };
    }
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const max = Math.max(...sizes);
    const ratio = avg > 0 ? max / avg : 1;
    let v = Math.min(100, ratio * 20);
    if (behaviorTags.includes("high_conviction")) {
      v = Math.max(v, 65);
      evidence.push("Sizes up significantly on selected plays");
    }
    if (behaviorTags.includes("diamond_hands")) {
      v += 15;
      evidence.push("Holds through drawdowns with conviction");
    }
    return {
      key: "conviction",
      value: clamp100(v),
      confidence: dataConfidence(sizes.length, 10),
      evidence,
    };
  },

  position_sizing: (ctx) => {
    const { events, behaviorTags } = ctx;
    const evidence: string[] = [];
    const sizes = events.filter((e) => e.side === "buy").map((e) => e.solAmount);
    if (sizes.length < 3) {
      return { key: "position_sizing", value: 50, confidence: 0.1, evidence };
    }
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const cv = mean > 0 ? stdDev(sizes) / mean : 1;
    let v = Math.max(0, 100 - cv * 55);
    if (behaviorTags.includes("good_sizing")) {
      v = Math.max(v, 80);
      evidence.push("Remarkably consistent buy sizes");
    } else if (cv > 1) {
      evidence.push("Buy sizes vary widely between trades");
    }
    return {
      key: "position_sizing",
      value: clamp100(v),
      confidence: dataConfidence(sizes.length, 10),
      evidence,
    };
  },

  diversification: (ctx) => {
    const { metrics } = ctx;
    const evidence: string[] = [];
    if (metrics.uniqueTokensTraded > 10)
      evidence.push(`${metrics.uniqueTokensTraded} unique tokens traded`);
    if (metrics.holdingConcentration > 0.6)
      evidence.push("Current holdings concentrated in few tokens");
    return {
      key: "diversification",
      value: clamp100(metrics.diversificationScore),
      confidence: dataConfidence(metrics.totalTrades, 10),
      evidence,
    };
  },

  drawdown_management: (ctx) => {
    const { closed, metrics } = ctx;
    const evidence: string[] = [];
    // Max single loss relative to average position size + loss capping.
    const worstLossRatio =
      metrics.avgPositionSizeSol > 0
        ? metrics.largestLossSol / metrics.avgPositionSizeSol
        : 0;
    let v = Math.max(0, 100 - worstLossRatio * 40);
    const losers = closed.filter((c) => c.realizedPnlSol < 0);
    const deepLosses = losers.filter((c) => c.roiPercent < -60).length;
    if (deepLosses > 0) {
      v -= deepLosses * 8;
      evidence.push(`${deepLosses} trades closed below −60% ROI`);
    } else if (losers.length > 0) {
      evidence.push("No catastrophic single-trade losses");
    }
    return {
      key: "drawdown_management",
      value: clamp100(v),
      confidence: dataConfidence(losers.length, 5),
      evidence,
    };
  },

  activity: (ctx) => {
    const { metrics } = ctx;
    const evidence: string[] = [];
    const v = Math.min(100, metrics.totalTrades * 1.2 + metrics.walletAgeDays * 0.4);
    if (metrics.totalTrades >= 100) evidence.push(`${metrics.totalTrades} swaps analyzed`);
    if (metrics.walletAgeDays > 90) evidence.push("Established trading history");
    return {
      key: "activity",
      value: clamp100(v),
      confidence: 1,
      evidence,
    };
  },
};

/**
 * Evidence count backing each signal. Trade-quality signals are only as
 * trustworthy as the number of *closed* round trips; sizing signals depend on
 * buy count; activity/diversification scale with total swap volume.
 */
function signalSampleSize(key: SignalKey, ctx: SignalContext): number {
  const buyCount = ctx.events.filter((e) => e.side === "buy").length;
  switch (key) {
    case "conviction":
    case "position_sizing":
      return buyCount;
    case "diversification":
    case "activity":
      return ctx.metrics.totalTrades;
    default:
      return ctx.closed.length;
  }
}

/**
 * Compute all registry signals for a context, each gated with a confidence
 * tier + sample size. Pure - no I/O.
 */
export function computeSignals(ctx: SignalContext): SignalResult[] {
  return SIGNAL_KEYS.map((key) => {
    const raw = SIGNAL_COMPUTERS[key](ctx);
    const sampleSize = signalSampleSize(key, ctx);
    return {
      ...raw,
      sampleSize,
      tier: confidenceTier(raw.confidence, sampleSize),
    };
  });
}

// ── Persistence + deltas ─────────────────────────────────────────────────────

/**
 * Auditable comparison behind a 30-day change badge. A badge may only present a
 * numeric change when `status === "comparable"`; otherwise the prior baseline
 * is missing or too thin to trust (never treated as a synthetic zero).
 */
export interface SignalComparison {
  status: "comparable" | "new" | "insufficient_prior";
  previousValue: number | null;
  /** Unix seconds of the prior snapshot used (comparison window start). */
  comparisonStart: number | null;
  /** Unix seconds of this computation (comparison window end). */
  comparisonEnd: number;
  /** currentValue - previousValue, only when comparable. */
  delta: number | null;
  /** Evidence count backing the prior reading. */
  previousSampleSize: number | null;
}

export interface SignalWithDelta extends SignalResult {
  /** Value ~30 days ago (closest trustworthy snapshot), null when none. */
  previousValue: number | null;
  /** value − previousValue, null unless the comparison is trustworthy. */
  delta30d: number | null;
  /** Static directionality (how to read good/bad). */
  direction: SignalDirection;
  /** Which raw inputs this signal reads. */
  basis: SignalBasis;
  /** Full auditable comparison for change-badge integrity. */
  comparison: SignalComparison;
}

/**
 * Persist a signal computation run and return each signal alongside its ~30-day
 * comparison. Writes are throttled to one row per signal per calendar day so
 * the time series stays compact under frequent refreshes.
 *
 * Change-badge integrity (Phase 2): a prior reading is only a valid baseline
 * when it carried enough evidence (>= MIN_SAMPLES_FOR_SCORE). A thin early
 * reading is NOT treated as a real "0" to subtract from - that produced fake
 * "improved" badges. Insufficient priors yield status "insufficient_prior";
 * absent priors yield "new".
 */
export async function persistSignalsWithDeltas(
  wallet: string,
  userId: number | null,
  signals: SignalResult[],
  computedAt: number,
): Promise<SignalWithDelta[]> {
  const dayStart = computedAt - (computedAt % 86400);
  const monthAgo = computedAt - 30 * 86400;

  // Previous readings: closest snapshot at least ~1 day old, preferring ~30d
  // ago, WITH its evidence count so we can reject thin baselines.
  const history = await dbAll<{
    signal_key: string;
    value: number;
    computed_at: number;
    sample_size: number | null;
  }>(
    `SELECT DISTINCT ON (signal_key) signal_key, value, computed_at, sample_size
       FROM real_signal_values
      WHERE wallet = $1 AND computed_at <= $2
      ORDER BY signal_key, ABS(computed_at - $3) ASC`,
    [wallet, dayStart, monthAgo],
  );
  const prevByKey = new Map(history.map((h) => [h.signal_key, h]));

  for (const s of signals) {
    // One row per signal per day: replace today's reading if it exists.
    await dbRun(
      `DELETE FROM real_signal_values
        WHERE wallet = $1 AND signal_key = $2 AND computed_at >= $3`,
      [wallet, s.key, dayStart],
    );
    await dbRun(
      `INSERT INTO real_signal_values (wallet, user_id, signal_key, value, confidence, sample_size, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [wallet, userId, s.key, s.value, s.confidence, s.sampleSize, computedAt],
    );
  }

  return signals.map((s) => {
    const meta = SIGNAL_META[s.key];
    const comparison = buildComparison(s, prevByKey.get(s.key), computedAt);
    return {
      ...s,
      previousValue: comparison.previousValue,
      delta30d: comparison.delta,
      direction: meta.direction,
      basis: meta.basis,
      comparison,
    };
  });
}

/** Decide whether a prior reading is a trustworthy comparison baseline. */
function buildComparison(
  current: SignalResult,
  prev: { value: number; computed_at: number; sample_size: number | null } | undefined,
  computedAt: number,
): SignalComparison {
  if (!prev) {
    return {
      status: "new",
      previousValue: null,
      comparisonStart: null,
      comparisonEnd: computedAt,
      delta: null,
      previousSampleSize: null,
    };
  }
  const prevSamples = prev.sample_size ?? 0;
  // A thin prior (or a current reading we cannot yet score) is not comparable.
  if (
    prevSamples < MIN_SAMPLES_FOR_SCORE ||
    current.tier === "insufficient"
  ) {
    return {
      status: "insufficient_prior",
      previousValue: prev.value,
      comparisonStart: prev.computed_at,
      comparisonEnd: computedAt,
      delta: null,
      previousSampleSize: prevSamples,
    };
  }
  return {
    status: "comparable",
    previousValue: prev.value,
    comparisonStart: prev.computed_at,
    comparisonEnd: computedAt,
    delta: Math.round(current.value - prev.value),
    previousSampleSize: prevSamples,
  };
}
