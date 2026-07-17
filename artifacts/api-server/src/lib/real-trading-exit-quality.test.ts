import { describe, it, expect } from "vitest";
import {
  analyzeExit,
  scoreExit,
  summarizeExitQuality,
} from "./real-trading-exit-quality.js";
import { reconstructRoundTrips } from "./real-trading-roundtrips.js";
import type { ParsedSwapEvent } from "./real-trading-math.js";
import type { HistoricalCandle, CandleInterval } from "./market-data/types.js";

function trip(entryTime: number, exitTime: number, buySol = 1, sellSol = 1.5) {
  const events: ParsedSwapEvent[] = [
    { signature: "b1", blockTime: entryTime, tokenMint: "A", side: "buy", tokenAmount: 100, solAmount: buySol, dexSource: null },
    { signature: "s1", blockTime: exitTime, tokenMint: "A", side: "sell", tokenAmount: 100, solAmount: sellSol, dexSource: null },
  ];
  return reconstructRoundTrips(events).closed[0]!;
}

function candles(
  startT: number,
  count: number,
  stepSec: number,
  priceFn: (i: number) => number,
  interval: CandleInterval = "5m",
): HistoricalCandle[] {
  const out: HistoricalCandle[] = [];
  for (let i = 0; i < count; i++) {
    const c = priceFn(i);
    out.push({
      timestamp: startT + i * stepSec,
      open: c,
      high: c * 1.01,
      low: c * 0.99,
      close: c,
      volumeUsd: 500,
      source: "test",
      interval,
      confidence: "high",
    });
  }
  return out;
}

describe("scoreExit", () => {
  it("rewards capturing the move and avoiding downside", () => {
    const strong = scoreExit(90, 30, 0);
    const weak = scoreExit(10, 0, 40);
    expect(strong).toBeGreaterThan(weak);
  });
});

describe("analyzeExit", () => {
  const entryTime = 200_000;
  const exitTime = entryTime + 3600;

  it("returns insufficient_data without candles and is always hindsight", () => {
    const e = analyzeExit(trip(entryTime, exitTime), [], "test");
    expect(e.exitPattern).toBe("insufficient_data");
    expect(e.score).toBeNull();
    expect(e.hindsight).toBe(true);
  });

  it("flags missed upside when price keeps rising after exit", () => {
    const grid = candles(entryTime - 600, 60, 300, (i) => 10 + i * 0.5);
    const e = analyzeExit(trip(entryTime, exitTime), grid, "test");
    expect(e.missedUpsidePercent!).toBeGreaterThan(0);
    expect(e.exitPattern).toBe("before_further_upside");
  });

  it("flags avoided downside when price falls after exit", () => {
    const grid = candles(entryTime - 600, 60, 300, (i) => {
      const t = (entryTime - 600) + i * 300;
      return t <= exitTime ? 20 : 20 - (t - exitTime) / 300; // drop after exit
    });
    const e = analyzeExit(trip(entryTime, exitTime), grid, "test");
    expect(e.avoidedDownsidePercent!).toBeGreaterThan(0);
  });

  it("always includes a hindsight limitation", () => {
    const grid = candles(entryTime - 600, 60, 300, () => 5);
    const e = analyzeExit(trip(entryTime, exitTime), grid, "test");
    expect(e.limitations.some((l) => /hindsight/i.test(l))).toBe(true);
  });
});

describe("summarizeExitQuality", () => {
  it("is unavailable with no evidence and carries hindsight limitation", () => {
    const s = summarizeExitQuality(4, [], "high");
    expect(s.analyzedExits).toBe(0);
    expect(s.confidence).toBe("insufficient");
    expect(s.limitations.some((l) => /hindsight/i.test(l))).toBe(true);
  });
});
