/**
 * Real trend infrastructure (Phase 2C, Part 15 + 16).
 *
 * A generic append-only history model for meaningful metric and behavior
 * changes, plus pure change-classification. Trend badges must come from
 * comparable historical data, never fabricated deltas. Directional semantics
 * live in ONE central registry so descriptive metrics are never colored good or
 * bad, and current-wallet vs historical metrics use separate scopes.
 *
 * The pure logic (classification, registry, dedup policy) lives here. The DB
 * append lives in real-trading-trend-store.ts so this stays fully testable.
 */

export type MetricScope = "current" | "historical";

export type MetricDirectionality =
  | "higher_better"
  | "lower_better"
  | "descriptive";

export type TrendDirection =
  | "new"
  | "improving"
  | "declining"
  | "stable"
  | "insufficient_history"
  | "not_comparable";

export type TrendSemantic = "positive" | "negative" | "neutral";

export interface TrendResult {
  direction: TrendDirection;
  /** Whether the change is good/bad/neutral. Descriptive metrics are neutral. */
  semantic: TrendSemantic;
  changePct: number | null;
  changeAbs: number | null;
}

/**
 * Central directionality registry. Anything not listed defaults to descriptive
 * (neutral) so a new metric can never be accidentally colored as good or bad.
 */
export const METRIC_DIRECTIONALITY: Record<string, MetricDirectionality> = {
  // Signals (higher score is better by construction of the registry).
  "signal.consistency": "higher_better",
  "signal.timing": "higher_better",
  "signal.risk_management": "higher_better",
  "signal.discipline": "higher_better",
  "signal.conviction": "higher_better",
  "signal.recovery": "higher_better",
  // Risk metrics.
  "risk.profit_factor": "higher_better",
  "risk.expectancy": "higher_better",
  "risk.max_drawdown_pct": "lower_better",
  "risk.longest_drawdown_sec": "lower_better",
  "risk.worst_losing_streak": "lower_better",
  "risk.tail_loss_concentration": "lower_better",
  "risk.result_volatility": "lower_better",
  // Entry / exit quality.
  "entry.avg_score": "higher_better",
  "entry.immediate_adverse_rate": "lower_better",
  "exit.avg_score": "higher_better",
  "exit.panic_rate": "lower_better",
  "exit.capture_rate": "higher_better",
  // Coverage.
  "coverage.pricing": "higher_better",
  "coverage.entry_quality": "higher_better",
  "coverage.exit_quality": "higher_better",
  // Holdings / liquidity quality.
  "holdings.weighted_liquidity_quality": "higher_better",
  "holdings.concentration": "lower_better",
  // Descriptive (turnover / activity) - never colored.
  "activity.trades_per_week": "descriptive",
  "activity.unique_tokens": "descriptive",
  "behavior.evidence_count": "descriptive",
};

export function directionalityOf(metricKey: string): MetricDirectionality {
  return METRIC_DIRECTIONALITY[metricKey] ?? "descriptive";
}

export interface ClassifyTrendOptions {
  metricKey: string;
  /** Fraction (0..1) below which a change is considered "stable". */
  changeThreshold?: number;
  currentSampleSize?: number;
  previousSampleSize?: number;
  minSampleSize?: number;
}

const DEFAULT_CHANGE_THRESHOLD = 0.05;
const DEFAULT_MIN_SAMPLE = 5;

/**
 * Classify the movement of a metric between two comparable snapshots.
 *
 * Gating order:
 *  1. no previous value            → "new"
 *  2. either side below min sample  → "insufficient_history"
 *  3. non-finite / undefined value  → "not_comparable"
 *  4. |change| below threshold      → "stable"
 *  5. else improving/declining per the central registry
 */
export function classifyTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
  opts: ClassifyTrendOptions,
): TrendResult {
  const dir = directionalityOf(opts.metricKey);
  const semanticFor = (raisedGood: boolean, wentUp: boolean): TrendSemantic => {
    if (dir === "descriptive") return "neutral";
    return wentUp === raisedGood ? "positive" : "negative";
  };
  const minSample = opts.minSampleSize ?? DEFAULT_MIN_SAMPLE;
  const threshold = opts.changeThreshold ?? DEFAULT_CHANGE_THRESHOLD;

  if (current == null || !Number.isFinite(current)) {
    return { direction: "not_comparable", semantic: "neutral", changePct: null, changeAbs: null };
  }
  if (previous == null || !Number.isFinite(previous)) {
    return { direction: "new", semantic: "neutral", changePct: null, changeAbs: null };
  }
  if (
    (opts.currentSampleSize != null && opts.currentSampleSize < minSample) ||
    (opts.previousSampleSize != null && opts.previousSampleSize < minSample)
  ) {
    return {
      direction: "insufficient_history",
      semantic: "neutral",
      changePct: null,
      changeAbs: null,
    };
  }

  const changeAbs = current - previous;
  const changePct = previous !== 0 ? changeAbs / Math.abs(previous) : null;
  const magnitude = changePct != null ? Math.abs(changePct) : Math.abs(changeAbs);
  if (magnitude < threshold) {
    return { direction: "stable", semantic: "neutral", changePct, changeAbs };
  }

  const wentUp = changeAbs > 0;
  if (dir === "higher_better") {
    return {
      direction: wentUp ? "improving" : "declining",
      semantic: semanticFor(true, wentUp),
      changePct,
      changeAbs,
    };
  }
  if (dir === "lower_better") {
    return {
      direction: wentUp ? "declining" : "improving",
      semantic: semanticFor(false, wentUp),
      changePct,
      changeAbs,
    };
  }
  // Descriptive: report movement, never color it.
  return {
    direction: wentUp ? "improving" : "declining",
    semantic: "neutral",
    changePct,
    changeAbs,
  };
}

export interface MetricHistoryPoint {
  metricKey: string;
  metricScope: MetricScope;
  valueNumeric: number | null;
  sampleSize: number;
  computedAt: number;
}

/**
 * Dedup / change-threshold policy: only write a new history row when the value
 * has MATERIALLY changed from the most recent stored point (or when none
 * exists). Prevents unbounded duplicate history on every page refresh.
 */
export function shouldWriteHistory(
  metricKey: string,
  latest: MetricHistoryPoint | null,
  nextValue: number | null,
  changeThreshold = DEFAULT_CHANGE_THRESHOLD,
): boolean {
  if (nextValue == null || !Number.isFinite(nextValue)) return false;
  if (latest == null || latest.valueNumeric == null) return true;
  const prev = latest.valueNumeric;
  const magnitude =
    prev !== 0 ? Math.abs((nextValue - prev) / Math.abs(prev)) : Math.abs(nextValue - prev);
  return magnitude >= changeThreshold;
}
