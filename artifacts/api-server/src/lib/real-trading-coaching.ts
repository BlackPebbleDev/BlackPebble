/**
 * Deterministic coaching context (Phase 2B, Part 18).
 *
 * This is NOT AI. It assembles the already-computed intelligence into one clean,
 * typed structure and derives rule-based "BlackPebble Coaching Insights" from
 * it. The future AI layer must consume THIS object (not raw transactions), so
 * connecting a model later is additive. Pure and fully testable.
 */

import {
  SIGNAL_DETAIL_META,
  SIGNAL_META,
  type SignalWithDelta,
} from "./real-trading-signals.js";
import type { BehaviorInsight } from "./real-trading-behavior.js";
import type { HistoricalRisk, RiskProfileTier } from "./real-trading-risk.js";
import type { ConfidenceTier } from "./real-trading-confidence.js";
import type { EntryQualitySummary } from "./real-trading-entry-quality.js";
import type { ExitQualitySummary } from "./real-trading-exit-quality.js";
import type { LiquidityRiskSummary } from "./real-trading-liquidity.js";

/**
 * Versioned coaching contract. A future AI layer pins to this version; bumping
 * it signals a structural change so the model prompt can be updated in lockstep.
 */
export const COACHING_CONTEXT_VERSION = 2;

/**
 * Claims a future AI layer is explicitly forbidden from making. Carried in the
 * context so the model prompt can hard-enforce them.
 */
export const COACHING_PROHIBITED_CLAIMS: string[] = [
  "Do not guarantee profit or any financial outcome.",
  "Do not recommend specific token purchases or exact entries.",
  "Do not encourage leverage.",
  "Do not encourage chasing or averaging into losses.",
  "Do not claim certainty; describe patterns and confidence only.",
  "Do not ignore missing data or low coverage.",
  "Do not provide financial advice.",
];

export interface CoachingScoreRef {
  key: string;
  value: number;
  classification: string;
}

export interface CoachingInsight {
  key: string;
  title: string;
  body: string;
  /** What this recommendation is based on (evidence trail). */
  basis: string;
  priority: "high" | "medium" | "low";
}

/** A concrete trade referenced as evidence for coaching. */
export interface CoachingEvidenceTrade {
  roundTripId: string;
  mint: string;
  realizedPnlSol: number;
  reason: string;
}

export interface CoachingContext {
  /** Contract version (see COACHING_CONTEXT_VERSION). */
  version: number;
  /** Analyzed date range [firstTradeAt, lastTradeAt] in unix seconds. */
  analyzedRange: { start: number | null; end: number | null };
  /** Coverage tier of the underlying report, when available. */
  coverageTier: string | null;
  reportConfidence: ConfidenceTier;
  strengths: CoachingScoreRef[];
  developmentAreas: CoachingScoreRef[];
  highConfidenceBehaviors: Array<{
    key: string;
    title: string;
    classification: string;
  }>;
  riskProfile: RiskProfileTier;
  /** Compact summaries so a future AI layer never re-derives them. */
  entryQuality: {
    avgScore: number | null;
    coveragePercent: number;
    confidence: ConfidenceTier;
  } | null;
  exitQuality: {
    avgScore: number | null;
    coveragePercent: number;
    confidence: ConfidenceTier;
  } | null;
  liquidity: {
    weightedQuality: number | null;
    fragileCount: number;
    confidence: ConfidenceTier;
  } | null;
  meaningfulChanges: Array<{ key: string; delta: number }>;
  evidenceTrades: CoachingEvidenceTrade[];
  insights: CoachingInsight[];
  limitations: string[];
  /** Hard guardrails a future AI layer must respect. */
  prohibitedClaims: string[];
}

