/**
 * Trader DNA Engine - evolving trait vector, not static labels.
 *
 * Instead of winner-take-all personality assignment, every trader carries a
 * continuous 0–1 trait vector. Each analysis run computes a fresh "observed"
 * vector from current behavior, then blends it into the stored vector with an
 * exponential moving average - so identity evolves smoothly instead of
 * flip-flopping between labels.
 *
 * Archetypes are display projections over the vector. Adding a new archetype
 * is a data change (one entry in ARCHETYPES), never a logic rewrite.
 */

import { dbGet, dbRun } from "./database.js";
import type { TradingMetrics } from "./real-trading-math.js";
import type { SignalResult } from "./real-trading-signals.js";

export const DNA_TRAITS = [
  "momentum",
  "patience",
  "conviction",
  "risk_tolerance",
  "diversification",
  "discipline",
  "recovery",
  "rotation",
  "scalping",
  "swing",
  "fomo",
] as const;

export type DnaTrait = (typeof DNA_TRAITS)[number];
export type DnaVector = Record<DnaTrait, number>;

/** EMA blend factor: 30% new observation, 70% established identity. */
const EVOLUTION_ALPHA = 0.3;
/** A trait shift larger than this counts as "personality evolved". */
export const EVOLUTION_THRESHOLD = 0.12;

export interface ArchetypeDefinition {
  id: string;
  label: string;
  description: string;
  /** Trait requirements - all must hold for this archetype to be eligible. */
  requires: Partial<Record<DnaTrait, { min?: number; max?: number }>>;
  /** Ranking score among eligible archetypes: sum of these trait values. */
  scoreTraits: DnaTrait[];
}

export const ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: "momentum_hunter",
    label: "Momentum Hunter",
    description:
      "Quick, precise entries on momentum moves. You strike fast and rotate before the crowd.",
    requires: { momentum: { min: 0.55 }, scalping: { min: 0.4 } },
    scoreTraits: ["momentum", "scalping"],
  },
  {
    id: "liquidity_sniper",
    label: "Liquidity Sniper",
    description:
      "Surgical timing on entries and exits - you capture the meat of the move and leave.",
    requires: { momentum: { min: 0.5 }, discipline: { min: 0.5 } },
    scoreTraits: ["momentum", "discipline"],
  },
  {
    id: "swing_trader",
    label: "Swing Trader",
    description:
      "Patient multi-day holds with measured risk. You wait for setups and manage exits deliberately.",
    requires: { swing: { min: 0.5 }, patience: { min: 0.4 } },
    scoreTraits: ["swing", "patience", "discipline"],
  },
  {
    id: "narrative_trader",
    label: "Narrative Trader",
    description:
      "You rotate across tokens as themes evolve, following narratives rather than single plays.",
    requires: { rotation: { min: 0.55 }, diversification: { min: 0.45 } },
    scoreTraits: ["rotation", "diversification"],
  },
  {
    id: "diamond_hands",
    label: "Diamond Hands",
    description:
      "You hold through pain and rarely panic. Conviction and patience define your edge.",
    requires: { patience: { min: 0.6 }, conviction: { min: 0.45 } },
    scoreTraits: ["patience", "conviction", "recovery"],
  },
  {
    id: "profit_taker",
    label: "Profit Taker",
    description:
      "Strong exits are your specialty - you lock in wins consistently and avoid round trips.",
    requires: { discipline: { min: 0.6 }, patience: { max: 0.5 } },
    scoreTraits: ["discipline", "momentum"],
  },
  {
    id: "recovery_specialist",
    label: "Recovery Specialist",
    description:
      "You absorb drawdowns and claw back. Resilience through volatility is your signature.",
    requires: { recovery: { min: 0.6 } },
    scoreTraits: ["recovery", "patience"],
  },
  {
    id: "disciplined_investor",
    label: "Disciplined Investor",
    description:
      "Measured sizing, controlled risk, steady process. The professional's approach.",
    requires: { discipline: { min: 0.65 }, risk_tolerance: { max: 0.5 } },
    scoreTraits: ["discipline", "diversification"],
  },
  {
    id: "high_conviction",
    label: "High Conviction Trader",
    description:
      "Fewer trades, larger bets, strong thesis-driven entries. You size up when you believe.",
    requires: { conviction: { min: 0.6 } },
    scoreTraits: ["conviction", "patience"],
  },
  {
    id: "volatility_hunter",
    label: "Volatility Hunter",
    description:
      "You thrive in fast markets - high activity, rapid rotation, comfortable with uncertainty.",
    requires: { risk_tolerance: { min: 0.6 }, momentum: { min: 0.5 } },
    scoreTraits: ["risk_tolerance", "momentum", "rotation"],
  },
  {
    id: "risk_addict",
    label: "Risk Addict",
    description:
      "Maximum exposure, minimum hesitation. Refining discipline would compound your edge.",
    requires: { risk_tolerance: { min: 0.75 }, discipline: { max: 0.4 } },
    scoreTraits: ["risk_tolerance", "fomo"],
  },
  {
    id: "degen_gambler",
    label: "Degenerate Gambler",
    description:
      "FOMO entries and panic exits dominate right now. BlackPebble will track your evolution.",
    requires: { fomo: { min: 0.6 }, discipline: { max: 0.35 } },
    scoreTraits: ["fomo", "risk_tolerance"],
  },
  {
    id: "emerging_trader",
    label: "Emerging Trader",
    description:
      "Building your track record. Your DNA sharpens as more trades are analyzed.",
    requires: {},
    scoreTraits: [],
  },
];

