/**
 * Extensible behavioral rules engine for Real Trading Analysis.
 * Each rule returns tags + insights when triggered.
 */

import type { ClosedRoundTrip, ParsedSwapEvent, TradingMetrics } from "./real-trading-math.js";
import { stdDev } from "./real-trading-math.js";

export interface BehaviorInsight {
  key: string;
  category: "behavior" | "strength" | "weakness" | "pattern";
  title: string;
  description: string;
  severity: "info" | "positive" | "warning";
  confidence: number;
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

const RULES: BehaviorRule[] = [
  // Early seller: winners closed faster than losers.
  (ctx) => {
    const wins = ctx.closed.filter((c) => c.realizedPnlSol > 0);
    const losses = ctx.closed.filter((c) => c.realizedPnlSol <= 0);
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
      };
    }
    return null;
  },

  // Averages down: multiple buys on same token while declining.
  (ctx) => {
    const buysByMint = new Map<string, ParsedSwapEvent[]>();
    for (const e of ctx.events.filter((x) => x.side === "buy")) {
      const list = buysByMint.get(e.tokenMint) ?? [];
      list.push(e);
      buysByMint.set(e.tokenMint, list);
    }
    let avgDownCount = 0;
    for (const buys of buysByMint.values()) {
      if (buys.length < 3) continue;
      const sorted = [...buys].sort((a, b) => a.blockTime - b.blockTime);
      let declining = true;
      for (let i = 1; i < sorted.length; i++) {
        const prevPrice = sorted[i - 1]!.solAmount / sorted[i - 1]!.tokenAmount;
        const curPrice = sorted[i]!.solAmount / sorted[i]!.tokenAmount;
        if (curPrice >= prevPrice) {
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
      };
    }
    return null;
  },

  // Good position sizing: low variance in buy sizes.
  (ctx) => {
    const sizes = ctx.events
      .filter((e) => e.side === "buy")
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
      };
    }
    return null;
  },

  // High conviction: large positions relative to average.
  (ctx) => {
    const sizes = ctx.events
      .filter((e) => e.side === "buy")
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
      };
    }
    return null;
  },

  // Diamond hands: holds losers much longer than winners.
  (ctx) => {
    const wins = ctx.closed.filter((c) => c.realizedPnlSol > 0);
    const losses = ctx.closed.filter((c) => c.realizedPnlSol <= 0);
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
      };
    }
    return null;
  },

  // Panic seller: many sells within 1h at a loss.
  (ctx) => {
    const panic = ctx.closed.filter(
      (c) => c.holdDurationSec < 3600 && c.realizedPnlSol < 0,
    );
    if (panic.length >= 3 && panic.length / ctx.closed.length > 0.25) {
      return {
        key: "panic_seller",
        category: "weakness",
        title: "Serial panic seller",
        description:
          "A notable share of your losses come from exits within an hour of entry. Pausing before selling may help.",
        severity: "warning",
        confidence: 0.8,
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
      };
    }
    return null;
  },

  // FOMO: buys clustered after large prior run-up (proxy: rapid rebuys same token).
  (ctx) => {
    const buysByMint = new Map<string, ParsedSwapEvent[]>();
    for (const e of ctx.events.filter((x) => x.side === "buy")) {
      const list = buysByMint.get(e.tokenMint) ?? [];
      list.push(e);
      buysByMint.set(e.tokenMint, list);
    }
    let fomoCount = 0;
    for (const buys of buysByMint.values()) {
      const sorted = [...buys].sort((a, b) => a.blockTime - b.blockTime);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i]!.blockTime - sorted[i - 1]!.blockTime;
        const prevPrice = sorted[i - 1]!.solAmount / sorted[i - 1]!.tokenAmount;
        const curPrice = sorted[i]!.solAmount / sorted[i]!.tokenAmount;
        if (gap < 3600 && curPrice > prevPrice * 1.15) fomoCount++;
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
