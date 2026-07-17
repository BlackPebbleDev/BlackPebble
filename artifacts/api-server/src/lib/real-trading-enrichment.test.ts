import { describe, it, expect } from "vitest";
import {
  computeQualityFromCandles,
  intervalForHold,
  windowForTrip,
} from "./real-trading-enrichment.js";
import { reconstructRoundTrips } from "./real-trading-roundtrips.js";
import type { ParsedSwapEvent } from "./real-trading-math.js";
import type { HistoricalCandle, CandleInterval } from "./market-data/types.js";

function trip(entryTime: number, exitTime: number) {
  const events: ParsedSwapEvent[] = [
    { signature: "b1", blockTime: entryTime, tokenMint: "A", side: "buy", tokenAmount: 100, solAmount: 1, dexSource: null },
    { signature: "s1", blockTime: exitTime, tokenMint: "A", side: "sell", tokenAmount: 100, solAmount: 1.5, dexSource: null },
  ];
  return reconstructRoundTrips(events).closed[0]!;
}

function candles(startT: number, count: number, stepSec: number, priceFn: (i: number) => number, interval: CandleInterval = "5m"): HistoricalCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const c = priceFn(i);
    return { timestamp: startT + i * stepSec, open: c, high: c * 1.02, low: c * 0.98, close: c, volumeUsd: 100, source: "test", interval, confidence: "high" as const };
  });
}

describe("intervalForHold", () => {
  it("picks finer intervals for shorter holds", () => {
    expect(intervalForHold(600)).toBe("5m");
    expect(intervalForHold(2 * 3600)).toBe("15m");
    expect(intervalForHold(2 * 86400)).toBe("1h");
    expect(intervalForHold(30 * 86400)).toBe("4h");
  });
});

describe("windowForTrip", () => {
  it("spans 1h before entry to 4h after exit", () => {
    const t = trip(100000, 103600);
    const w = windowForTrip(t);
    expect(w.start).toBe(100000 - 3600);
    expect(w.end).toBe(103600 + 4 * 3600);
  });
});

describe("computeQualityFromCandles", () => {
  it("reports insufficient_data with no trips", () => {
    const r = computeQualityFromCandles([], new Map(), "high", "test");
    expect(r.status).toBe("insufficient_data");
    expect(r.eligibleTrades).toBe(0);
  });

  it("reports processing when no candles are cached", () => {
    const t = trip(100000, 103600);
    const r = computeQualityFromCandles([t], new Map(), "medium", "test");
    expect(r.status).toBe("processing");
    expect(r.entrySummary.analyzedEntries).toBe(0);
  });

  it("reports ready when all trips have candles", () => {
    const t = trip(100000, 103600);
    const grid = candles(100000 - 3600, 120, 300, (i) => 10 + i * 0.1);
    const map = new Map([[t.roundTripId, grid]]);
    const r = computeQualityFromCandles([t], map, "high", "test");
    expect(r.status).toBe("ready");
    expect(r.entrySummary.analyzedEntries).toBe(1);
    expect(r.exitSummary.analyzedExits).toBe(1);
  });

  it("reports partial when only some trips have candles", () => {
    const t1 = trip(100000, 103600);
    const t2 = trip(200000, 203600);
    const grid = candles(100000 - 3600, 120, 300, (i) => 10 + i * 0.1);
    const map = new Map([[t1.roundTripId, grid]]);
    const r = computeQualityFromCandles([t1, t2], map, "high", "test");
    expect(r.status).toBe("partial");
  });
});
