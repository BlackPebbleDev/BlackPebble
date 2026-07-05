import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_BUFFER,
  computeLiquidation,
  computeRealizedPnl,
  directionalMovePercent,
  exitOrderTriggered,
  isLeverageDirection,
  isLiquidated,
  movePercentFrom,
  validateTrigger,
} from "./leverage-math";

describe("computeLiquidation", () => {
  it("puts a long's liquidation below entry by 1/lev − buffer", () => {
    const { liqMovePercent, liqPriceSol } = computeLiquidation(100, 5, "long");
    expect(liqMovePercent).toBeCloseTo(0.2 - MAINTENANCE_BUFFER, 10);
    expect(liqPriceSol).toBeCloseTo(100 * (1 - (0.2 - MAINTENANCE_BUFFER)), 10);
    expect(liqPriceSol).toBeLessThan(100);
  });

  it("puts a short's liquidation above entry by the same fraction", () => {
    const { liqPriceSol } = computeLiquidation(100, 5, "short");
    expect(liqPriceSol).toBeCloseTo(100 * (1 + (0.2 - MAINTENANCE_BUFFER)), 10);
    expect(liqPriceSol).toBeGreaterThan(100);
  });

  it("liquidates earlier at higher leverage", () => {
    const l2 = computeLiquidation(100, 2, "long").liqPriceSol;
    const l20 = computeLiquidation(100, 20, "long").liqPriceSol;
    expect(l20).toBeGreaterThan(l2); // 20x liquidates on a much smaller drop
  });
});

describe("directionalMovePercent", () => {
  it("long: profits when price rises", () => {
    expect(directionalMovePercent("long", 100, 120)).toBeCloseTo(0.2, 10);
    expect(directionalMovePercent("long", 100, 80)).toBeCloseTo(-0.2, 10);
  });

  it("short: profits when price falls", () => {
    expect(directionalMovePercent("short", 100, 80)).toBeCloseTo(0.2, 10);
    expect(directionalMovePercent("short", 100, 120)).toBeCloseTo(-0.2, 10);
  });

  it("returns 0 on a non-positive entry (no NaN/Infinity)", () => {
    expect(directionalMovePercent("long", 0, 100)).toBe(0);
  });
});

describe("movePercentFrom", () => {
  it("prefers market cap over SOL price", () => {
    // MC +50% but SOL price flat - MC wins.
    expect(movePercentFrom("long", 1_000_000, 1_500_000, 1, 1)).toBeCloseTo(0.5, 10);
  });

  it("falls back to SOL price when MC is missing", () => {
    expect(movePercentFrom("long", null, null, 2, 3)).toBeCloseTo(0.5, 10);
    expect(movePercentFrom("short", null, null, 2, 1)).toBeCloseTo(0.5, 10);
  });

  it("returns null when neither basis is available", () => {
    expect(movePercentFrom("long", null, null, 0, null)).toBeNull();
  });
});

describe("computeRealizedPnl", () => {
  it("computes profit on the closed notional", () => {
    // 10 SOL notional slice, +20% move, 2 SOL margin slice → +2 SOL, credit 4.
    const r = computeRealizedPnl(10, 0.2, 2);
    expect(r.realizedPnlSol).toBeCloseTo(2, 10);
    expect(r.creditSol).toBeCloseTo(4, 10);
  });

  it("caps the loss at the slice's margin (equity never negative)", () => {
    // −50% on 10 SOL notional would be −5, but margin is only 2.
    const r = computeRealizedPnl(10, -0.5, 2);
    expect(r.realizedPnlSol).toBeCloseTo(-2, 10);
    expect(r.creditSol).toBe(0);
  });

  it("never returns a negative credit", () => {
    const r = computeRealizedPnl(100, -0.9999, 1);
    expect(r.creditSol).toBeGreaterThanOrEqual(0);
  });
});

describe("isLiquidated", () => {
  it("long liquidates when MC falls to/through the level", () => {
    expect(isLiquidated("long", 800_000, 800_000, 1, 0.5)).toBe(true);
    expect(isLiquidated("long", 799_999, 800_000, 1, 0.5)).toBe(true);
    expect(isLiquidated("long", 900_000, 800_000, 1, 0.5)).toBe(false);
  });

  it("short liquidates when MC rises to/through the level", () => {
    expect(isLiquidated("short", 1_200_000, 1_200_000, 1, 2)).toBe(true);
    expect(isLiquidated("short", 1_300_000, 1_200_000, 1, 2)).toBe(true);
    expect(isLiquidated("short", 1_100_000, 1_200_000, 1, 2)).toBe(false);
  });

  it("falls back to SOL price only when MC is unavailable", () => {
    // MC present and safe → no liquidation even if SOL price crossed.
    expect(isLiquidated("long", 900_000, 800_000, 0.4, 0.5)).toBe(false);
    // MC missing → price basis decides.
    expect(isLiquidated("long", null, 800_000, 0.4, 0.5)).toBe(true);
    expect(isLiquidated("short", null, null, 2.5, 2)).toBe(true);
  });
});

