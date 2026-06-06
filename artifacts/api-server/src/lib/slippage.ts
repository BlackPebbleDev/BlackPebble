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

// --- Low-data (pre-migration / unreliable liquidity) fallback ---
// Some tokens have a usable price and market cap but missing, zero, or clearly
// unreliable pool-liquidity data (fresh pump.fun mints, Jupiter-only routes,
// DexScreener pairs with a null liquidity field). Rather than block these
// entirely, we simulate depth from the market cap: we treat a small fraction of
// MC as the tradable "liquidity", apply a harsher slippage curve, and cap the
// per-trade impact far more aggressively so only SMALL paper trades are allowed.
// This keeps illiquid tokens tradeable without letting anyone farm fake
// leaderboard PnL on a token whose true depth is unknown.
export const LOW_DATA_LIQUIDITY_FRACTION = 0.01; // simulated depth = 1% of MC
export const LOW_DATA_MAX_IMPACT_PERCENT = 5; // vs 20% with real liquidity

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

/**
 * Harsher slippage tiers used in low-data mode, where impact is measured against
 * a synthetic depth derived from market cap. Penalties are deliberately steeper
 * than the normal curve and the trade is rejected above
 * LOW_DATA_MAX_IMPACT_PERCENT, so only small simulated trades succeed.
 */
const LOW_DATA_TIERS: { maxImpact: number; slippage: number }[] = [
  { maxImpact: 0.5, slippage: 0.01 },
  { maxImpact: 1, slippage: 0.025 },
  { maxImpact: 2, slippage: 0.05 },
  { maxImpact: 3.5, slippage: 0.1 },
  { maxImpact: LOW_DATA_MAX_IMPACT_PERCENT, slippage: 0.2 },
];

function lowDataSlippageForImpact(impactPercent: number): number | null {
  for (const t of LOW_DATA_TIERS) {
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
  /**
   * True when the fill was simulated from market cap because pool liquidity was
   * missing/unreliable (high-risk, smaller-trades-only mode).
   */
  lowData?: boolean;
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
  /** Used as a depth proxy when liquidity is missing/unreliable. */
  marketCapUsd?: number | null;
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

  const hasLiquidity =
    liquidityUsd != null && Number.isFinite(liquidityUsd) && liquidityUsd > 0;

  // --- Low-data fallback: simulate depth from market cap ---
  if (!hasLiquidity) {
    const mc = opts.marketCapUsd;
    const hasMc = mc != null && Number.isFinite(mc) && mc > 0;
    if (!hasMc) {
      // No liquidity AND no usable market cap -> no way to bound the trade.
      return {
        ...base,
        ok: false,
        lowData: true,
        error: "Trading unavailable: insufficient live market data.",
        effectivePriceUsd: rawPriceUsd,
        slippagePercent: 0,
        tradeImpactPercent: 0,
        warningLevel: "none",
      };
    }
    const syntheticDepth = (mc as number) * LOW_DATA_LIQUIDITY_FRACTION;
    const impact = (tradeUsdValue / syntheticDepth) * 100;
    const frac = lowDataSlippageForImpact(impact);
    if (frac == null) {
      return {
        ...base,
        ok: false,
        blocked: true,
        lowData: true,
        error: "Order too large for current simulated liquidity.",
        effectivePriceUsd: rawPriceUsd,
        slippagePercent: 0,
        tradeImpactPercent: impact,
        warningLevel: "extreme",
      };
    }
    const effectivePriceUsd =
      side === "buy" ? rawPriceUsd * (1 + frac) : rawPriceUsd * (1 - frac);
    return {
      ...base,
      ok: true,
      lowData: true,
      effectivePriceUsd,
      slippagePercent: frac * 100,
      tradeImpactPercent: impact,
      // Always flag low-data fills as extreme risk so the UI warns the trader.
      warningLevel: "extreme",
    };
  }

  const tradeImpactPercent = (tradeUsdValue / (liquidityUsd as number)) * 100;
  const frac = slippageForImpact(tradeImpactPercent);

  if (frac == null) {
    return {
      ...base,
      ok: false,
      blocked: true,
      error: "Order too large for current simulated liquidity.",
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
