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

export interface SignalResult {
  key: SignalKey;
  /** 0–100. For `risk`, higher = MORE risk taken (not better/worse). */
  value: number;
  /** 0–1 - how much data backs this reading. */
  confidence: number;
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

type SignalFn = (ctx: SignalContext) => SignalResult;

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

/** Compute all registry signals for a context. Pure - no I/O. */
export function computeSignals(ctx: SignalContext): SignalResult[] {
  return SIGNAL_KEYS.map((key) => SIGNAL_COMPUTERS[key](ctx));
}

// ── Persistence + deltas ─────────────────────────────────────────────────────

export interface SignalWithDelta extends SignalResult {
  /** Value ~30 days ago (closest snapshot), null when no history exists. */
  previousValue: number | null;
  /** value − previousValue, null when no history exists. */
  delta30d: number | null;
}

/**
 * Persist a signal computation run and return each signal alongside its ~30-day
 * delta. Writes are throttled to one row per signal per calendar day so the
 * time series stays compact under frequent refreshes.
 */
export async function persistSignalsWithDeltas(
  wallet: string,
  userId: number | null,
  signals: SignalResult[],
  computedAt: number,
): Promise<SignalWithDelta[]> {
  const dayStart = computedAt - (computedAt % 86400);
  const monthAgo = computedAt - 30 * 86400;

  // Previous values: closest reading at least ~1 day old, preferring ~30d ago.
  const history = await dbAll<{
    signal_key: string;
    value: number;
    computed_at: number;
  }>(
    `SELECT DISTINCT ON (signal_key) signal_key, value, computed_at
       FROM real_signal_values
      WHERE wallet = $1 AND computed_at <= $2
      ORDER BY signal_key, ABS(computed_at - $3) ASC`,
    [wallet, dayStart, monthAgo],
  );
  const prevByKey = new Map(history.map((h) => [h.signal_key, h.value]));

  for (const s of signals) {
    // One row per signal per day: replace today's reading if it exists.
    await dbRun(
      `DELETE FROM real_signal_values
        WHERE wallet = $1 AND signal_key = $2 AND computed_at >= $3`,
      [wallet, s.key, dayStart],
    );
    await dbRun(
      `INSERT INTO real_signal_values (wallet, user_id, signal_key, value, confidence, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [wallet, userId, s.key, s.value, s.confidence, computedAt],
    );
  }

  return signals.map((s) => {
    const prev = prevByKey.get(s.key) ?? null;
    return {
      ...s,
      previousValue: prev,
      delta30d: prev != null ? Math.round(s.value - prev) : null,
    };
  });
}