describe("exitOrderTriggered", () => {
  it("long: TP fires on a rise, SL fires on a fall", () => {
    expect(exitOrderTriggered("long", "take_profit", 2_000_000, 2_000_000)).toBe(true);
    expect(exitOrderTriggered("long", "take_profit", 1_900_000, 2_000_000)).toBe(false);
    expect(exitOrderTriggered("long", "stop_loss", 600_000, 600_000)).toBe(true);
    expect(exitOrderTriggered("long", "stop_loss", 700_000, 600_000)).toBe(false);
  });

  it("short: TP fires on a fall, SL fires on a rise (mirrored)", () => {
    expect(exitOrderTriggered("short", "take_profit", 500_000, 600_000)).toBe(true);
    expect(exitOrderTriggered("short", "take_profit", 700_000, 600_000)).toBe(false);
    expect(exitOrderTriggered("short", "stop_loss", 1_300_000, 1_200_000)).toBe(true);
    expect(exitOrderTriggered("short", "stop_loss", 1_100_000, 1_200_000)).toBe(false);
  });
});

describe("validateTrigger", () => {
  const entryMc = 1_000_000;

  it("long: TP must be above entry, SL between liq and entry", () => {
    const liqMc = 800_000;
    expect(validateTrigger("long", "take_profit", 1_500_000, entryMc, liqMc)).toBeNull();
    expect(validateTrigger("long", "take_profit", 900_000, entryMc, liqMc)).toMatch(/above/);
    expect(validateTrigger("long", "stop_loss", 900_000, entryMc, liqMc)).toBeNull();
    expect(validateTrigger("long", "stop_loss", 1_100_000, entryMc, liqMc)).toMatch(/below/);
    expect(validateTrigger("long", "stop_loss", 700_000, entryMc, liqMc)).toMatch(/liquidation/);
  });

  it("short: TP must be below entry, SL between entry and liq above", () => {
    const liqMc = 1_200_000;
    expect(validateTrigger("short", "take_profit", 700_000, entryMc, liqMc)).toBeNull();
    expect(validateTrigger("short", "take_profit", 1_100_000, entryMc, liqMc)).toMatch(/below/);
    expect(validateTrigger("short", "stop_loss", 1_100_000, entryMc, liqMc)).toBeNull();
    expect(validateTrigger("short", "stop_loss", 900_000, entryMc, liqMc)).toMatch(/above/);
    expect(validateTrigger("short", "stop_loss", 1_300_000, entryMc, liqMc)).toMatch(/liquidation/);
  });

  it("passes when entry/liq MCs are unknown (server falls back gracefully)", () => {
    expect(validateTrigger("long", "take_profit", 1, null, null)).toBeNull();
    expect(validateTrigger("short", "stop_loss", 1, null, null)).toBeNull();
  });
});

describe("end-to-end scenarios (math level)", () => {
  it("long liquidation: 5x long loses full margin when MC drops 19.5%", () => {
    const entryMc = 1_000_000;
    const { liqPriceSol } = computeLiquidation(1, 5, "long");
    const liqMc = entryMc * liqPriceSol; // entry price 1 → factor is liqPriceSol
    expect(isLiquidated("long", liqMc, liqMc, liqPriceSol, liqPriceSol)).toBe(true);
    // Just above the level: still alive.
    expect(isLiquidated("long", liqMc * 1.001, liqMc, 1, liqPriceSol)).toBe(false);
  });

  it("short liquidation: 10x short liquidates when MC rises ~9.5%", () => {
    const entryMc = 1_000_000;
    const { liqPriceSol } = computeLiquidation(1, 10, "short");
    const liqMc = entryMc * liqPriceSol;
    expect(liqMc).toBeGreaterThan(entryMc);
    expect(isLiquidated("short", liqMc, liqMc, liqPriceSol, liqPriceSol)).toBe(true);
  });

  it("short profit: 2x short on a −30% move returns margin + 60% ROI", () => {
    const margin = 1;
    const notional = margin * 2;
    const move = movePercentFrom("short", 1_000_000, 700_000, 1, 0.7)!;
    const { realizedPnlSol, creditSol } = computeRealizedPnl(notional, move, margin);
    expect(realizedPnlSol).toBeCloseTo(0.6, 10);
    expect(creditSol).toBeCloseTo(1.6, 10);
  });

  it("partial closes conserve P&L: two 50% slices equal one full close", () => {
    const margin = 2;
    const notional = 10;
    const move = 0.25;
    const full = computeRealizedPnl(notional, move, margin);
    const half1 = computeRealizedPnl(notional / 2, move, margin / 2);
    const half2 = computeRealizedPnl(notional / 2, move, margin / 2);
    expect(half1.realizedPnlSol + half2.realizedPnlSol).toBeCloseTo(full.realizedPnlSol, 10);
    expect(half1.creditSol + half2.creditSol).toBeCloseTo(full.creditSol, 10);
  });
});

describe("isLeverageDirection", () => {
  it("accepts only long/short", () => {
    expect(isLeverageDirection("long")).toBe(true);
    expect(isLeverageDirection("short")).toBe(true);
    expect(isLeverageDirection("sideways")).toBe(false);
    expect(isLeverageDirection(undefined)).toBe(false);
  });
});
