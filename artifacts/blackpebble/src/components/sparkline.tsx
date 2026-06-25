import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Compact, dependency-free SVG sparkline for token cards.
 *
 * Draws ONLY real market history (GeckoTerminal OHLCV close series). When no
 * usable history exists we render nothing (a same-sized empty box, so layout
 * never shifts) — we never synthesize or fake a line from a percentage. An
 * honest blank beats a fabricated trend.
 *
 * Color rules, applied to the real series:
 *   - green  → latest value > first value (uptrend)
 *   - red    → latest value < first value (downtrend)
 *   - gray   → flat
 *
 * Sizing is fixed via width/height so the chart never causes layout shift: the
 * loading and empty states occupy the exact same box as a drawn line.
 */

type SparklineState = number[] | null | undefined;

interface SparklineProps {
  /** Chronological close prices (oldest first), null (no history) or undefined (loading). */
  points: SparklineState;
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

function SparklineImpl({
  points,
  width = 64,
  height = 24,
  className,
  strokeWidth = 1.5,
}: SparklineProps) {
  const pad = strokeWidth;

  const computed = useMemo(() => {
    // Real history only: every value finite and at least two points. A stray
    // NaN/null disqualifies the series so we never draw a broken path.
    const hasReal =
      Array.isArray(points) &&
      points.length >= 2 &&
      points.every((v) => Number.isFinite(v));
    if (!hasReal) return null;
    const series = points as number[];
    const first = series[0];
    const last = series[series.length - 1];
    const color = last > first ? GREEN : last < first ? RED : NEUTRAL;
    return { d: buildPath(series, width, height, pad), color };
  }, [points, width, height, pad]);

  // Loading: subtle shimmering placeholder bar, same footprint (no layout jump).
  if (points === undefined) {
    return (
      <div
        className={cn("animate-pulse rounded bg-muted-foreground/10", className)}
        style={{ width, height }}
        aria-hidden="true"
        data-testid="sparkline-loading"
      />
    );
  }

  // No real history → render an empty box of the exact same footprint. We never
  // fabricate a line; an honest blank keeps cards from lying about movement.
  if (!computed) {
    return (
      <div
        className={className}
        style={{ width, height }}
        aria-hidden="true"
        data-testid="sparkline-empty"
      />
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden="true"
      data-testid="sparkline"
    >
      <path
        d={computed.d}
        fill="none"
        stroke={computed.color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const Sparkline = memo(SparklineImpl);
