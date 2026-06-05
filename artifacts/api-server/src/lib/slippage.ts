/**
 * Liquidity-based slippage simulation for paper trades.
 *
 * Real DEX fills move price against the trader in proportion to how large the
 * order is relative to pool liquidity. We approximate that with a tiered model
 * so paper trading feels closer to live conditions and — crucially — so a user
 * cannot farm fake leaderboard PnL by "buying" an enormous amount of a tiny,
 * illiquid token at its quoted price.
 *
 * This module is the single source of truth for the model: both the pre-trade
 * quote endpoint and the actual execution path call computeSlippage(), so the
 * estimate the user sees is exactly what gets applied.
 */

// A single trade may never exceed this share of pool liquidity.
export const MAX_TRADE_IMPACT_PERCENT = 20;
// Soft warnings shown before execution (the trade still goes through).
export const HIGH_IMPACT_WARNING_PERCENT = 5;
export const EXTREME_IMPACT_WARNING_PERCENT = 10;

/**
 * Slippage tiers keyed by trade impact (trade USD value as a % of pool
 * liquidity USD). `maxImpact` is the inclusive upper bound of the tier and
 * `slippage` is the fractional price penalty applied (0.0025 = 0.25%).
 */
const TIERS: { maxImpact: number; slippage: number }[] = [
  { maxImpact: 0.5, slippage: 0.0025 },
  { maxImpact: 1, slippage: 0.0075 },
  { maxImpact: 3, slippage: 0.02 },
  { maxImpact: 5, slippage: 0.05 },
  { maxImpact: 10, slippage: 0.12 },
  { maxImpact: MAX_TRADE_IMPACT_PERCENT, slippage: 0.25 },
];

/**
 * Fractional slippage for a given impact percent, or null when the trade is too
 * large for available liquidity (impact above MAX_TRADE_IMPACT_PERCENT).
 */
export function slippageForImpact(impactPercent: number): number | null {
  for (const t of TIERS) {
    if (impactPercent <= t.maxImpact) return t.slippage;
  }
  return null;
}

export type WarningLevel = "none" | "high" | "extreme";

export interface SlippageQuote {
  ok: boolean;
  /** Set when the trade is rejected (no usable liquidity, or too large). */
  error?: string;
  /** True specifically when the trade is rejected for exceeding max impact. */
  blocked?: boolean;
  liquidityUsd: number;
  solUsd: number;
  rawPriceUsd: number;
  effectivePriceUsd: number;
  /** Slippage as a percent, e.g. 5 for 5%. */
  slippagePercent: number;
  /** Trade size as a percent of pool liquidity, e.g. 3.8. */
  tradeImpactPercent: number;
  tradeUsdValue: number;
  warningLevel: WarningLevel;
}

function warningFor(impactPercent: number): WarningLevel {
  if (impactPercent > EXTREME_IMPACT_WARNING_PERCENT) return "extreme";
  if (impactPercent > HIGH_IMPACT_WARNING_PERCENT) return "high";
  return "none";
}

/**
 * Compute the simulated effective execution price for a trade.
 *
 * - Liquidity must be a finite, positive number, otherwise the trade is
 *   rejected ("Liquidity data unavailable").
 * - Impact above MAX_TRADE_IMPACT_PERCENT is rejected ("Trade too large").
 * - Buys execute at a higher price (raw * (1 + slippage)); sells at a lower
 *   price (raw * (1 - slippage)).
 */
export function computeSlippage(opts: {
  side: "buy" | "sell";
  rawPriceUsd: number;
  solUsd: number;
  liquidityUsd: number | null | undefined;
  tradeUsdValue: number;
}): SlippageQuote {
  const { side, rawPriceUsd, solUsd, tradeUsdValue } = opts;
  const liquidityUsd = opts.liquidityUsd;

  const base: Omit<
    SlippageQuote,
    "ok" | "effectivePriceUsd" | "slippagePercent" | "tradeImpactPercent" | "warningLevel"
  > = {
    liquidityUsd: Number.isFinite(liquidityUsd as number) ? (liquidityUsd as number) : 0,
    solUsd,
    rawPriceUsd,
    tradeUsdValue,
  };

  if (
    liquidityUsd == null ||
    !Number.isFinite(liquidityUsd) ||
    liquidityUsd <= 0
  ) {
    return {
      ...base,
      ok: false,
      error: "Liquidity data unavailable. Trade not executed.",
      effectivePriceUsd: rawPriceUsd,
      slippagePercent: 0,
      tradeImpactPercent: 0,
      warningLevel: "none",
    };
  }

  const tradeImpactPercent = (tradeUsdValue / liquidityUsd) * 100;
  const frac = slippageForImpact(tradeImpactPercent);

  if (frac == null) {
    return {
      ...base,
      ok: false,
      blocked: true,
      error: "Trade too large for available liquidity.",
      effectivePriceUsd: rawPriceUsd,
      slippagePercent: 0,
      tradeImpactPercent,
      warningLevel: "extreme",
    };
  }

  const effectivePriceUsd =
    side === "buy" ? rawPriceUsd * (1 + frac) : rawPriceUsd * (1 - frac);

  return {
    ...base,
    ok: true,
    effectivePriceUsd,
    slippagePercent: frac * 100,
    tradeImpactPercent,
    warningLevel: warningFor(tradeImpactPercent),
  };
}
