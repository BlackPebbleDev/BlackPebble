import { describe, expect, it } from "vitest";
import type { ClosedRoundTrip, ParsedSwapEvent } from "./real-trading-math";
import {
  buildHoldBuckets,
  buildMonthlyActivity,
  buildPerformanceReport,
  buildPnlSeries,
  buildTokenPerformance,
} from "./real-trading-performance";

function trip(overrides: Partial<ClosedRoundTrip>): ClosedRoundTrip {
  return {
    tokenMint: "MintA",
    buyTime: 1000,
    sellTime: 2000,
    holdDurationSec: 1000,
    costBasisSol: 1,
    proceedsSol: 1.5,
    realizedPnlSol: 0.5,
    roiPercent: 50,
    ...overrides,
  };
}

function event(overrides: Partial<ParsedSwapEvent>): ParsedSwapEvent {
  return {
    signature: `sig-${Math.random()}`,
    blockTime: 1_700_000_000,
    tokenMint: "MintA",
    side: "buy",
    tokenAmount: 100,
    solAmount: 1,
    dexSource: null,
    ...overrides,
  };
}

describe("buildPnlSeries", () => {
  it("accumulates realized PnL ordered by sell time", () => {
    const series = buildPnlSeries([
      trip({ sellTime: 300, realizedPnlSol: -0.2 }),
      trip({ sellTime: 100, realizedPnlSol: 1 }),
      trip({ sellTime: 200, realizedPnlSol: 0.5 }),
    ]);
    expect(series.map((p) => p.t)).toEqual([100, 200, 300]);
    expect(series[0]!.cumRealizedPnlSol).toBeCloseTo(1);
    expect(series[1]!.cumRealizedPnlSol).toBeCloseTo(1.5);
    expect(series[2]!.cumRealizedPnlSol).toBeCloseTo(1.3);
  });

  it("downsamples long histories but keeps the final total", () => {
    const trips = Array.from({ length: 1000 }, (_, i) =>
      trip({ sellTime: i + 1, realizedPnlSol: 0.01 }),
    );
    const series = buildPnlSeries(trips);
    expect(series.length).toBeLessThanOrEqual(200);
    expect(series[series.length - 1]!.cumRealizedPnlSol).toBeCloseTo(10, 6);
    expect(series[series.length - 1]!.t).toBe(1000);
  });

  it("returns empty for no closed trips", () => {
    expect(buildPnlSeries([])).toEqual([]);
  });

  it("retains the peak and the largest drawdown when downsampling", () => {
    // 1000 tiny gains with one huge spike and one deep trough buried mid-series.
    const trips = Array.from({ length: 1000 }, (_, i) => {
      if (i === 400) return trip({ sellTime: i + 1, realizedPnlSol: 500 });
      if (i === 600) return trip({ sellTime: i + 1, realizedPnlSol: -900 });
      return trip({ sellTime: i + 1, realizedPnlSol: 0.01 });
    });
    const series = buildPnlSeries(trips);
    const values = series.map((p) => p.cumRealizedPnlSol);
    const max = Math.max(...values);
    const min = Math.min(...values);
    // The spike (~504) and the post-trough low must survive even sampling.
    expect(max).toBeGreaterThan(500);
    expect(min).toBeLessThan(-390);
    expect(series.length).toBeLessThanOrEqual(200);
  });
});

describe("buildMonthlyActivity", () => {
  it("groups buys and sells per UTC month with volume", () => {
    // 2024-01-15 and 2024-02-01 UTC
    const jan = Math.floor(Date.UTC(2024, 0, 15) / 1000);
    const feb = Math.floor(Date.UTC(2024, 1, 1) / 1000);
    const buckets = buildMonthlyActivity([
      event({ blockTime: jan, side: "buy", solAmount: 1 }),
      event({ blockTime: jan, side: "sell", solAmount: 2 }),
      event({ blockTime: feb, side: "buy", solAmount: 0.5 }),
    ]);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ month: "2024-01", buys: 1, sells: 1 });
    expect(buckets[0]!.volumeSol).toBeCloseTo(3);
    expect(buckets[1]).toMatchObject({ month: "2024-02", buys: 1, sells: 0 });
  });
});

describe("buildHoldBuckets", () => {
  it("places durations into the right buckets", () => {
    const buckets = buildHoldBuckets([
      trip({ holdDurationSec: 60 }), // <10m
      trip({ holdDurationSec: 1800 }), // 10–60m
      trip({ holdDurationSec: 5 * 3600 }), // 1–6h
      trip({ holdDurationSec: 2 * 86400 }), // 1–7d
      trip({ holdDurationSec: 30 * 86400 }), // >7d
    ]);
    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b.count]));
    expect(byLabel["<10m"]).toBe(1);
    expect(byLabel["10–60m"]).toBe(1);
    expect(byLabel["1–6h"]).toBe(1);
    expect(byLabel["6–24h"]).toBe(0);
    expect(byLabel["1–7d"]).toBe(1);
    expect(byLabel[">7d"]).toBe(1);
  });
});

describe("buildTokenPerformance", () => {
  it("aggregates PnL, cost and trips per mint with ROI", () => {
    const perf = buildTokenPerformance([
      trip({ tokenMint: "A", realizedPnlSol: 1, costBasisSol: 2 }),
      trip({ tokenMint: "A", realizedPnlSol: -0.5, costBasisSol: 1 }),
      trip({ tokenMint: "B", realizedPnlSol: -1, costBasisSol: 4 }),
    ]);
    const a = perf.find((p) => p.tokenMint === "A")!;
    const b = perf.find((p) => p.tokenMint === "B")!;
    expect(a.realizedPnlSol).toBeCloseTo(0.5);
    expect(a.roundTrips).toBe(2);
    expect(a.roiPercent).toBeCloseTo((0.5 / 3) * 100);
    expect(b.realizedPnlSol).toBeCloseTo(-1);
    expect(b.roiPercent).toBeCloseTo(-25);
  });
});

describe("buildPerformanceReport", () => {
  it("splits winners and losers and totals realized PnL", () => {
    const closed = [
      trip({ tokenMint: "WIN", realizedPnlSol: 2, costBasisSol: 1 }),
      trip({ tokenMint: "LOSE", realizedPnlSol: -1, costBasisSol: 2 }),
      trip({ tokenMint: "FLAT", realizedPnlSol: 0, costBasisSol: 1 }),
    ];
    const report = buildPerformanceReport([], closed);
    expect(report.topWinners.map((t) => t.tokenMint)).toEqual(["WIN"]);
    expect(report.topLosers.map((t) => t.tokenMint)).toEqual(["LOSE"]);
    expect(report.totalRealizedPnlSol).toBeCloseTo(1);
    expect(report.pnlSeries).toHaveLength(3);
  });
});
