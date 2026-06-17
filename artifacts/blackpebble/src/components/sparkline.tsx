import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Compact, dependency-free SVG sparkline for token cards.
 *
 * Every card renders a line. When real GeckoTerminal OHLCV history exists we
 * draw it; when it is unavailable we synthesize a lightweight trend line from
 * the token's current percentage change so cards stay visually consistent — no
 * dashed placeholders, no empty chart areas.
 *
 * Color rules (per spec), applied to whichever series is drawn:
 *   - green  → latest value > first value (uptrend / positive %)
 *   - red    → latest value < first value (downtrend / negative %)
 *   - gray   → flat / near-zero % / no signal at all
 *
 * Sizing is fixed via width/height so the chart never causes layout shift: the
 * loading placeholder occupies the exact same box as a drawn line.
 */

type SparklineState = number[] | null | undefined;

interface SparklineProps {
  /** Chronological close prices (oldest first), null (no history) or undefined (loading). */
  points: SparklineState;
  /**
   * Current percentage change used to synthesize a fallback line when `points`
   * has no usable history. Null/omitted → flat gray line.
   */
  fallbackPercent?: number | null;
  width?: number;
  height?: number;
  className?: string;
  /** Stroke width in px. */
  strokeWidth?: number;
}

const GREEN = "rgb(52, 211, 153)"; // emerald-400
const RED = "rgb(248, 113, 113)"; // red-400
const NEUTRAL = "rgb(113, 113, 122)"; // zinc-500

/** Below this absolute % we treat movement as flat (gray sideways line). */
const NEAR_ZERO_PCT = 0.5;
const FALLBACK_POINTS = 16;

/**
 * Build a believable trend line purely from a percentage change. The sparkline
 * normalizes to its own min/max, so only the SHAPE matters: positive trends up,
 * negative trends down, near-zero stays flat. A small deterministic ripple makes
 * it read like a real series rather than a straight ruler, while keeping the
 * endpoints faithful to the sign so the color rule stays correct (the ripple is
 * zero at both endpoints, so first/last are governed purely by direction).
 */
function fallbackSeries(percent: number | null): number[] {
  // Coerce anything non-finite (null/NaN/Infinity) to 0 so we never emit NaN
  // coordinates — that would break the SVG path and leave the card chart-less.
  const pct = Number.isFinite(percent) ? (percent as number) : 0;
  const dir = Math.abs(pct) < NEAR_ZERO_PCT ? 0 : Math.sign(pct);
  // Near-zero → a truly flat sideways line (no ripple), per spec.
  if (dir === 0) return new Array(FALLBACK_POINTS).fill(0);
  const out: number[] = [];
  for (let i = 0; i < FALLBACK_POINTS; i++) {
    const t = i / (FALLBACK_POINTS - 1); // 0..1
    const ripple = Math.sin(t * Math.PI * 3) * 0.08;
    out.push(dir * t + ripple);
  }
  return out;
}

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
  fallbackPercent,
  width = 64,
  height = 24,
  className,
  strokeWidth = 1.5,
}: SparklineProps) {
  const pad = strokeWidth;

  const computed = useMemo(() => {
    // Real history only when every value is finite; otherwise fall back so a
    // stray NaN/null in the series can never produce a broken (chart-less) path.
    const hasReal =
      Array.isArray(points) &&
      points.length >= 2 &&
      points.every((v) => Number.isFinite(v));
    const series = hasReal
      ? (points as number[])
      : fallbackSeries(fallbackPercent ?? null);
    const first = series[0];
    const last = series[series.length - 1];
    const color = last > first ? GREEN : last < first ? RED : NEUTRAL;
    return {
      d: buildPath(series, width, height, pad),
      color,
      synthetic: !hasReal,
    };
  }, [points, fallbackPercent, width, height, pad]);

  // Loading: subtle shimmering placeholder bar, same footprint (no layout jump).
  // This is the ONLY non-line state — once data settles every card draws a line.
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

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden="true"
      data-testid={computed.synthetic ? "sparkline-fallback" : "sparkline"}
    >
      <path
        d={computed.d}
        fill="none"
        stroke={computed.color}
        // Synthetic fallback lines are drawn slightly softer so they read as an
        // estimate-from-% rather than recorded history, while staying consistent.
        strokeOpacity={computed.synthetic ? 0.7 : 1}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const Sparkline = memo(SparklineImpl);
