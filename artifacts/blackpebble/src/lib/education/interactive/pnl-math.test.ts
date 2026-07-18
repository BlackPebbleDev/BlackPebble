import { describe, it, expect } from "vitest";
import {
  computePnl,
  sanitizePnlInputs,
  quantityFromInvestment,
} from "./pnl-math";

describe("pnl-math", () => {
  it("derives quantity from investment and entry price", () => {
    expect(quantityFromInvestment(1000, 0.02)).toBeCloseTo(50000, 6);
    expect(quantityFromInvestment(1000, 0)).toBe(0);
  });

  it("computes an all-unrealized holding (nothing sold)", () => {
    const r = computePnl({
      investment: undefined,
      entryPrice: 0.02,
      quantity: 50000,
      currentPrice: 0.05,
      exitPrice: 0.05,
      percentSold: 0,
      feePercent: 0,
      slippagePercent: 0,
    });
    expect(r.realizedPnl).toBeCloseTo(0, 6);
    expect(r.unrealizedPnl).toBeCloseTo(1500, 6);
    expect(r.combinedPnl).toBeCloseTo(1500, 6);
    expect(r.percentReturn).toBeCloseTo(150, 6);
  });

  it("computes a full exit (one buy, one sell)", () => {
    const r = computePnl({
      entryPrice: 0.02,
      quantity: 50000,
      currentPrice: 0.05,
      exitPrice: 0.05,
      percentSold: 100,
      feePercent: 0,
      slippagePercent: 0,
    });
    expect(r.realizedPnl).toBeCloseTo(1500, 6);
    expect(r.unrealizedPnl).toBeCloseTo(0, 6);
    expect(r.remainingQuantity).toBeCloseTo(0, 6);
  });

  it("splits a partial exit consistently (combined = realized + unrealized)", () => {
    const r = computePnl({
      entryPrice: 0.02,
      quantity: 50000,
      currentPrice: 0.05,
      exitPrice: 0.05,
      percentSold: 50,
      feePercent: 0,
      slippagePercent: 0,
    });
    expect(r.realizedPnl).toBeCloseTo(750, 6);
    expect(r.unrealizedPnl).toBeCloseTo(750, 6);
    expect(r.combinedPnl).toBeCloseTo(r.realizedPnl + r.unrealizedPnl, 6);
  });

  it("applies fees on both sides", () => {
    const r = computePnl({
      entryPrice: 0.02,
      quantity: 50000,
      currentPrice: 0.05,
      exitPrice: 0.05,
      percentSold: 100,
      feePercent: 1,
      slippagePercent: 0,
    });
    expect(r.buyFees).toBeCloseTo(10, 6);
    expect(r.sellFees).toBeCloseTo(25, 6);
    expect(r.totalFees).toBeCloseTo(35, 6);
    expect(r.realizedPnl).toBeCloseTo(1465, 6);
    expect(r.percentReturn).toBeCloseTo(145.0495, 3);
  });

  it("applies slippage to the exit fill", () => {
    const noSlip = computePnl({
      entryPrice: 0.02,
      quantity: 50000,
      currentPrice: 0.05,
      exitPrice: 0.05,
      percentSold: 100,
      feePercent: 0,
      slippagePercent: 0,
    });
    const withSlip = computePnl({
      entryPrice: 0.02,
      quantity: 50000,
      currentPrice: 0.05,
      exitPrice: 0.05,
      percentSold: 100,
      feePercent: 0,
      slippagePercent: 10,
    });
    expect(withSlip.effectiveExitPrice).toBeCloseTo(0.045, 6);
    expect(withSlip.realizedPnl).toBeLessThan(noSlip.realizedPnl);
  });

  it("produces negative returns when price falls", () => {
    const r = computePnl({
      entryPrice: 0.05,
      quantity: 20000,
      currentPrice: 0.02,
      exitPrice: 0.02,
      percentSold: 0,
      feePercent: 0,
      slippagePercent: 0,
    });
    expect(r.combinedPnl).toBeLessThan(0);
    expect(r.percentReturn).toBeLessThan(0);
  });

  it("handles zero and invalid inputs without NaN", () => {
    const r = computePnl({
      entryPrice: 0,
      quantity: 0,
      currentPrice: Number.NaN,
      exitPrice: Number.POSITIVE_INFINITY,
      percentSold: 0,
      feePercent: 0,
      slippagePercent: 0,
    });
    for (const v of Object.values(r)) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(r.combinedPnl).toBe(0);
    expect(r.percentReturn).toBe(0);
  });

  it("clamps percentages and rejects negatives", () => {
    const s = sanitizePnlInputs({
      entryPrice: -5,
      quantity: -10,
      currentPrice: 1,
      exitPrice: 1,
      percentSold: 250,
      feePercent: -3,
      slippagePercent: 999,
    });
    expect(s.entryPrice).toBe(0);
    expect(s.quantity).toBe(0);
    expect(s.percentSold).toBe(100);
    expect(s.feePercent).toBe(0);
    expect(s.slippagePercent).toBe(100);
  });

  it("keeps decimal precision for tiny prices", () => {
    const r = computePnl({
      entryPrice: 0.0000012,
      quantity: 1_000_000,
      currentPrice: 0.0000024,
      exitPrice: 0.0000024,
      percentSold: 0,
      feePercent: 0,
      slippagePercent: 0,
    });
    expect(r.remainingValue).toBeCloseTo(2.4, 6);
    expect(r.unrealizedPnl).toBeCloseTo(1.2, 6);
  });
});
