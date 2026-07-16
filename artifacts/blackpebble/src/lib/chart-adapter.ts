/**
 * Trader Intelligence chart adapter boundary (Phase 2, Part 11.6).
 *
 * The charts on the analysis page (cumulative P&L line, monthly activity bars,
 * hold-duration distribution) currently render with our internal Chart.js
 * components. This module defines a STABLE, renderer-agnostic contract between
 * the backend metric data (RealPerformanceReport) and whatever draws it, so a
 * TradingView Advanced Charts adapter can later be dropped in WITHOUT changing
 * backend data contracts or metric logic.
 *
 * We do NOT ship TradingView here - the private Advanced Charts library is not
 * present or licensed in this repo, and these are not TradingView charts. This
 * is purely the seam that makes swapping renderers a localized change.
 *
 * Pure - no React, no I/O, fully testable.
 */

import type {
  RealActivityBucket,
  RealHoldBucket,
  RealPerformanceReport,
  RealPnlPoint,
} from "@/lib/api";

/** One point on the cumulative realized-P&L line (renderer-agnostic). */
export interface PnlChartPoint {
  /** Unix seconds. */
  t: number;
  /** Cumulative realized P&L in SOL at time t. */
  valueSol: number;
}

/** One monthly activity bar group. */
export interface ActivityChartBar {
  /** Month key, e.g. "2026-07". */
  month: string;
  buys: number;
  sells: number;
  volumeSol: number;
}

/** One hold-duration distribution bar. */
export interface HoldChartBar {
  label: string;
  count: number;
  /** Share of completed round trips (0-100), pre-computed for the renderer. */
  percentOfClosed: number;
}

/**
 * The complete, renderer-agnostic dataset for the three analysis charts. A
 * TradingView adapter (or any other) consumes THIS, never the raw API report,
 * so the backend contract and the metric math never change with the renderer.
 */
export interface TiChartData {
  pnl: PnlChartPoint[];
  activity: ActivityChartBar[];
  holds: HoldChartBar[];
}

/**
 * A chart renderer implementation. The default internal (Chart.js) charts and a
 * future TradingView adapter both satisfy this shape, so selecting a renderer is
 * a one-line swap at the call site.
 */
export interface TiChartAdapter {
  readonly name: string;
  readonly isTradingView: boolean;
}

export function toPnlPoints(series: RealPnlPoint[]): PnlChartPoint[] {
  return series.map((p) => ({ t: p.t, valueSol: p.cumRealizedPnlSol }));
}

export function toActivityBars(months: RealActivityBucket[]): ActivityChartBar[] {
  return months.map((m) => ({
    month: m.month,
    buys: m.buys,
    sells: m.sells,
    volumeSol: m.volumeSol,
  }));
}

export function toHoldBars(buckets: RealHoldBucket[]): HoldChartBar[] {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  return buckets.map((b) => ({
    label: b.label,
    count: b.count,
    percentOfClosed: total > 0 ? (b.count / total) * 100 : 0,
  }));
}

/** Adapt a backend performance report into the renderer-agnostic chart dataset. */
export function toChartData(report: RealPerformanceReport): TiChartData {
  return {
    pnl: toPnlPoints(report.pnlSeries),
    activity: toActivityBars(report.monthlyActivity),
    holds: toHoldBars(report.holdBuckets),
  };
}

/** The currently-shipping internal renderer (Chart.js based, not TradingView). */
export const INTERNAL_CHART_ADAPTER: TiChartAdapter = {
  name: "internal-chartjs",
  isTradingView: false,
};
