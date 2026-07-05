/**
 * BlackPebble's shared Chart.js theme: dark rounded tooltips, soft grid,
 * accent gradient fills, and a crosshair that follows the hover. Used by the
 * Portfolio equity chart and the Trading Analysis performance charts so every
 * chart in the app speaks the same visual language.
 */

import type { Plugin, ScriptableContext } from "chart.js";

export const CHART_ACCENT = "#c9a96e";
export const CHART_GRID = "rgba(255,255,255,0.04)";
export const CHART_TICK = "#a0a0a0";

/** Rounded, dark, accent-titled hover box matching BlackPebble cards. */
export const bpTooltip = {
  backgroundColor: "#171717",
  borderColor: "rgba(255,255,255,0.09)",
  borderWidth: 1,
  cornerRadius: 12,
  padding: 12,
  titleColor: CHART_ACCENT,
  titleFont: { size: 11, weight: 600 as const },
  bodyColor: "#e5e5e5",
  bodyFont: { size: 11 },
  footerColor: "#a0a0a0",
  footerFont: { size: 10, weight: 400 as const },
  displayColors: false,
  caretSize: 6,
};

export const bpScales = {
  x: {
    grid: { color: CHART_GRID },
    border: { display: false },
    ticks: {
      color: CHART_TICK,
      maxTicksLimit: 8,
      maxRotation: 0,
      autoSkip: true,
      font: { size: 10 },
      padding: 6,
    },
  },
  y: {
    grid: { color: CHART_GRID },
    border: { display: false },
    ticks: { color: CHART_TICK, font: { size: 10 }, padding: 6 },
  },
};

/**
 * Vertical accent fill that fades to transparent under a line - computed per
 * render because the gradient must match the current chart area height.
 */
export function accentAreaGradient(
  ctx: ScriptableContext<"line">,
): CanvasGradient | string {
  const { chart } = ctx;
  const area = chart.chartArea;
  if (!area) return "rgba(201,169,110,0.08)";
  const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  gradient.addColorStop(0, "rgba(201,169,110,0.28)");
  gradient.addColorStop(0.6, "rgba(201,169,110,0.08)");
  gradient.addColorStop(1, "rgba(201,169,110,0)");
  return gradient;
}

/** Dashed vertical crosshair at the hovered point (register per-chart). */
export const crosshairPlugin: Plugin<"line" | "bar"> = {
  id: "bpCrosshair",
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements() ?? [];
    if (active.length === 0) return;
    const x = active[0]!.element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(201,169,110,0.35)";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};

/** Standard line-dataset styling for accent area charts. */
export const accentLineDataset = {
  borderColor: CHART_ACCENT,
  backgroundColor: accentAreaGradient,
  fill: true,
  tension: 0.3,
  pointRadius: 0,
  pointHoverRadius: 4,
  pointHoverBackgroundColor: CHART_ACCENT,
  pointHoverBorderColor: "#0a0a0a",
  pointHoverBorderWidth: 2,
  borderWidth: 2,
};

export type ChartRange = "7d" | "30d" | "90d" | "all";

export const CHART_RANGES: Array<{ key: ChartRange; label: string }> = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "all", label: "All" },
];

const RANGE_SECONDS: Record<Exclude<ChartRange, "all">, number> = {
  "7d": 7 * 86400,
  "30d": 30 * 86400,
  "90d": 90 * 86400,
};

/** Filter time-series points (unix-seconds `t`) to the selected range. */
export function filterByRange<T extends { t: number }>(
  points: T[],
  range: ChartRange,
  nowSec = Math.floor(Date.now() / 1000),
): T[] {
  if (range === "all") return points;
  const cutoff = nowSec - RANGE_SECONDS[range];
  return points.filter((p) => p.t >= cutoff);
}
