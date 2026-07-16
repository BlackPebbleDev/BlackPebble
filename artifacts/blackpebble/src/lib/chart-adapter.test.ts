import { describe, it, expect } from "vitest";
import {
  INTERNAL_CHART_ADAPTER,
  toActivityBars,
  toChartData,
  toHoldBars,
  toPnlPoints,
} from "./chart-adapter";
import type { RealPerformanceReport } from "@/lib/api";

describe("chart adapter boundary (Part 11.6)", () => {
  it("maps the P&L series to renderer-agnostic points", () => {
    const pts = toPnlPoints([
      { t: 1, cumRealizedPnlSol: 0.5 },
      { t: 2, cumRealizedPnlSol: 1.25 },
    ]);
    expect(pts).toEqual([
      { t: 1, valueSol: 0.5 },
      { t: 2, valueSol: 1.25 },
    ]);
  });

  it("computes hold-bucket percentages of completed round trips", () => {
    const bars = toHoldBars([
      { label: "<10m", count: 1 },
      { label: "10-60m", count: 3 },
    ]);
    expect(bars[0]!.percentOfClosed).toBeCloseTo(25);
    expect(bars[1]!.percentOfClosed).toBeCloseTo(75);
  });

  it("does not divide by zero when there are no closed trips", () => {
    const bars = toHoldBars([{ label: "<10m", count: 0 }]);
    expect(bars[0]!.percentOfClosed).toBe(0);
  });

  it("carries activity buy/sell/volume through unchanged", () => {
    const bars = toActivityBars([
      { month: "2026-07", buys: 4, sells: 2, volumeSol: 3.1 },
    ]);
    expect(bars[0]).toEqual({ month: "2026-07", buys: 4, sells: 2, volumeSol: 3.1 });
  });

  it("adapts a full report and the internal adapter is not TradingView", () => {
    const report: RealPerformanceReport = {
      pnlSeries: [{ t: 1, cumRealizedPnlSol: 0 }],
      monthlyActivity: [{ month: "2026-07", buys: 1, sells: 0, volumeSol: 1 }],
      holdBuckets: [{ label: "<10m", count: 1 }],
      topWinners: [],
      topLosers: [],
      totalRealizedPnlSol: 0,
    };
    const data = toChartData(report);
    expect(data.pnl).toHaveLength(1);
    expect(data.activity).toHaveLength(1);
    expect(data.holds[0]!.percentOfClosed).toBe(100);
    expect(INTERNAL_CHART_ADAPTER.isTradingView).toBe(false);
  });
});
