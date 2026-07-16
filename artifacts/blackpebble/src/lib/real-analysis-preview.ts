import type { RealTradingSignal } from "@/lib/api";

/**
 * Canonical signal directionality + portfolio-preview selection (Phase 2).
 *
 * Descriptive signals are a STYLE, not a grade - they have no good/bad
 * direction, so they are never coloured and are not eligible as a "strongest
 * trait" or "key weakness" in the preview.
 */
export const DESCRIPTIVE_SIGNALS = new Set<string>([
  "risk",
  "patience",
  "conviction",
  "activity",
]);

export function isHigherBetter(key: string): boolean {
  return !DESCRIPTIVE_SIGNALS.has(key);
}

/**
 * Portfolio preview signal selection rule (Part 8). We do NOT just show the
 * three highest scores - that tells one story. We surface the most INFORMATIVE
 * mix and document the rule here so it is testable and stable:
 *   1. Strongest trait   - highest-scoring higher-is-better signal.
 *   2. Key weakness/risk - lowest-scoring higher-is-better signal (distinct).
 *   3. Defining change   - the largest trustworthy 30-day change, else a
 *                          defining style signal (risk / conviction), else any
 *                          remaining scored signal.
 * Only scored (sufficient-evidence) signals are eligible. Because the returned
 * objects come straight from analysis.signals, preview scores match the full
 * page exactly.
 */
export function selectPreviewSignals(
  signals: RealTradingSignal[],
): RealTradingSignal[] {
  const scored = signals.filter((s) => s.tier !== "insufficient");
  const graded = scored.filter((s) => isHigherBetter(s.key));
  const picked: RealTradingSignal[] = [];
  const take = (s: RealTradingSignal | undefined) => {
    if (s && !picked.some((p) => p.key === s.key)) picked.push(s);
  };

  const byValueDesc = [...graded].sort((a, b) => b.value - a.value);
  take(byValueDesc[0]); // strongest trait
  take(byValueDesc[byValueDesc.length - 1]); // key weakness (distinct)

  const changed = scored
    .filter((s) => s.comparison?.status === "comparable" && s.delta30d != null)
    .sort((a, b) => Math.abs(b.delta30d ?? 0) - Math.abs(a.delta30d ?? 0));
  take(changed[0]);
  take(scored.find((s) => s.key === "risk" || s.key === "conviction"));
  for (const s of scored) take(s);

  return picked.slice(0, 3);
}
