import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Compact, dependency-free SVG sparkline for token cards.
 *
 * Color rules (per spec):
 *   - green  → latest value > first value
 *   - red    → latest value < first value
 *   - gray   → flat, insufficient data, loading, or unavailable history
 *
 * Sizing is fixed via width/height so the chart never causes layout shift: the
 * loading and unavailable states occupy the exact same box as a drawn line.
 * Kept intentionally small — Market Cap remains the primary metric on the card.
 */

type SparklineState = number[] | null | undefined;

interface SparklineProps {
  /** Chronological close prices (oldest first), null (unavailable) or undefined (loading). */
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
    if (!points || points.length < 2) return null;
    const first = points[0];
    const last = points[points.length - 1];
    const color = last > first ? GREEN : last < first ? RED : NEUTRAL;
    return { d: buildPath(points, width, height, pad), color };
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

  // Unavailable or flat/insufficient → neutral baseline so the card never breaks.
  if (!computed) {
    const midY = height / 2;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn("overflow-visible", className)}
        aria-hidden="true"
        data-testid="sparkline-empty"
      >
        <line
          x1={pad}
          y1={midY}
          x2={width - pad}
          y2={midY}
          stroke={NEUTRAL}
          strokeOpacity={0.4}
          strokeWidth={strokeWidth}
          strokeDasharray="2 3"
          strokeLinecap="round"
        />
      </svg>
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
