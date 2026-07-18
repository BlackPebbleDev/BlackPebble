import { describe, it, expect } from "vitest";
import {
  marketCap,
  priceFromCap,
  computeFdv,
  computeImpact,
  computeSlippage,
  computeSlTp,
  computePositionSize,
  computeConcentration,
  bondingCurvePoint,
} from "./calc-math";

describe("marketCap", () => {
  it("multiplies price by circulating supply", () => {
    expect(marketCap(1, 10_000_000)).toBe(10_000_000);
    expect(marketCap(0.0005, 1_000_000_000)).toBeCloseTo(500_000, 6);
  });
  it("guards zero/invalid/negative", () => {
    expect(marketCap(0, 100)).toBe(0);
    expect(marketCap(-1, 100)).toBe(0);
    expect(marketCap(Number.NaN, 100)).toBe(0);
  });
  it("solves price from cap and supply", () => {
    expect(priceFromCap(1_000_000, 10_000_000)).toBeCloseTo(0.1, 9);
    expect(priceFromCap(1_000_000, 0)).toBe(0);
  });
});

describe("computeFdv", () => {
  it("computes cap, fdv, circulating pct and gap", () => {
    const r = computeFdv({ price: 1, circulatingSupply: 200, totalSupply: 1000 });
    expect(r.marketCap).toBe(200);
    expect(r.fdv).toBe(1000);
    expect(r.circulatingPct).toBeCloseTo(20, 6);
    expect(r.valuationGap).toBe(800);
    expect(r.lockedSupply).toBe(800);
    expect(r.lockedPct).toBeCloseTo(80, 6);
  });
  it("clamps total supply to at least circulating", () => {
    const r = computeFdv({ price: 2, circulatingSupply: 500, totalSupply: 100 });
    expect(r.fdv).toBe(1000);
    expect(r.circulatingPct).toBe(100);
    expect(r.lockedSupply).toBe(0);
  });
  it("handles zero supply", () => {
    const r = computeFdv({ price: 1, circulatingSupply: 0, totalSupply: 0 });
    expect(r.marketCap).toBe(0);
    expect(r.circulatingPct).toBe(0);
  });
});

describe("computeImpact", () => {
  it("buy impact grows with trade / liquidity", () => {
    const small = computeImpact({ liquidityUsd: 1_000_000, tradeSizeUsd: 1000, direction: "buy" });
    const big = computeImpact({ liquidityUsd: 1_000_000, tradeSizeUsd: 100_000, direction: "buy" });
    expect(big.priceImpactPct).toBeGreaterThan(small.priceImpactPct);
    // buy impact = 2*trade/liquidity (%) for this simplified model
    expect(small.priceImpactPct).toBeCloseTo(0.2, 6);
    expect(small.pctOfLiquidity).toBeCloseTo(0.1, 6);
  });
  it("thin pools move more than deep pools", () => {
    const deep = computeImpact({ liquidityUsd: 5_000_000, tradeSizeUsd: 10_000, direction: "buy" });
    const thin = computeImpact({ liquidityUsd: 50_000, tradeSizeUsd: 10_000, direction: "buy" });
    expect(thin.priceImpactPct).toBeGreaterThan(deep.priceImpactPct);
  });
  it("sell impact is bounded and positive", () => {
    const r = computeImpact({ liquidityUsd: 100_000, tradeSizeUsd: 50_000, direction: "sell" });
    expect(r.priceImpactPct).toBeGreaterThan(0);
    expect(r.executedPriceRatio).toBeLessThan(1);
  });
  it("guards zero liquidity/trade", () => {
    expect(computeImpact({ liquidityUsd: 0, tradeSizeUsd: 100, direction: "buy" }).priceImpactPct).toBe(0);
    expect(computeImpact({ liquidityUsd: 100, tradeSizeUsd: 0, direction: "buy" }).priceImpactPct).toBe(0);
  });
});

