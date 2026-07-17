/**
 * Liquidity Intelligence (Phase 2C, Part 8).
 *
 * Adds liquidity-aware analysis WITHOUT overstating precision. We classify
 * rather than claim exact execution outcomes: no fake slippage numbers. Current
 * holdings liquidity comes from live DexScreener pool liquidity; historical
 * trade liquidity is only reported when a source genuinely supplied it, and is
 * kept strictly separate from current liquidity.
 *
 * Calm classification bands: Deep / Adequate / Thin / Fragile / Unavailable.
 *
 * Pure - no I/O, fully testable.
 */

import type { ConfidenceTier } from "./real-trading-confidence.js";

export type LiquidityBand =
  | "deep"
  | "adequate"
  | "thin"
  | "fragile"
  | "unavailable";

export type Exitability =
  | "easy"
  | "moderate"
  | "difficult"
  | "severe"
  | "unknown";

/** Absolute-liquidity bands (USD). Documented, tested. */
const DEEP_USD = 250_000;
const ADEQUATE_USD = 50_000;
const THIN_USD = 10_000;

export function classifyLiquidityBand(liquidityUsd: number | null): LiquidityBand {
  if (liquidityUsd == null || !(liquidityUsd > 0)) return "unavailable";
  if (liquidityUsd >= DEEP_USD) return "deep";
  if (liquidityUsd >= ADEQUATE_USD) return "adequate";
  if (liquidityUsd >= THIN_USD) return "thin";
  return "fragile";
}

/** Exitability from holding-value-to-liquidity ratio (percent). */
export function classifyExitability(
  holdingToLiquidityPct: number | null,
): Exitability {
  if (holdingToLiquidityPct == null) return "unknown";
  if (holdingToLiquidityPct < 1) return "easy";
  if (holdingToLiquidityPct < 5) return "moderate";
  if (holdingToLiquidityPct < 15) return "difficult";
  return "severe";
}

export interface CurrentLiquidityInput {
  mint: string;
  symbol: string | null;
  holdingValueUsd: number | null;
  liquidityUsd: number | null;
}

export interface HoldingLiquidity {
  mint: string;
  symbol: string | null;
  liquidityUsd: number | null;
  holdingValueUsd: number | null;
  holdingToLiquidityPct: number | null;
  band: LiquidityBand;
  exitability: Exitability;
  unpriced: boolean;
  missingLiquidity: boolean;
  limitations: string[];
}

export interface LiquidityRiskSummary {
  scope: "current";
  positions: HoldingLiquidity[];
  pricedHoldingsCoverage: number;
  liquidityCoverage: number;
  /** Value-weighted liquidity band as a 0..100 quality score. */
  weightedLiquidityQuality: number | null;
  largestHoldingToLiquidityPct: number | null;
  fragilePositionsCount: number;
  unavailablePositionsCount: number;
  confidence: ConfidenceTier;
  limitations: string[];
}

const BAND_QUALITY: Record<LiquidityBand, number> = {
  deep: 100,
  adequate: 75,
  thin: 45,
  fragile: 20,
  unavailable: 0,
};

/** Classify a single current holding's liquidity. */
export function classifyHoldingLiquidity(
  input: CurrentLiquidityInput,
): HoldingLiquidity {
  const unpriced = input.holdingValueUsd == null;
  const missingLiquidity = input.liquidityUsd == null;
  const band = classifyLiquidityBand(input.liquidityUsd);
  const ratio =
    input.holdingValueUsd != null &&
    input.liquidityUsd != null &&
    input.liquidityUsd > 0
      ? (input.holdingValueUsd / input.liquidityUsd) * 100
      : null;
  const limitations: string[] = [];
  if (unpriced) limitations.push("Position is unpriced; value estimate unavailable.");
  if (missingLiquidity) limitations.push("Pool liquidity unavailable for this token.");
  return {
    mint: input.mint,
    symbol: input.symbol,
    liquidityUsd: input.liquidityUsd,
    holdingValueUsd: input.holdingValueUsd,
    holdingToLiquidityPct: ratio,
    band,
    exitability: classifyExitability(ratio),
    unpriced,
    missingLiquidity,
    limitations,
  };
}

/**
 * Build the current-holdings liquidity risk summary. Operates ONLY on current
 * reconciled holdings - never on historical trades.
 */
export function computeCurrentLiquidityRisk(
  inputs: CurrentLiquidityInput[],
): LiquidityRiskSummary {
  const positions = inputs.map(classifyHoldingLiquidity);
  const priced = positions.filter((p) => !p.unpriced);
  const withLiquidity = positions.filter((p) => !p.missingLiquidity);

  let weightedQualityNum = 0;
  let weightedQualityDen = 0;
  let largestRatio: number | null = null;
  for (const p of positions) {
    if (p.holdingValueUsd != null && p.holdingValueUsd > 0) {
      weightedQualityNum += BAND_QUALITY[p.band] * p.holdingValueUsd;
      weightedQualityDen += p.holdingValueUsd;
    }
    if (p.holdingToLiquidityPct != null) {
      largestRatio =
        largestRatio == null
          ? p.holdingToLiquidityPct
          : Math.max(largestRatio, p.holdingToLiquidityPct);
    }
  }

  const limitations: string[] = [];
  if (positions.length === 0) {
    limitations.push("No current holdings to assess for liquidity.");
  }
  if (withLiquidity.length < positions.length) {
    limitations.push(
      `${positions.length - withLiquidity.length} holding(s) had no pool liquidity data.`,
    );
  }

  const liquidityCoverage =
    positions.length > 0 ? withLiquidity.length / positions.length : 0;
  const confidence: ConfidenceTier =
    positions.length === 0
      ? "insufficient"
      : liquidityCoverage >= 0.66
        ? "high"
        : liquidityCoverage >= 0.33
          ? "medium"
          : "low";

  return {
    scope: "current",
    positions,
    pricedHoldingsCoverage:
      positions.length > 0 ? priced.length / positions.length : 0,
    liquidityCoverage,
    weightedLiquidityQuality:
      weightedQualityDen > 0
        ? Math.round(weightedQualityNum / weightedQualityDen)
        : null,
    largestHoldingToLiquidityPct: largestRatio,
    fragilePositionsCount: positions.filter((p) => p.band === "fragile").length,
    unavailablePositionsCount: positions.filter(
      (p) => p.band === "unavailable",
    ).length,
    confidence,
    limitations,
  };
}