export interface TraderDna {
  vector: DnaVector;
  primaryArchetype: string;
  primaryLabel: string;
  primaryDescription: string;
  secondaryArchetype: string | null;
  secondaryLabel: string | null;
  confidence: number;
  /** Traits whose EMA moved beyond EVOLUTION_THRESHOLD this run. */
  evolvedTraits: DnaTrait[];
  /** True when the primary archetype changed from the stored one. */
  archetypeChanged: boolean;
  version: number;
}

/** Observe the current trait vector from this run's metrics + signals + tags. */
export function observeDnaVector(
  metrics: TradingMetrics,
  signals: SignalResult[],
  behaviorTags: string[],
): DnaVector {
  const sig = (key: string): number =>
    (signals.find((s) => s.key === key)?.value ?? 50) / 100;

  const medianHoldDays = metrics.medianHoldDurationSec / 86400;

  const momentum = Math.min(
    1,
    metrics.tradingFrequencyPerWeek / 20 +
      (behaviorTags.includes("scalper") ? 0.3 : 0) +
      (behaviorTags.includes("fomo_entries") ? 0.1 : 0),
  );
  const scalping = Math.min(
    1,
    (behaviorTags.includes("scalper") ? 0.6 : 0) +
      (medianHoldDays < 0.05 ? 0.4 : medianHoldDays < 0.5 ? 0.2 : 0),
  );
  const swing = Math.min(
    1,
    (behaviorTags.includes("swing_trader") ? 0.6 : 0) +
      (medianHoldDays >= 1 && medianHoldDays <= 14 ? 0.4 : 0),
  );
  const rotation = Math.min(1, metrics.uniqueTokensTraded / 20);
  const fomo = Math.min(
    1,
    (behaviorTags.includes("fomo_entries") ? 0.55 : 0) +
      (behaviorTags.includes("panic_seller") ? 0.35 : 0),
  );

  return {
    momentum,
    patience: sig("patience"),
    conviction: sig("conviction"),
    risk_tolerance: sig("risk"),
    diversification: sig("diversification"),
    discipline: sig("discipline"),
    recovery: sig("recovery"),
    rotation,
    scalping,
    swing,
    fomo,
  };
}

