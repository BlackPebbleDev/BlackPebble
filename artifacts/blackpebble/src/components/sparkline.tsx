import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { SparklineEntry } from "@/lib/api";
import { generatePlaceholderSeries } from "@/lib/sparkline-placeholder";

/**
 * Compact, dependency-free SVG sparkline for token cards.
 *
 * Real market history is always preferred and drawn at full strength. The server
 * resolves the richest REAL source available (GeckoTerminal OHLCV → DexScreener-
 * derived → Birdeye → observed snapshots) and hands us a {points, source} entry.
 *
 * When NO real data exists for a token (`points: null`), instead of leaving the
 * card blank we draw a deterministic, market-shaped ARTIFICIAL placeholder (the
 * last-resort L6 level) seeded by the mint - rendered at reduced opacity with its
 * own test id so it is visibly secondary and never claims to be real movement.
 * The moment real data arrives the line swaps in with a smooth opacity fade.
 *
 * Color rules (applied to whichever series is drawn):
 *   - green  → latest value > first value (uptrend)
 *   - red    → latest value < first value (downtrend)
 *   - gray   → flat
 *
 * Sizing is fixed via width/height so the chart never causes layout shift: the
 * loading, real, and placeholder states all occupy the exact same box.
 */

interface SparklineProps {
  /** Resolved server entry, or undefined while loading. */
  series: SparklineEntry | undefined;
  /** Token mint - seeds the deterministic placeholder when no real data exists. */
  seed?: string;
  width?: number;
  height?: number;
  className?: string;
  /** Stroke width in px. */
  strokeWidth?: number;
}

const GREEN = "rgb(52, 211, 153)"; // emerald-400
const RED = "rgb(248, 113, 113)"; // red-400
const NEUTRAL = "rgb(113, 113, 122)"; // zinc-500

function buildPath(
  values: number[],
  width: number,
  height: number,
  pad: number,
): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;

  return values
    .map((v, i) => {
      const x = pad + i * stepX;
      // Flat series → center the line vertically.
      const y =
        span > 0 ? pad + innerH - ((v - min) / span) * innerH : pad + innerH / 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/** A finite series of at least two points is drawable. */
function isDrawable(points: number[] | null | undefined): points is number[] {
  return (
    Array.isArray(points) &&
    points.length >= 2 &&
    points.every((v) => Number.isFinite(v))
  );
}

function colorFor(series: number[]): string {
  const first = series[0];
  const last = series[series.length - 1];
  return last > first ? GREEN : last < first ? RED : NEUTRAL;
}

function SparklineImpl({
  series,
  seed,
  width = 64,
  height = 24,
  className,
  strokeWidth = 1.5,
}: SparklineProps) {
  const pad = strokeWidth;

  const real = useMemo(() => {
    const points = series?.points;
    if (!isDrawable(points)) return null;
    return { d: buildPath(points, width, height, pad), color: colorFor(points) };
  }, [series, width, height, pad]);

  // Deterministic artificial placeholder (L6) - only computed when there is no
  // real series to draw and we have a seed. Same footprint, reduced opacity.
  const placeholder = useMemo(() => {
    if (real || series === undefined || !seed) return null;
    const points = generatePlaceholderSeries(seed);
    if (!isDrawable(points)) return null;
    return { d: buildPath(points, width, height, pad), color: colorFor(points) };
  }, [real, series, seed, width, height, pad]);

  // Loading: subtle shimmering placeholder bar, same footprint (no layout jump).
  if (series === undefined) {
    return (
      <div
        className={cn("animate-pulse rounded bg-muted-foreground/10", className)}
        style={{ width, height }}
        aria-hidden="true"
        data-testid="sparkline-loading"
      />
    );
  }

  // Real history → draw at full strength.
  if (real) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn("overflow-visible transition-opacity duration-500", className)}
        aria-hidden="true"
        data-testid="sparkline"
        data-source={series.source ?? undefined}
      >
        <path
          d={real.d}
          fill="none"
          stroke={real.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // No real data → deterministic artificial placeholder, clearly secondary.
  if (placeholder) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn("overflow-visible transition-opacity duration-500", className)}
        aria-hidden="true"
        data-testid="sparkline-placeholder"
      >
        <path
          d={placeholder.d}
          fill="none"
          stroke={placeholder.color}
          strokeOpacity={0.45}
          strokeWidth={strokeWidth}
          strokeDasharray="2 2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // No real data and no seed to synthesize from → honest empty box.
  return (
    <div
      className={className}
      style={{ width, height }}
      aria-hidden="true"
      data-testid="sparkline-empty"
    />
  );
}

export const Sparkline = memo(SparklineImpl);
