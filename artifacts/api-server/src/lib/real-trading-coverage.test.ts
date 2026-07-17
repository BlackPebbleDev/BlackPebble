import { describe, it, expect } from "vitest";
import { computeCoverage, type CoverageInput } from "./real-trading-coverage.js";

function base(over: Partial<CoverageInput> = {}): CoverageInput {
  return {
    parsedSwaps: 100,
    unsupportedSwaps: 0,
    completedTrades: 30,
    verifiedHoldings: 5,
    unpricedHoldings: 0,
    holdingsVerified: true,
    historyTruncated: false,
    droppedGhostMints: 0,
    firstTradeAt: 1_700_000_000,
    lastTradeAt: 1_700_500_000,
    ...over,
  };
}

describe("computeCoverage", () => {
  it("reports high coverage for a clean, well-populated wallet", () => {
    const c = computeCoverage(base());
    expect(c.tier).toBe("high");
    expect(c.limitations).toHaveLength(0);
    expect(c.parseCoverage).toBeCloseTo(1, 5);
    expect(c.pricingCoverage).toBeCloseTo(1, 5);
  });

  it("is insufficient below the completed-trade floor", () => {
    expect(computeCoverage(base({ completedTrades: 3 })).tier).toBe("insufficient");
  });

  it("drops to limited when holdings are unverified", () => {
    const c = computeCoverage(base({ holdingsVerified: false }));
    expect(c.tier).toBe("limited");
    expect(c.limitations.join(" ")).toMatch(/could not be verified/i);
  });

  it("drops to limited when history is truncated", () => {
    expect(computeCoverage(base({ historyTruncated: true })).tier).toBe("limited");
  });

  it("computes parse and pricing coverage fractions and lists limitations", () => {
    const c = computeCoverage(
      base({
        parsedSwaps: 80,
        unsupportedSwaps: 20,
        verifiedHoldings: 6,
        unpricedHoldings: 4,
      }),
    );
    expect(c.parseCoverage).toBeCloseTo(0.8, 5);
    expect(c.pricingCoverage).toBeCloseTo(0.6, 5);
    expect(c.limitations.length).toBeGreaterThan(0);
  });

  it("is moderate for a smaller but clean sample", () => {
    expect(computeCoverage(base({ completedTrades: 8 })).tier).toBe("moderate");
  });
});
