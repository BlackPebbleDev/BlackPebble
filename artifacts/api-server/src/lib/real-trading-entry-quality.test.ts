import { describe, it, expect } from "vitest";
import {
  analyzeEntry,
  scoreEntry,
  summarizeEntryQuality,
} from "./real-trading-entry-quality.js";
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

/** Build a flat grid of candles with per-timestamp close overrides. */
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
      high: c * 1.02,
      low: c * 0.98,
      close: c,
      volumeUsd: 1000,
      source: "test",
      interval,
      confidence: "high",
    });
  }
  return out;
}

describe("scoreEntry", () => {
  it("rewards positive follow-through and low drawdown", () => {
    const good = scoreEntry(20, 30, -2);
    const bad = scoreEntry(-20, 2, -30);
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeGreaterThanOrEqual(0);
    expect(good).toBeLessThanOrEqual(100);
  });

  it("penalizes immediate adverse move", () => {
    const noAdverse = scoreEntry(0, 0, 0);
    const adverse = scoreEntry(0, 0, -40);
    expect(adverse).toBeLessThan(noAdverse);
  });
});

describe("analyzeEntry", () => {
  const entryTime = 100_000;
  const exitTime = entryTime + 3600;

  it("returns insufficient_data with no candles", () => {
    const e = analyzeEntry(trip(entryTime, exitTime), [], "test");
    expect(e.entryPattern).toBe("insufficient_data");
    expect(e.score).toBeNull();
    expect(e.confidence).toBe("insufficient");
    expect(e.limitations.length).toBeGreaterThan(0);
  });

  it("detects a run-up entry (bought after rise)", () => {
    // Prices rise into entry: pre-1h much lower than entry.
    const grid = candles(entryTime - 3600, 60, 300, (i) => 1 + i * 0.05);
    const e = analyzeEntry(trip(entryTime, exitTime), grid, "test");
    expect(e.entryPattern).toBe("rapid_rise");
    expect(e.preEntryReturn1h).not.toBeNull();
    expect(e.preEntryReturn1h!).toBeGreaterThan(0);
  });

  it("detects a pullback entry (bought into a dip)", () => {
    // Prices fall into entry.
    const grid = candles(entryTime - 3600, 80, 300, (i) => 100 - i * 1.0);
    const e = analyzeEntry(trip(entryTime, exitTime), grid, "test");
    expect(["pullback", "breakdown"]).toContain(e.entryPattern);
    expect(e.preEntryReturn1h!).toBeLessThan(0);
  });

  it("detects consolidation (flat before entry)", () => {
    const grid = candles(entryTime - 3600, 80, 300, () => 50);
    const e = analyzeEntry(trip(entryTime, exitTime), grid, "test");
    expect(e.entryPattern).toBe("consolidation");
  });

  it("computes MFE/MAE after entry", () => {
    // Flat until entry, then spike up then dip.
    const grid = candles(entryTime - 600, 40, 300, (i) => (i < 2 ? 10 : i < 6 ? 15 : 8));
    const e = analyzeEntry(trip(entryTime, entryTime + 3600), grid, "test");
    expect(e.mfePercent!).toBeGreaterThan(0);
    expect(e.maePercent!).toBeLessThan(0);
  });
});

describe("summarizeEntryQuality", () => {
  it("reports coverage and unavailable when nothing analyzed", () => {
    const s = summarizeEntryQuality(3, [], "high");
    expect(s.analyzedEntries).toBe(0);
    expect(s.coveragePercent).toBe(0);
    expect(s.confidence).toBe("insufficient");
    expect(s.avgEntryScore).toBeNull();
  });

  it("aggregates analyzed entries", () => {
    const grid = candles(50_000, 80, 300, (i) => 10 + i * 0.2);
    const e1 = analyzeEntry(trip(60_000, 63_600), grid, "test");
    const e2 = analyzeEntry(trip(61_000, 64_600), grid, "test");
    const s = summarizeEntryQuality(2, [e1, e2], "medium");
    expect(s.analyzedEntries).toBeGreaterThan(0);
    expect(s.avgEntryScore).not.toBeNull();
  });
});
