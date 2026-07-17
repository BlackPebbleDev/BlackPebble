/**
 * Extensible behavioral rules engine for Real Trading Analysis.
 * Each rule returns tags + insights when triggered.
 */

import type { ClosedRoundTrip, ParsedSwapEvent, TradingMetrics } from "./real-trading-math.js";
import { classifyOutcome, median, stdDev } from "./real-trading-math.js";
import { computeDrawdownEpisodes } from "./real-trading-risk.js";

/**
 * How a behavior should be read (Phase 2B, Part 3). Distinct from `severity`
 * (which drives colour): a `strength` is good, an `area_to_watch` is worth
 * attention, an `observation` is a neutral style reading.
 */
export type BehaviorClassification = "strength" | "observation" | "area_to_watch";

/**
 * Direction of change over time. We only track the latest behavior snapshot, so
 * new sequence-based behaviors honestly report "insufficient_history" until a
 * per-behavior time series exists.
 */
export type BehaviorTrend =
  | "improving"
  | "worsening"
  | "stable"
  | "insufficient_history";

export interface BehaviorInsight {
  key: string;
  category: "behavior" | "strength" | "weakness" | "pattern";
  title: string;
  description: string;
  severity: "info" | "positive" | "warning";
  /** 0–1 internal trust in this detection. */
  confidence: number;
  /** Population the rule examined (e.g. closed trades or buys considered). */
  sampleSize: number;
  /** Number of observations that actually matched the pattern. */
  evidenceCount: number;
  /** How to read it (strength / observation / area to watch). Optional. */
  classification?: BehaviorClassification;
  /** One practical, non-judgmental next step. Optional. */
  guidance?: string;
  /** Honest caveats about what this detection can and cannot prove. Optional. */
  limitations?: string;
  /** Change over time; "insufficient_history" until a time series exists. */
  trend?: BehaviorTrend;
}

export interface BehaviorAnalysis {
  tags: string[];
  insights: BehaviorInsight[];
}

interface RuleContext {
  events: ParsedSwapEvent[];
  closed: ClosedRoundTrip[];
  metrics: TradingMetrics;
}

type BehaviorRule = (ctx: RuleContext) => BehaviorInsight | null;

/**
 * A buy smaller than this in SOL is treated as dust for BEHAVIOR detection: it
 * must never, on its own, trigger a behavioral conclusion (FOMO, averaging
 * down, conviction, sizing). Trades this small are dominated by fees, slippage,
 * and rounding, so their swap-implied prices are not trustworthy signals.
 */
export const MIN_MEANINGFUL_BUY_SOL = 0.01;

/**
 * Minimum consecutive-buy price decline (10%) required to count as "averaging
 * down". A strict `<` would fire on sub-percent moves that are really slippage
 * or fee noise, not a deliberate decision.
 */
const AVERAGE_DOWN_DROP = 0.1;

/**
 * Minimum consecutive-buy price rise (15%) within a short window to count as a
 * FOMO re-entry. Absorbs slippage/fee noise on the swap-implied price.
 */
const FOMO_RISE = 0.15;

/** Meaningful buys per mint: dust-filtered and de-duplicated by signature. */
function meaningfulBuysByMint(
  events: ParsedSwapEvent[],
): Map<string, ParsedSwapEvent[]> {
  const seen = new Set<string>();
  const byMint = new Map<string, ParsedSwapEvent[]>();
  for (const e of events) {
    if (e.side !== "buy") continue;
    if (e.solAmount < MIN_MEANINGFUL_BUY_SOL) continue; // dust
    if (e.tokenAmount <= 0) continue;
    const id = `${e.signature}:${e.tokenMint}`;
    if (seen.has(id)) continue; // duplicate tx
    seen.add(id);
    const list = byMint.get(e.tokenMint) ?? [];
    list.push(e);
    byMint.set(e.tokenMint, list);
  }
  return byMint;
}

