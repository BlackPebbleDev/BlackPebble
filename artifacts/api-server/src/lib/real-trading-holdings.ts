/**
 * Current Holdings Quality & Conviction (Phase 2B, Part 7).
 *
 * Operates ONLY on already-reconciled, live-verified open positions passed in by
 * the engine (it never sees raw FIFO leftovers), so it can never resurrect a
 * ghost position. Pure and testable. Dimensions that cannot be computed from the
 * available data are marked `available: false` rather than invented.
 */

import type { OpenPosition } from "./real-trading-math.js";

export type PositionClass =
  | "core"
  | "high_conviction"
  | "oversized"
  | "small_speculative"
  | "dust"
  | "unpriced"
  | "recently_opened"
  | "long_held";

export interface HoldingQuality {
  tokenMint: string;
  symbol: string | null;
  logo: string | null;
  currentValueSol: number | null;
  costBasisSol: number;
  unrealizedPnlSol: number | null;
  /** Share of the priced current portfolio (0-100); null when unpriced. */
  sharePercent: number | null;
  /** Seconds since first acquired. */
  ageSec: number;
  /** Cost basis relative to the trader's historical median entry (null if n/a). */
  sizeVsMedian: number | null;
  /** Primary classification label. */
  classification: PositionClass;
  /** Additional descriptive tags. */
  tags: PositionClass[];
}

export interface QualityDimension {
  key: string;
  label: string;
  /** 0-100 where higher is healthier, or null when unavailable. */
  value: number | null;
  available: boolean;
  note: string;
}

export interface HoldingsQuality {
  holdingsVerified: boolean;
  positions: HoldingQuality[];
  /** Largest single-position share of the priced portfolio (0-100). */
  concentrationPercent: number | null;
  dimensions: QualityDimension[];
  limitations: string[];
}

const DUST_VALUE_SOL = 0.01;
const RECENT_AGE_SEC = 3 * 86400;
const LONG_HELD_AGE_SEC = 30 * 86400;
const OVERSIZED_SHARE = 40;
const CORE_SHARE = 15;
const SMALL_SHARE = 5;
const HIGH_CONVICTION_MULTIPLE = 2;

/**
 * Classify verified current holdings and summarise portfolio-quality
 * dimensions. `historicalMedianEntrySol` is the trader's typical historical buy
 * size, used only to describe relative sizing (never to value a position).
 */
export function computeHoldingsQuality(
  positions: OpenPosition[],
  holdingsVerified: boolean,
  historicalMedianEntrySol: number,
  nowSec: number = Math.floor(Date.now() / 1000),
): HoldingsQuality {
  if (!holdingsVerified || positions.length === 0) {
    return {
      holdingsVerified,
      positions: [],
      concentrationPercent: null,
      dimensions: [],
      limitations: holdingsVerified
        ? ["No verified current positions to analyze."]
        : ["Live holdings could not be verified, so holdings quality is unavailable."],
    };
  }

  const pricedValueTotal = positions.reduce(
    (s, p) => s + (p.currentValueSol ?? 0),
    0,
  );
  const pricedCount = positions.filter((p) => p.currentValueSol != null).length;

  const enriched: HoldingQuality[] = positions.map((p) => {
    const value = p.currentValueSol;
    const sharePercent =
      value != null && pricedValueTotal > 0
        ? (value / pricedValueTotal) * 100
        : null;
    const ageSec = Math.max(0, nowSec - p.firstAcquiredAt);
    const sizeVsMedian =
      historicalMedianEntrySol > 0
        ? p.costBasisSol / historicalMedianEntrySol
        : null;

    const tags: PositionClass[] = [];
    let classification: PositionClass;
    if (value == null) {
      classification = "unpriced";
    } else if (value < DUST_VALUE_SOL) {
      classification = "dust";
    } else if (sharePercent != null && sharePercent >= OVERSIZED_SHARE) {
      classification = "oversized";
    } else if (
      sizeVsMedian != null &&
      sizeVsMedian >= HIGH_CONVICTION_MULTIPLE
    ) {
      classification = "high_conviction";
    } else if (sharePercent != null && sharePercent >= CORE_SHARE) {
      classification = "core";
    } else if (sharePercent != null && sharePercent < SMALL_SHARE) {
      classification = "small_speculative";
    } else {
      classification = "core";
    }
    if (ageSec <= RECENT_AGE_SEC) tags.push("recently_opened");
    if (ageSec >= LONG_HELD_AGE_SEC) tags.push("long_held");

    return {
      tokenMint: p.tokenMint,
      symbol: p.symbol,
      logo: p.logo,
      currentValueSol: value,
      costBasisSol: p.costBasisSol,
      unrealizedPnlSol: p.unrealizedPnlSol,
      sharePercent,
      ageSec,
      sizeVsMedian,
      classification,
      tags,
    };
  });

  const shares = enriched
    .map((p) => p.sharePercent)
    .filter((s): s is number => s != null);
  const concentrationPercent = shares.length > 0 ? Math.max(...shares) : null;

  // Position-sizing health: how evenly the priced portfolio is distributed.
  // 100 = perfectly even, lower = one position dominates.
  let sizingHealth: number | null = null;
  if (shares.length > 0) {
    const herfindahl = shares.reduce((s, sh) => s + (sh / 100) ** 2, 0);
    sizingHealth = Math.round(Math.max(0, Math.min(1, 1 - herfindahl)) * 100);
  }

  const pricingCoverage =
    positions.length > 0
      ? Math.round((pricedCount / positions.length) * 100)
      : null;

  const dimensions: QualityDimension[] = [
    {
      key: "concentration",
      label: "Concentration",
      value:
        concentrationPercent != null
          ? Math.round(100 - concentrationPercent)
          : null,
      available: concentrationPercent != null,
      note: "Higher is healthier: your largest position takes a smaller share of the priced portfolio.",
    },
    {
      key: "pricing_coverage",
      label: "Pricing Coverage",
      value: pricingCoverage,
      available: pricingCoverage != null,
      note: "Share of your current holdings we could price.",
    },
    {
      key: "position_sizing",
      label: "Position Sizing",
      value: sizingHealth,
      available: sizingHealth != null,
      note: "How evenly value is spread across your current positions.",
    },
    {
      key: "liquidity_coverage",
      label: "Liquidity Coverage",
      value: null,
      available: false,
      note: "Per-token liquidity depth is not yet available in this analysis.",
    },
  ];

  const limitations: string[] = [
    "Reflects only live-verified, traced current holdings; untraced tokens are excluded.",
  ];
  if (pricingCoverage != null && pricingCoverage < 100) {
    limitations.push("Some current holdings could not be priced and are excluded from shares.");
  }

  return {
    holdingsVerified,
    positions: enriched,
    concentrationPercent,
    dimensions,
    limitations,
  };
}
