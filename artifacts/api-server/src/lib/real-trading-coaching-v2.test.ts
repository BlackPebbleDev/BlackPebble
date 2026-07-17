import { describe, it, expect } from "vitest";
import {
  buildCoachingContext,
  COACHING_CONTEXT_VERSION,
  COACHING_PROHIBITED_CLAIMS,
  type CoachingInput,
} from "./real-trading-coaching.js";
import type { HistoricalRisk } from "./real-trading-risk.js";

function baseRisk(): HistoricalRisk {
  return {
    profileTier: "moderate",
    profitFactor: null,
    expectancySol: null,
    payoffRatio: null,
    maxDrawdownSol: null,
    maxDrawdownPct: null,
    longestDrawdownSec: null,
    currentStreak: 0,
    maxWinStreak: 0,
    maxLossStreak: 0,
    resultVolatilitySol: null,
    tailLossConcentration: null,
    tailGainConcentration: null,
    drawdownEpisodes: [],
    sampleSize: 0,
    confidence: "insufficient",
    limitations: [],
  } as unknown as HistoricalRisk;
}

function input(over: Partial<CoachingInput> = {}): CoachingInput {
  return {
    signals: [],
    insights: [],
    historicalRisk: baseRisk(),
    reportConfidence: "high",
    ...over,
  };
}

describe("coaching context v2", () => {
  it("carries version and prohibited claims", () => {
    const ctx = buildCoachingContext(input());
    expect(ctx.version).toBe(COACHING_CONTEXT_VERSION);
    expect(ctx.prohibitedClaims).toEqual(COACHING_PROHIBITED_CLAIMS);
    expect(ctx.prohibitedClaims.some((c) => /guarantee profit/i.test(c))).toBe(true);
  });

  it("includes entry/exit/liquidity summaries when supplied", () => {
    const ctx = buildCoachingContext(
      input({
        entrySummary: {
          avgEntryScore: 62,
          coveragePercent: 80,
          confidence: "high",
        } as never,
        exitSummary: {
          avgExitScore: 55,
          coveragePercent: 70,
          confidence: "medium",
        } as never,
        liquiditySummary: {
          weightedLiquidityQuality: 74,
          fragilePositionsCount: 1,
          confidence: "high",
        } as never,
        analyzedRange: { start: 100, end: 200 },
        coverageTier: "high",
      }),
    );
    expect(ctx.entryQuality?.avgScore).toBe(62);
    expect(ctx.exitQuality?.avgScore).toBe(55);
    expect(ctx.liquidity?.weightedQuality).toBe(74);
    expect(ctx.analyzedRange).toEqual({ start: 100, end: 200 });
    expect(ctx.coverageTier).toBe("high");
  });

  it("serializes deterministically for identical input", () => {
    const a = JSON.stringify(buildCoachingContext(input()));
    const b = JSON.stringify(buildCoachingContext(input()));
    expect(a).toBe(b);
  });

  it("bounds evidence trades to 6", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      roundTripId: `rt_${i}`,
      mint: "M",
      realizedPnlSol: -i,
      reason: "loss",
    }));
    const ctx = buildCoachingContext(input({ evidenceTrades: many }));
    expect(ctx.evidenceTrades.length).toBe(6);
  });
});