const RULES: BehaviorRule[] = [
  // Early seller: winners closed faster than losers.
  (ctx) => {
    const wins = ctx.closed.filter((c) => classifyOutcome(c.realizedPnlSol) === "win");
    const losses = ctx.closed.filter((c) => classifyOutcome(c.realizedPnlSol) === "loss");
    if (wins.length < 3 || losses.length < 2) return null;
    const avgWinHold =
      wins.reduce((s, c) => s + c.holdDurationSec, 0) / wins.length;
    const avgLossHold =
      losses.reduce((s, c) => s + c.holdDurationSec, 0) / losses.length;
    if (avgWinHold < avgLossHold * 0.5) {
      return {
        key: "early_seller",
        category: "weakness",
        title: "Tends to sell winners early",
        description:
          "Your winning trades are closed significantly faster than losing ones. Letting winners run may improve overall returns.",
        severity: "warning",
        confidence: 0.75,
        sampleSize: ctx.closed.length,
        evidenceCount: wins.length,
      };
    }
    return null;
  },

  // Averages down: multiple meaningful buys on same token at materially lower
  // prices. Dust and duplicate txs are excluded, and a 10% decline threshold
  // absorbs slippage/fee noise so sub-percent moves never trigger it.
  (ctx) => {
    const buysByMint = meaningfulBuysByMint(ctx.events);
    let avgDownCount = 0;
    let mintsConsidered = 0;
    for (const buys of buysByMint.values()) {
      if (buys.length < 3) continue;
      mintsConsidered++;
      const sorted = [...buys].sort((a, b) => a.blockTime - b.blockTime);
      let declining = true;
      for (let i = 1; i < sorted.length; i++) {
        const prevPrice = sorted[i - 1]!.solAmount / sorted[i - 1]!.tokenAmount;
        const curPrice = sorted[i]!.solAmount / sorted[i]!.tokenAmount;
        if (curPrice >= prevPrice * (1 - AVERAGE_DOWN_DROP)) {
          declining = false;
          break;
        }
      }
      if (declining) avgDownCount++;
    }
    if (avgDownCount >= 1) {
      return {
        key: "averages_down",
        category: "pattern",
        title: "Averages down into losers",
        description:
          "Multiple buys on the same token while price was declining detected. Consider whether this aligns with your risk plan.",
        severity: "warning",
        confidence: 0.7,
        sampleSize: mintsConsidered,
        evidenceCount: avgDownCount,
      };
    }
    return null;
  },

  // Good position sizing: low variance in buy sizes (dust excluded).
  (ctx) => {
    const sizes = ctx.events
      .filter((e) => e.side === "buy" && e.solAmount >= MIN_MEANINGFUL_BUY_SOL)
      .map((e) => e.solAmount);
    if (sizes.length < 5) return null;
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    if (mean <= 0) return null;
    const cv = stdDev(sizes) / mean;
    if (cv < 0.35) {
      return {
        key: "good_sizing",
        category: "strength",
        title: "Excellent position sizing",
        description:
          "Your buy sizes are remarkably consistent - a hallmark of disciplined risk management.",
        severity: "positive",
        confidence: 0.8,
        sampleSize: sizes.length,
        evidenceCount: sizes.length,
      };
    }
    return null;
  },

  // High conviction: large positions relative to average (dust excluded).
  (ctx) => {
    const sizes = ctx.events
      .filter((e) => e.side === "buy" && e.solAmount >= MIN_MEANINGFUL_BUY_SOL)
      .map((e) => e.solAmount);
    if (sizes.length < 3) return null;
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const max = Math.max(...sizes);
    if (max > avg * 3) {
      return {
        key: "high_conviction",
        category: "pattern",
        title: "High conviction trader",
        description:
          "You occasionally take significantly larger positions than your average - conviction sizing is part of your style.",
        severity: "info",
        confidence: 0.7,
        sampleSize: sizes.length,
        evidenceCount: sizes.filter((s) => s > avg * 3).length,
      };
    }
    return null;
  },

  // Scalper: median hold < 1 hour.
  (ctx) => {
    if (ctx.metrics.medianHoldDurationSec <= 0) return null;
    if (ctx.metrics.medianHoldDurationSec < 3600 && ctx.closed.length >= 5) {
      return {
        key: "scalper",
        category: "pattern",
        title: "Scalper",
        description:
          "Most positions are closed within an hour. You thrive on quick, tactical entries and exits.",
        severity: "info",
        confidence: 0.85,
        sampleSize: ctx.closed.length,
        evidenceCount: ctx.closed.filter((c) => c.holdDurationSec < 3600).length,
      };
    }
    return null;
  },

  // Swing trader: median hold 1–7 days.
  (ctx) => {
    const h = ctx.metrics.medianHoldDurationSec;
    if (h >= 86400 && h <= 7 * 86400 && ctx.closed.length >= 3) {
      return {
        key: "swing_trader",
        category: "pattern",
        title: "Swing trader",
        description:
          "Your typical hold duration spans days, not minutes - a patient, swing-oriented approach.",
        severity: "info",
        confidence: 0.8,
        sampleSize: ctx.closed.length,
        evidenceCount: ctx.closed.filter(
          (c) => c.holdDurationSec >= 86400 && c.holdDurationSec <= 7 * 86400,
        ).length,
      };
    }
    return null;
  },

  // Diamond hands: holds losers much longer than winners.
  (ctx) => {
    const wins = ctx.closed.filter((c) => classifyOutcome(c.realizedPnlSol) === "win");
    const losses = ctx.closed.filter((c) => classifyOutcome(c.realizedPnlSol) === "loss");
    if (wins.length < 2 || losses.length < 2) return null;
    const avgWinHold =
      wins.reduce((s, c) => s + c.holdDurationSec, 0) / wins.length;
    const avgLossHold =
      losses.reduce((s, c) => s + c.holdDurationSec, 0) / losses.length;
    if (avgLossHold > avgWinHold * 2) {
      return {
        key: "diamond_hands",
        category: "pattern",
        title: "Diamond hands",
        description:
          "You hold losing positions significantly longer than winners - conviction through drawdowns is your style.",
        severity: "info",
        confidence: 0.75,
        sampleSize: wins.length + losses.length,
        evidenceCount: losses.length,
      };
    }
    return null;
  },

  // Panic seller: many sells within 1h at a loss.
  (ctx) => {
    const panic = ctx.closed.filter(
      (c) => c.holdDurationSec < 3600 && classifyOutcome(c.realizedPnlSol) === "loss",
    );
    if (panic.length >= 3 && panic.length / ctx.closed.length > 0.25) {
      return {
        key: "panic_seller",
        category: "weakness",
        title: "Fast exits under pressure",
        description:
          "A notable share of your losses come from exits within an hour of entry. A brief pause before selling may help.",
        severity: "warning",
        confidence: 0.8,
        sampleSize: ctx.closed.length,
        evidenceCount: panic.length,
      };
    }
    return null;
  },

  // Disciplined risk: win rate > 55% with 10+ closed trades.
  (ctx) => {
    if (ctx.metrics.winRate >= 0.55 && ctx.closed.length >= 10) {
      return {
        key: "disciplined_risk",
        category: "strength",
        title: "Disciplined risk management",
        description:
          "Your win rate across closed trades shows consistent, measured decision-making.",
        severity: "positive",
        confidence: 0.85,
        sampleSize: ctx.closed.length,
        evidenceCount: ctx.closed.filter((c) => classifyOutcome(c.realizedPnlSol) === "win").length,
      };
    }
    return null;
  },

  // FOMO: meaningful re-buys of the same token at materially higher prices in a
  // short window. Dust and duplicate txs are excluded; the 15% rise threshold
  // absorbs slippage/fee noise on the swap-implied price.
  (ctx) => {
    const buysByMint = meaningfulBuysByMint(ctx.events);
    let fomoCount = 0;
    let rebuyPairs = 0;
    for (const buys of buysByMint.values()) {
      const sorted = [...buys].sort((a, b) => a.blockTime - b.blockTime);
      for (let i = 1; i < sorted.length; i++) {
        rebuyPairs++;
        const gap = sorted[i]!.blockTime - sorted[i - 1]!.blockTime;
        const prevPrice = sorted[i - 1]!.solAmount / sorted[i - 1]!.tokenAmount;
        const curPrice = sorted[i]!.solAmount / sorted[i]!.tokenAmount;
        if (gap < 3600 && curPrice > prevPrice * (1 + FOMO_RISE)) fomoCount++;
      }
    }
    if (fomoCount >= 2) {
      return {
        key: "fomo_entries",
        category: "weakness",
        title: "FOMO entries detected",
        description:
          "Repeated buys at rising prices within short windows suggest chasing momentum. Consider waiting for pullbacks.",
        severity: "warning",
        confidence: 0.65,
        sampleSize: rebuyPairs,
        evidenceCount: fomoCount,
        classification: "area_to_watch",
        guidance: "Waiting for a pullback instead of chasing the candle tends to improve entries.",
        limitations: "Based on swap-implied price; short-window moves can be noisy.",
        trend: "insufficient_history",
      };
    }
    return null;
  },

  // ── Phase 2B: sequence-based behaviors (evidence-gated) ──────────────────

  // Position-size escalation: later buys materially larger than the early
  // baseline (a repeated trend, not a single conviction spike).
  (ctx) => {
    const buys = ctx.events
      .filter((e) => e.side === "buy" && e.solAmount >= MIN_MEANINGFUL_BUY_SOL)
      .sort((a, b) => a.blockTime - b.blockTime);
    if (buys.length < 6) return null;
    const half = Math.floor(buys.length / 2);
    const earlyMedian = median(buys.slice(0, half).map((e) => e.solAmount));
    const late = buys.slice(half).map((e) => e.solAmount);
    if (earlyMedian <= 0) return null;
    const escalated = late.filter((s) => s > earlyMedian * 2);
    if (escalated.length >= 3 && median(late) > earlyMedian * 1.5) {
      return {
        key: "size_escalation",
        category: "pattern",
        title: "Position sizes are escalating",
        description: `Your recent buys are materially larger than your earlier baseline (${escalated.length} recent buys over 2x your early median size). Escalating size amplifies both gains and losses.`,
        severity: "warning",
        confidence: 0.65,
        sampleSize: buys.length,
        evidenceCount: escalated.length,
        classification: "area_to_watch",
        guidance: "Tie position sizing to a fixed plan rather than recent outcomes.",
        limitations: "Based on swap-implied SOL size; does not account for account-balance growth.",
        trend: "insufficient_history",
      };
    }
    return null;
  },

  // Overtrading: a few days carry far more trades than a typical active day.
  (ctx) => {
    const byDay = new Map<number, number>();
    for (const e of ctx.events) {
      const day = Math.floor(e.blockTime / 86400);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const counts = [...byDay.values()];
    if (counts.length < 5) return null;
    const med = median(counts);
    if (med <= 0) return null;
    const bursts = counts.filter((c) => c >= Math.max(5, med * 3));
    if (bursts.length >= 2) {
      return {
        key: "overtrading_bursts",
        category: "pattern",
        title: "Trading comes in bursts",
        description: `${bursts.length} days carried far more trades than your typical active day (median ${med.toFixed(0)}/day). High-frequency bursts can lower decision quality.`,
        severity: "warning",
        confidence: 0.6,
        sampleSize: counts.length,
        evidenceCount: bursts.length,
        classification: "area_to_watch",
        guidance: "Notice what triggers your busiest days and whether those trades actually outperform.",
        limitations: "Counts swaps per UTC day; does not judge individual trade quality.",
        trend: "insufficient_history",
      };
    }
    return null;
  },

  // Re-entry persistence: repeatedly round-tripping the same asset.
  (ctx) => {
    const byMint = new Map<string, ClosedRoundTrip[]>();
    for (const c of ctx.closed) {
      const list = byMint.get(c.tokenMint) ?? [];
      list.push(c);
      byMint.set(c.tokenMint, list);
    }
    const persistent = [...byMint.values()].filter((l) => l.length >= 3);
    if (persistent.length === 0) return null;
    let improved = 0;
    for (const list of persistent) {
      const sorted = [...list].sort((a, b) => a.sellTime - b.sellTime);
      const half = Math.floor(sorted.length / 2);
      const earlyPnl = sorted
        .slice(0, half)
        .reduce((s, c) => s + c.realizedPnlSol, 0);
      const latePnl = sorted
        .slice(half)
        .reduce((s, c) => s + c.realizedPnlSol, 0);
      if (latePnl > earlyPnl) improved++;
    }
    return {
      key: "reentry_persistence",
      category: "pattern",
      title: "Repeatedly re-trades the same tokens",
      description: `You round-tripped ${persistent.length} token${persistent.length === 1 ? "" : "s"} three or more times. Later attempts improved on earlier ones in ${improved} of ${persistent.length}.`,
      severity: "info",
      confidence: 0.7,
      sampleSize: byMint.size,
      evidenceCount: persistent.length,
      classification: "observation",
      guidance: "Re-trading a familiar token can be an edge — track whether it truly pays off.",
      trend: "insufficient_history",
    };
  },

  // Revenge trading: an outsized buy shortly after realizing a loss (repeated).
  (ctx) => {
    const buys = ctx.events.filter(
      (e) => e.side === "buy" && e.solAmount >= MIN_MEANINGFUL_BUY_SOL,
    );
    if (buys.length < 5) return null;
    const medianBuy = median(buys.map((e) => e.solAmount));
    if (medianBuy <= 0) return null;
    const losingSells = ctx.closed
      .filter((c) => classifyOutcome(c.realizedPnlSol) === "loss")
      .map((c) => c.sellTime)
      .sort((a, b) => a - b);
    if (losingSells.length < 3) return null;
    let revenge = 0;
    for (const sellTime of losingSells) {
      const next = buys.find(
        (b) => b.blockTime > sellTime && b.blockTime - sellTime <= 2 * 3600,
      );
      if (next && next.solAmount > medianBuy * 1.5) revenge++;
    }
    if (revenge >= 3) {
      return {
        key: "revenge_trading",
        category: "weakness",
        title: "Larger buys after losses",
        description: `On ${revenge} occasions you opened an outsized position within two hours of realizing a loss. Sizing up right after a loss can compound drawdowns.`,
        severity: "warning",
        confidence: 0.6,
        sampleSize: losingSells.length,
        evidenceCount: revenge,
        classification: "area_to_watch",
        guidance: "A short cool-down and normal sizing after a loss can protect capital.",
        limitations: "Timing is inferred from swap order; unrelated buys can occasionally coincide.",
        trend: "insufficient_history",
      };
    }
    return null;
  },

  // Strong recovery: consistently climbs back out of realized drawdowns.
  (ctx) => {
    const { episodes } = computeDrawdownEpisodes(ctx.closed);
    if (episodes.length < 3) return null;
    const recovered = episodes.filter((e) => e.recovered).length;
    if (recovered / episodes.length >= 0.7) {
      return {
        key: "strong_recovery",
        category: "strength",
        title: "Recovers well from drawdowns",
        description: `You climbed back to new highs after ${recovered} of ${episodes.length} realized drawdowns — a sign of resilience.`,
        severity: "positive",
        confidence: 0.75,
        sampleSize: episodes.length,
        evidenceCount: recovered,
        classification: "strength",
        guidance: "Keep protecting capital during drawdowns so recoveries stay achievable.",
        trend: "insufficient_history",
      };
    }
    return null;
  },
];

export function analyzeBehavior(
  events: ParsedSwapEvent[],
  closed: ClosedRoundTrip[],
  metrics: TradingMetrics,
): BehaviorAnalysis {
  const ctx: RuleContext = { events, closed, metrics };
  const insights: BehaviorInsight[] = [];
  const tags: string[] = [];

  for (const rule of RULES) {
    const result = rule(ctx);
    if (result) {
      insights.push(result);
      tags.push(result.key);
    }
  }

  return { tags, insights };
}
