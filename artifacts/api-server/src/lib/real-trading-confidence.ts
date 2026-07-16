/**
 * Confidence engine for Real Trading Analysis.
 *
 * The audit found that every signal already carries a 0–1 `confidence`, but it
 * was never turned into a user-facing honesty gate: a wallet with 2 closed
 * trades would still show precise-looking scores ("Timing 0", "Consistency 8").
 *
 * This module maps raw confidence + sample size onto a discrete tier so display
 * layers can refuse to present precise intelligence without enough evidence.
 *
 * Pure - no I/O, fully testable.
 */

export type ConfidenceTier = "high" | "medium" | "low" | "insufficient";

/**
 * A score computed from fewer than this many pieces of evidence (e.g. closed
 * round trips) is never presented as a precise number - it is "Insufficient
 * Data". Chosen conservatively: below 5 samples, variance dominates signal.
 */
export const MIN_SAMPLES_FOR_SCORE = 5;

/** A behavior detected from fewer than this many observations is low-trust. */
export const MIN_SAMPLES_FOR_BEHAVIOR = 3;

const HIGH_CONFIDENCE = 0.66;
const MEDIUM_CONFIDENCE = 0.33;

/**
 * Map a raw confidence (0–1) plus the sample size that produced it onto a tier.
 *
 * Sample size gates first: no matter how internally "confident" a formula is,
 * too few observations means Insufficient Data. Above the floor, the raw
 * confidence decides high/medium/low.
 */
export function confidenceTier(
  confidence: number,
  sampleSize: number,
  minSamples: number = MIN_SAMPLES_FOR_SCORE,
): ConfidenceTier {
  if (!Number.isFinite(sampleSize) || sampleSize < minSamples) {
    return "insufficient";
  }
  const c = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  if (c >= HIGH_CONFIDENCE) return "high";
  if (c >= MEDIUM_CONFIDENCE) return "medium";
  return "low";
}

/** Human label for a tier (backend-friendly; UI may restyle). */
export function tierLabel(tier: ConfidenceTier): string {
  switch (tier) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
    case "insufficient":
      return "Insufficient data";
  }
}

/** True when a tier has enough backing to show a precise value. */
export function tierIsReliable(tier: ConfidenceTier): boolean {
  return tier !== "insufficient";
}

export interface AnalysisConfidence {
  tier: ConfidenceTier;
  /** Closed round trips - the primary evidence for trade-quality scores. */
  closedTrades: number;
  /** Total swap events observed. */
  totalTrades: number;
  /** True when the wallet clears the minimum-evidence bar for scoring. */
  hasSufficientData: boolean;
  reason: string;
}

/**
 * Overall confidence for the whole analysis, driven by how many *closed* round
 * trips exist (open positions and raw swaps do not prove trading skill).
 */
export function overallAnalysisConfidence(
  closedTrades: number,
  totalTrades: number,
): AnalysisConfidence {
  if (closedTrades < MIN_SAMPLES_FOR_SCORE) {
    return {
      tier: "insufficient",
      closedTrades,
      totalTrades,
      hasSufficientData: false,
      reason:
        `Only ${closedTrades} completed round trip${closedTrades === 1 ? "" : "s"} analyzed. ` +
        `At least ${MIN_SAMPLES_FOR_SCORE} are needed before scores are reliable.`,
    };
  }
  // Ramp confidence with closed volume; full trust around 20 closes.
  const ratio = Math.min(1, closedTrades / 20);
  const tier: ConfidenceTier =
    ratio >= HIGH_CONFIDENCE ? "high" : ratio >= MEDIUM_CONFIDENCE ? "medium" : "low";
  return {
    tier,
    closedTrades,
    totalTrades,
    hasSufficientData: true,
    reason: `${closedTrades} completed round trips analyzed.`,
  };
}