/** Blend an observed vector into the stored one (EMA). Pure. */
export function evolveVector(
  previous: DnaVector | null,
  observed: DnaVector,
): { vector: DnaVector; evolvedTraits: DnaTrait[] } {
  if (!previous) return { vector: observed, evolvedTraits: [] };
  const vector = {} as DnaVector;
  const evolvedTraits: DnaTrait[] = [];
  for (const trait of DNA_TRAITS) {
    const prev = previous[trait] ?? 0.5;
    const next = prev * (1 - EVOLUTION_ALPHA) + observed[trait] * EVOLUTION_ALPHA;
    vector[trait] = Math.round(next * 1000) / 1000;
    if (Math.abs(vector[trait] - prev) >= EVOLUTION_THRESHOLD) {
      evolvedTraits.push(trait);
    }
  }
  return { vector, evolvedTraits };
}

/** Project archetypes from a vector. Pure. */
export function classifyArchetypes(
  vector: DnaVector,
  totalTrades: number,
): {
  primary: ArchetypeDefinition;
  secondary: ArchetypeDefinition | null;
  confidence: number;
} {
  const fallback = ARCHETYPES[ARCHETYPES.length - 1]!;
  if (totalTrades < 5) {
    return { primary: fallback, secondary: null, confidence: 0.2 };
  }

  const eligible = ARCHETYPES.filter((a) => {
    if (a.id === "emerging_trader") return false;
    for (const [trait, req] of Object.entries(a.requires)) {
      const v = vector[trait as DnaTrait];
      if (req.min != null && v < req.min) return false;
      if (req.max != null && v > req.max) return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    return { primary: fallback, secondary: null, confidence: 0.3 };
  }

  const scored = eligible
    .map((a) => ({
      a,
      score: a.scoreTraits.reduce((s, t) => s + vector[t], 0) / Math.max(1, a.scoreTraits.length),
    }))
    .sort((x, y) => y.score - x.score);

  const primary = scored[0]!;
  const secondary =
    scored.length > 1 && scored[1]!.score >= primary.score - 0.12
      ? scored[1]!.a
      : null;

  const confidence = Math.min(
    1,
    primary.score * 0.7 + Math.min(totalTrades, 50) / 50 * 0.3,
  );

  return { primary: primary.a, secondary, confidence };
}

/**
 * Full DNA update: load stored vector, blend the new observation, classify,
 * persist, and report evolution (for timeline events).
 */
export async function updateTraderDna(
  wallet: string,
  userId: number | null,
  observed: DnaVector,
  totalTrades: number,
  computedAt: number,
): Promise<TraderDna> {
  const stored = await dbGet<{
    dna_vector_json: string;
    primary_archetype: string;
    version: number;
  }>(
    `SELECT dna_vector_json, primary_archetype, version FROM real_trader_dna WHERE wallet = $1`,
    [wallet],
  );

  let previous: DnaVector | null = null;
  if (stored) {
    try {
      previous = JSON.parse(stored.dna_vector_json) as DnaVector;
    } catch {
      previous = null;
    }
  }

  const { vector, evolvedTraits } = evolveVector(previous, observed);
  const { primary, secondary, confidence } = classifyArchetypes(vector, totalTrades);
  const archetypeChanged =
    stored != null && stored.primary_archetype !== primary.id;

  await dbRun(
    `INSERT INTO real_trader_dna
       (wallet, user_id, dna_vector_json, primary_archetype, secondary_archetype, confidence, version, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (wallet) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       dna_vector_json = EXCLUDED.dna_vector_json,
       primary_archetype = EXCLUDED.primary_archetype,
       secondary_archetype = EXCLUDED.secondary_archetype,
       confidence = EXCLUDED.confidence,
       version = real_trader_dna.version + 1,
       computed_at = EXCLUDED.computed_at`,
    [
      wallet,
      userId,
      JSON.stringify(vector),
      primary.id,
      secondary?.id ?? null,
      confidence,
      stored ? stored.version + 1 : 1,
      computedAt,
    ],
  );

  return {
    vector,
    primaryArchetype: primary.id,
    primaryLabel: primary.label,
    primaryDescription: primary.description,
    secondaryArchetype: secondary?.id ?? null,
    secondaryLabel: secondary?.label ?? null,
    confidence,
    evolvedTraits,
    archetypeChanged,
    version: stored ? stored.version + 1 : 1,
  };
}