describe("computeSlippage", () => {
  it("flags trades exceeding tolerance", () => {
    const r = computeSlippage({
      expectedPrice: 1,
      tradeSizeUsd: 100_000,
      liquidityUsd: 200_000,
      tolerancePct: 1,
      direction: "buy",
    });
    expect(r.exceedsTolerance).toBe(true);
    expect(r.estimatedExecutedPrice).toBeGreaterThan(1);
  });
  it("passes comfortable trades", () => {
    const r = computeSlippage({
      expectedPrice: 1,
      tradeSizeUsd: 100,
      liquidityUsd: 1_000_000,
      tolerancePct: 5,
      direction: "buy",
    });
    expect(r.exceedsTolerance).toBe(false);
  });
});

describe("computeSlTp", () => {
  it("computes downside, upside, and R:R", () => {
    const r = computeSlTp({ entry: 100, stop: 90, target: 130 });
    expect(r.downsidePct).toBeCloseTo(10, 6);
    expect(r.upsidePct).toBeCloseTo(30, 6);
    expect(r.riskRewardRatio).toBeCloseTo(3, 6);
    expect(r.valid).toBe(true);
  });
  it("marks invalid arrangements", () => {
    const r = computeSlTp({ entry: 100, stop: 110, target: 90 });
    expect(r.valid).toBe(false);
  });
  it("guards zero entry", () => {
    const r = computeSlTp({ entry: 0, stop: 0, target: 0 });
    expect(r.riskRewardRatio).toBeNull();
  });
});

describe("computePositionSize", () => {
  it("sizes by risk and stop distance", () => {
    const r = computePositionSize({ accountBalance: 10_000, riskPct: 1, entry: 100, stop: 95 });
    expect(r.riskAmount).toBeCloseTo(100, 6);
    expect(r.stopDistancePct).toBeCloseTo(5, 6);
    expect(r.positionSize).toBeCloseTo(2000, 6);
    expect(r.tokenQuantity).toBeCloseTo(20, 6);
    expect(r.lossAtStop).toBeCloseTo(100, 6);
    expect(r.valid).toBe(true);
  });
  it("returns zero position for invalid stop", () => {
    const r = computePositionSize({ accountBalance: 10_000, riskPct: 1, entry: 100, stop: 100 });
    expect(r.positionSize).toBe(0);
    expect(r.valid).toBe(false);
  });
});

describe("computeConcentration", () => {
  it("computes top holder, top10 and band", () => {
    const r = computeConcentration([50, 10, 5, 5, 5, 5, 5, 5, 5, 5]);
    expect(r.topHolderPct).toBeCloseTo(50, 6);
    expect(r.band).toBe("highly-concentrated");
  });
  it("recognizes distributed supply", () => {
    const r = computeConcentration(Array.from({ length: 50 }, () => 2));
    expect(r.topHolderPct).toBeLessThan(15);
    expect(r.band).toBe("distributed");
  });
  it("guards empty/zero input", () => {
    expect(computeConcentration([]).band).toBe("distributed");
    expect(computeConcentration([0, 0]).topHolderPct).toBe(0);
  });
});

describe("bondingCurvePoint", () => {
  it("price rises linearly with supply", () => {
    const early = bondingCurvePoint({ basePrice: 1, slope: 0.001, supplySold: 100 });
    const late = bondingCurvePoint({ basePrice: 1, slope: 0.001, supplySold: 1000 });
    expect(late.price).toBeGreaterThan(early.price);
    expect(early.price).toBeCloseTo(1.1, 6);
  });
  it("cumulative cost is the area under the line", () => {
    const p = bondingCurvePoint({ basePrice: 1, slope: 0, supplySold: 100 });
    expect(p.cumulativeCost).toBeCloseTo(100, 6);
    expect(p.averagePrice).toBeCloseTo(1, 6);
  });
  it("handles zero supply", () => {
    const p = bondingCurvePoint({ basePrice: 2, slope: 1, supplySold: 0 });
    expect(p.cumulativeCost).toBe(0);
    expect(p.averagePrice).toBe(2);
  });
});