export interface CoachingInput {
  signals: SignalWithDelta[];
  insights: BehaviorInsight[];
  historicalRisk: HistoricalRisk;
  reportConfidence: ConfidenceTier;
  // ── Phase 2C additive inputs (all optional; older callers still work) ──────
  entrySummary?: EntryQualitySummary | null;
  exitSummary?: ExitQualitySummary | null;
  liquiditySummary?: LiquidityRiskSummary | null;
  coverageTier?: string | null;
  analyzedRange?: { start: number | null; end: number | null };
  evidenceTrades?: CoachingEvidenceTrade[];
}

const BEHAVIOR_CONFIDENCE_FLOOR = 0.6;
const MAX_INSIGHTS = 4;

/** Build the coaching context + rule-based insights. Pure. */
export function buildCoachingContext(input: CoachingInput): CoachingContext {
  const { signals, insights, historicalRisk, reportConfidence } = input;
  const analyzedRange = input.analyzedRange ?? { start: null, end: null };
  const entryQuality = input.entrySummary
    ? {
        avgScore: input.entrySummary.avgEntryScore,
        coveragePercent: input.entrySummary.coveragePercent,
        confidence: input.entrySummary.confidence,
      }
    : null;
  const exitQuality = input.exitSummary
    ? {
        avgScore: input.exitSummary.avgExitScore,
        coveragePercent: input.exitSummary.coveragePercent,
        confidence: input.exitSummary.confidence,
      }
    : null;
  const liquidity = input.liquiditySummary
    ? {
        weightedQuality: input.liquiditySummary.weightedLiquidityQuality,
        fragileCount: input.liquiditySummary.fragilePositionsCount,
        confidence: input.liquiditySummary.confidence,
      }
    : null;
  // Evidence trades come pre-selected by the engine; keep a stable, bounded copy.
  const evidenceTrades = (input.evidenceTrades ?? []).slice(0, 6);
  const coverageTier = input.coverageTier ?? null;

  const gradeable = signals.filter(
    (s) =>
      s.tier !== "insufficient" &&
      SIGNAL_META[s.key as keyof typeof SIGNAL_META]?.direction ===
        "higher_better",
  );
  const strengths: CoachingScoreRef[] = [...gradeable]
    .sort((a, b) => b.value - a.value)
    .filter((s) => s.value >= 60)
    .slice(0, 3)
    .map((s) => ({
      key: s.key,
      value: s.value,
      classification: s.detail?.classification ?? "strong",
    }));
  const developmentAreas: CoachingScoreRef[] = [...gradeable]
    .sort((a, b) => a.value - b.value)
    .filter((s) => s.value <= 50)
    .slice(0, 3)
    .map((s) => ({
      key: s.key,
      value: s.value,
      classification: s.detail?.classification ?? "developing",
    }));

  const highConfidenceBehaviors = insights
    .filter((i) => (i.confidence ?? 0) >= BEHAVIOR_CONFIDENCE_FLOOR)
    .map((i) => ({
      key: i.key,
      title: i.title,
      classification: i.classification ?? "observation",
    }));

  const meaningfulChanges = signals
    .filter(
      (s) =>
        s.comparison?.status === "comparable" &&
        s.delta30d != null &&
        Math.abs(s.delta30d) >= 5,
    )
    .map((s) => ({ key: s.key, delta: s.delta30d! }));

  const insightsOut: CoachingInsight[] = [];

  if (reportConfidence === "insufficient") {
    insightsOut.push({
      key: "need_more_data",
      title: "Keep trading to unlock coaching",
      body: "There aren't enough completed round trips yet to coach reliably. Your focus areas will appear here as your history grows.",
      basis: "Report confidence is below the minimum evidence threshold.",
      priority: "high",
    });
    return {
      version: COACHING_CONTEXT_VERSION,
      analyzedRange,
      coverageTier,
      reportConfidence,
      strengths,
      developmentAreas,
      highConfidenceBehaviors,
      riskProfile: historicalRisk.profileTier,
      entryQuality,
      exitQuality,
      liquidity,
      meaningfulChanges,
      evidenceTrades,
      insights: insightsOut,
      limitations: [
        "These are rule-based insights, not AI. They read only your on-chain history.",
        "More completed trades will sharpen every recommendation.",
      ],
      prohibitedClaims: COACHING_PROHIBITED_CLAIMS,
    };
  }

  // Rule 1: weakest gradeable signal(s) become the primary focus areas.
  for (const area of developmentAreas.slice(0, 2)) {
    const meta = SIGNAL_DETAIL_META[area.key as keyof typeof SIGNAL_DETAIL_META];
    if (!meta) continue;
    insightsOut.push({
      key: `improve_${area.key}`,
      title: `Work on ${signalLabel(area.key)}`,
      body: meta.improvement[0] ?? meta.measures,
      basis: `${signalLabel(area.key)} scored ${area.value}/100 (${area.classification}).`,
      priority: area.value <= 35 ? "high" : "medium",
    });
  }

  // Rule 2: surface the strongest evidence-backed "area to watch" behavior.
  const watch = insights
    .filter(
      (i) =>
        i.classification === "area_to_watch" &&
        (i.confidence ?? 0) >= BEHAVIOR_CONFIDENCE_FLOOR,
    )
    .sort((a, b) => (b.evidenceCount ?? 0) - (a.evidenceCount ?? 0))[0];
  if (watch) {
    insightsOut.push({
      key: `behavior_${watch.key}`,
      title: watch.title,
      body: watch.guidance ?? watch.description,
      basis: `Detected across ${watch.evidenceCount} observation${watch.evidenceCount === 1 ? "" : "s"}.`,
      priority: "medium",
    });
  }

  // Rule 3: risk-profile guidance when results are volatile.
  if (
    historicalRisk.profileTier === "highly_volatile" ||
    historicalRisk.profileTier === "aggressive"
  ) {
    insightsOut.push({
      key: "risk_profile",
      title: "Tame result volatility",
      body: "Your realized results swing widely. Steadier position sizing narrows the swings without capping your upside.",
      basis: `Historical risk profile is ${historicalRisk.profileTier.replace("_", " ")}.`,
      priority: historicalRisk.profileTier === "highly_volatile" ? "high" : "low",
    });
  }

  // Rule 4: affirm a genuine strength so coaching is not only negative.
  if (strengths.length > 0) {
    const top = strengths[0]!;
    insightsOut.push({
      key: `keep_${top.key}`,
      title: `Keep leaning on your ${signalLabel(top.key)}`,
      body: `${signalLabel(top.key)} is a real strength (${top.value}/100). Protect the habits behind it.`,
      basis: `${signalLabel(top.key)} classified as ${top.classification}.`,
      priority: "low",
    });
  }

  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  insightsOut.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

  return {
    version: COACHING_CONTEXT_VERSION,
    analyzedRange,
    coverageTier,
    reportConfidence,
    strengths,
    developmentAreas,
    highConfidenceBehaviors,
    riskProfile: historicalRisk.profileTier,
    entryQuality,
    exitQuality,
    liquidity,
    meaningfulChanges,
    evidenceTrades,
    insights: insightsOut.slice(0, MAX_INSIGHTS),
    limitations: [
      "These are rule-based insights, not AI. They read only your on-chain history.",
      "Guidance describes patterns and associations, not guaranteed cause and effect.",
    ],
    prohibitedClaims: COACHING_PROHIBITED_CLAIMS,
  };
}

const SIGNAL_LABELS: Record<string, string> = {
  consistency: "Consistency",
  risk: "Risk Appetite",
  discipline: "Discipline",
  timing: "Timing",
  patience: "Patience",
  recovery: "Recovery",
  profitability: "Profitability",
  conviction: "Conviction",
  position_sizing: "Position Sizing",
  diversification: "Trading Breadth",
  drawdown_management: "Drawdown Management",
  activity: "Activity",
};

function signalLabel(key: string): string {
  return SIGNAL_LABELS[key] ?? key;
}
