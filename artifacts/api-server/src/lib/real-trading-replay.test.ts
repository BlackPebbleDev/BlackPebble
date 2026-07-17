import { describe, it, expect } from "vitest";
import { buildTradeReplay, buildTradeSummary } from "./real-trading-replay.js";
import { reconstructRoundTrips } from "./real-trading-roundtrips.js";
import type { ParsedSwapEvent } from "./real-trading-math.js";

function closedTrip() {
  const events: ParsedSwapEvent[] = [
    { signature: "b1", blockTime: 1000, tokenMint: "MINT", side: "buy", tokenAmount: 100, solAmount: 1, dexSource: null },
    { signature: "s1", blockTime: 2000, tokenMint: "MINT", side: "sell", tokenAmount: 100, solAmount: 2, dexSource: null },
  ];
  return reconstructRoundTrips(events).closed[0]!;
}

describe("buildTradeSummary", () => {
  it("produces a compact row with stable id", () => {
    const s = buildTradeSummary(closedTrip(), {
      token: { symbol: "MINT" },
      entryClassification: "pullback",
      behaviorFlags: ["revenge_trading"],
    });
    expect(s.roundTripId).toMatch(/^rt_/);
    expect(s.realizedPnlSol).toBeCloseTo(1, 9);
    expect(s.outcome).toBe("win");
    expect(s.token.symbol).toBe("MINT");
    expect(s.entryClassification).toBe("pullback");
    expect(s.behaviorFlags).toContain("revenge_trading");
  });
});

describe("buildTradeReplay", () => {
  it("degrades honestly with no enrichment", () => {
    const r = buildTradeReplay(closedTrip());
    expect(r.entryQuality).toBeNull();
    expect(r.exitQuality).toBeNull();
    expect(r.pricePaths).toBeNull();
    expect(r.coverage.hasEntryQuality).toBe(false);
    expect(r.coverage.hasExitQuality).toBe(false);
    expect(r.limitations.length).toBeGreaterThan(0);
    expect(r.token.chain).toBe("solana");
  });

  it("reflects supplied enrichment in coverage flags", () => {
    const r = buildTradeReplay(closedTrip(), {
      entryLiquidityUsd: 100_000,
      behaviorFlags: ["overtrading_bursts"],
      lossContribution: 0.2,
      partOfStreak: true,
    });
    expect(r.coverage.hasLiquidity).toBe(true);
    expect(r.behaviorFlags).toContain("overtrading_bursts");
    expect(r.lossContribution).toBe(0.2);
    expect(r.partOfStreak).toBe(true);
  });
});
