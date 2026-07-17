import { describe, it, expect } from "vitest";
import { computeHoldingsQuality } from "./real-trading-holdings.js";
import type { OpenPosition } from "./real-trading-math.js";

const NOW = 1_700_000_000;

function pos(over: Partial<OpenPosition> = {}): OpenPosition {
  return {
    tokenMint: over.tokenMint ?? "MINT",
    symbol: over.symbol ?? "TKN",
    name: over.name ?? null,
    logo: over.logo ?? null,
    tokenAmount: over.tokenAmount ?? 1000,
    costBasisSol: over.costBasisSol ?? 1,
    avgEntryPriceSol: over.avgEntryPriceSol ?? 0.001,
    firstAcquiredAt: over.firstAcquiredAt ?? NOW - 10 * 86400,
    currentPriceSol: "currentPriceSol" in over ? over.currentPriceSol! : 0.001,
    currentValueSol: "currentValueSol" in over ? over.currentValueSol! : 1,
    unrealizedPnlSol: "unrealizedPnlSol" in over ? over.unrealizedPnlSol! : 0,
    marketCapUsd: over.marketCapUsd ?? null,
  };
}

describe("computeHoldingsQuality", () => {
  it("returns unavailable when holdings are unverified", () => {
    const q = computeHoldingsQuality([pos()], false, 1, NOW);
    expect(q.positions).toHaveLength(0);
    expect(q.limitations.join(" ")).toMatch(/could not be verified/i);
  });

  it("flags an oversized dominant position", () => {
    const q = computeHoldingsQuality(
      [
        pos({ tokenMint: "BIG", currentValueSol: 9 }),
        pos({ tokenMint: "SMALL", currentValueSol: 1 }),
      ],
      true,
      1,
      NOW,
    );
    const big = q.positions.find((p) => p.tokenMint === "BIG")!;
    expect(big.classification).toBe("oversized");
    expect(q.concentrationPercent).toBeCloseTo(90, 1);
  });

  it("marks dust and unpriced positions", () => {
    const q = computeHoldingsQuality(
      [
        pos({ tokenMint: "DUST", currentValueSol: 0.001 }),
        pos({ tokenMint: "NOPRICE", currentValueSol: null }),
        pos({ tokenMint: "REAL", currentValueSol: 5 }),
      ],
      true,
      1,
      NOW,
    );
    expect(q.positions.find((p) => p.tokenMint === "DUST")!.classification).toBe("dust");
    expect(q.positions.find((p) => p.tokenMint === "NOPRICE")!.classification).toBe("unpriced");
  });

  it("tags recently opened and long held positions", () => {
    const q = computeHoldingsQuality(
      [
        pos({ tokenMint: "NEW", firstAcquiredAt: NOW - 3600, currentValueSol: 3 }),
        pos({ tokenMint: "OLD", firstAcquiredAt: NOW - 60 * 86400, currentValueSol: 3 }),
      ],
      true,
      1,
      NOW,
    );
    expect(q.positions.find((p) => p.tokenMint === "NEW")!.tags).toContain("recently_opened");
    expect(q.positions.find((p) => p.tokenMint === "OLD")!.tags).toContain("long_held");
  });

  it("flags high conviction from size vs historical median", () => {
    // A has a large cost basis (5x the historical median) but a modest current
    // share (~14%), so it is high-conviction rather than oversized.
    const q = computeHoldingsQuality(
      [
        pos({ tokenMint: "A", costBasisSol: 10, currentValueSol: 2 }),
        pos({ tokenMint: "B", costBasisSol: 1, currentValueSol: 4 }),
        pos({ tokenMint: "C", costBasisSol: 1, currentValueSol: 4 }),
        pos({ tokenMint: "D", costBasisSol: 1, currentValueSol: 4 }),
      ],
      true,
      2, // historical median entry 2 SOL -> A cost basis is 5x
      NOW,
    );
    expect(q.positions.find((p) => p.tokenMint === "A")!.classification).toBe("high_conviction");
  });

  it("marks liquidity coverage as unavailable", () => {
    const q = computeHoldingsQuality([pos({ currentValueSol: 5 })], true, 1, NOW);
    const liq = q.dimensions.find((d) => d.key === "liquidity_coverage")!;
    expect(liq.available).toBe(false);
    expect(liq.value).toBeNull();
  });
});
