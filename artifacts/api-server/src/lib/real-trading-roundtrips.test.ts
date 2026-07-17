import { describe, it, expect } from "vitest";
import { reconstructRoundTrips } from "./real-trading-roundtrips.js";
import { matchFifo, type ParsedSwapEvent } from "./real-trading-math.js";

function ev(
  side: "buy" | "sell",
  mint: string,
  tokenAmount: number,
  solAmount: number,
  blockTime: number,
  sig = `${side}-${mint}-${blockTime}`,
): ParsedSwapEvent {
  return { signature: sig, blockTime, tokenMint: mint, side, tokenAmount, solAmount, dexSource: "raydium" };
}

describe("reconstructRoundTrips", () => {
  it("handles one buy, one sell with stable ids and correct P&L", () => {
    const events = [ev("buy", "A", 100, 1, 1000), ev("sell", "A", 100, 1.5, 2000)];
    const { closed, open } = reconstructRoundTrips(events);
    expect(open).toHaveLength(0);
    expect(closed).toHaveLength(1);
    const t = closed[0]!;
    expect(t.realizedPnlSol).toBeCloseTo(0.5, 9);
    expect(t.roiPercent).toBeCloseTo(50, 6);
    expect(t.entryExecutions).toHaveLength(1);
    expect(t.exitExecutions).toHaveLength(1);
    expect(t.exitExecutions[0]!.closesPosition).toBe(true);
    expect(t.outcome).toBe("win");
    expect(t.roundTripId).toMatch(/^rt_/);
    expect(t.entryExecutions[0]!.executionId).toMatch(/^ex_/);
    // Deterministic id.
    const again = reconstructRoundTrips(events).closed[0]!;
    expect(again.roundTripId).toBe(t.roundTripId);
  });

  it("handles multiple buys then one sell (weighted entry)", () => {
    const events = [
      ev("buy", "A", 100, 1, 1000),
      ev("buy", "A", 100, 3, 2000),
      ev("sell", "A", 200, 6, 3000),
    ];
    const { closed } = reconstructRoundTrips(events);
    expect(closed).toHaveLength(1);
    const t = closed[0]!;
    expect(t.entryExecutions).toHaveLength(2);
    expect(t.costBasisSol).toBeCloseTo(4, 9);
    expect(t.realizedPnlSol).toBeCloseTo(2, 9);
    expect(t.avgEntryPriceSol).toBeCloseTo(4 / 200, 9);
    expect(t.isComplex).toBe(true);
  });

  it("handles one buy, multiple partial sells", () => {
    const events = [
      ev("buy", "A", 100, 2, 1000),
      ev("sell", "A", 40, 1, 2000),
      ev("sell", "A", 60, 2, 3000),
    ];
    const { closed } = reconstructRoundTrips(events);
    expect(closed).toHaveLength(1);
    const t = closed[0]!;
    expect(t.exitExecutions).toHaveLength(2);
    expect(t.exitExecutions[0]!.closesPosition).toBe(false);
    expect(t.exitExecutions[1]!.closesPosition).toBe(true);
    // proceeds 3, cost 2 => pnl 1
    expect(t.realizedPnlSol).toBeCloseTo(1, 9);
  });

  it("treats re-entry after full exit as a new trip", () => {
    const events = [
      ev("buy", "A", 100, 1, 1000),
      ev("sell", "A", 100, 2, 2000),
      ev("buy", "A", 50, 1, 3000),
      ev("sell", "A", 50, 0.5, 4000),
    ];
    const { closed } = reconstructRoundTrips(events);
    expect(closed).toHaveLength(2);
    expect(closed[0]!.realizedPnlSol).toBeCloseTo(1, 9);
    expect(closed[1]!.realizedPnlSol).toBeCloseTo(-0.5, 9);
    expect(closed[0]!.roundTripId).not.toBe(closed[1]!.roundTripId);
  });

  it("keeps a partially-sold position open", () => {
    const events = [ev("buy", "A", 100, 2, 1000), ev("sell", "A", 40, 1, 2000)];
    const { closed, open } = reconstructRoundTrips(events);
    expect(closed).toHaveLength(0);
    expect(open).toHaveLength(1);
    expect(open[0]!.remainingTokenAmount).toBeCloseTo(60, 9);
    expect(open[0]!.closed).toBe(false);
    expect(open[0]!.outcome).toBeNull();
  });

  it("skips a sell with no matching open lots (transfer-in)", () => {
    const events = [ev("sell", "A", 100, 1, 1000)];
    const { closed, open } = reconstructRoundTrips(events);
    expect(closed).toHaveLength(0);
    expect(open).toHaveLength(0);
  });

  it("produces the same total realized P&L as legacy matchFifo", () => {
    const events = [
      ev("buy", "A", 100, 1, 1000),
      ev("buy", "A", 100, 3, 1500),
      ev("sell", "A", 150, 4, 2000),
      ev("buy", "B", 10, 5, 2100),
      ev("sell", "B", 10, 3, 2200),
      ev("sell", "A", 50, 1, 2300),
    ];
    const legacy = matchFifo(events);
    const legacyTotal = legacy.closed.reduce((s, c) => s + c.realizedPnlSol, 0);
    const recon = reconstructRoundTrips(events);
    const reconTotal = recon.closed.reduce((s, c) => s + c.realizedPnlSol, 0);
    expect(reconTotal).toBeCloseTo(legacyTotal, 9);
  });
});
