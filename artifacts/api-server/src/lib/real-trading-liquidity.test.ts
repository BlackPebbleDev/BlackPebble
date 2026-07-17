import { describe, it, expect } from "vitest";
import {
  classifyLiquidityBand,
  classifyExitability,
  classifyHoldingLiquidity,
  computeCurrentLiquidityRisk,
} from "./real-trading-liquidity.js";

describe("classifyLiquidityBand", () => {
  it("bands by absolute USD liquidity", () => {
    expect(classifyLiquidityBand(500_000)).toBe("deep");
    expect(classifyLiquidityBand(80_000)).toBe("adequate");
    expect(classifyLiquidityBand(20_000)).toBe("thin");
    expect(classifyLiquidityBand(2_000)).toBe("fragile");
    expect(classifyLiquidityBand(null)).toBe("unavailable");
    expect(classifyLiquidityBand(0)).toBe("unavailable");
  });
});

describe("classifyExitability", () => {
  it("classifies from holding-to-liquidity ratio", () => {
    expect(classifyExitability(0.5)).toBe("easy");
    expect(classifyExitability(3)).toBe("moderate");
    expect(classifyExitability(10)).toBe("difficult");
    expect(classifyExitability(30)).toBe("severe");
    expect(classifyExitability(null)).toBe("unknown");
  });
});

describe("classifyHoldingLiquidity", () => {
  it("handles a deep, easily-exitable holding", () => {
    const h = classifyHoldingLiquidity({ mint: "A", symbol: "A", holdingValueUsd: 500, liquidityUsd: 500_000 });
    expect(h.band).toBe("deep");
    expect(h.exitability).toBe("easy");
    expect(h.unpriced).toBe(false);
    expect(h.missingLiquidity).toBe(false);
  });

  it("flags unpriced holdings", () => {
    const h = classifyHoldingLiquidity({ mint: "A", symbol: null, holdingValueUsd: null, liquidityUsd: 100_000 });
    expect(h.unpriced).toBe(true);
    expect(h.holdingToLiquidityPct).toBeNull();
    expect(h.limitations.length).toBeGreaterThan(0);
  });

  it("flags missing liquidity", () => {
    const h = classifyHoldingLiquidity({ mint: "A", symbol: "A", holdingValueUsd: 100, liquidityUsd: null });
    expect(h.band).toBe("unavailable");
    expect(h.missingLiquidity).toBe(true);
  });

  it("flags a large holding versus a thin pool", () => {
    const h = classifyHoldingLiquidity({ mint: "A", symbol: "A", holdingValueUsd: 5_000, liquidityUsd: 20_000 });
    expect(h.band).toBe("thin");
    expect(h.exitability).toBe("severe");
  });
});

describe("computeCurrentLiquidityRisk", () => {
  it("returns insufficient confidence with no holdings", () => {
    const s = computeCurrentLiquidityRisk([]);
    expect(s.confidence).toBe("insufficient");
    expect(s.positions).toHaveLength(0);
    expect(s.scope).toBe("current");
  });

  it("aggregates weighted quality and coverage", () => {
    const s = computeCurrentLiquidityRisk([
      { mint: "A", symbol: "A", holdingValueUsd: 1000, liquidityUsd: 500_000 },
      { mint: "B", symbol: "B", holdingValueUsd: 1000, liquidityUsd: 2_000 },
      { mint: "C", symbol: "C", holdingValueUsd: 500, liquidityUsd: null },
    ]);
    expect(s.positions).toHaveLength(3);
    expect(s.weightedLiquidityQuality).not.toBeNull();
    expect(s.fragilePositionsCount).toBe(1);
    expect(s.unavailablePositionsCount).toBe(1);
    expect(s.liquidityCoverage).toBeCloseTo(2 / 3, 6);
  });
});
