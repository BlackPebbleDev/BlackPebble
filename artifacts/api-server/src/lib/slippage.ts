/**
 * Liquidity-based slippage simulation for paper trades.
 *
 * Real DEX fills move price against the trader in proportion to how large the
 * order is relative to pool liquidity. We approximate that with a tiered model
 * so paper trading feels closer to live conditions and - crucially - so a user
 * cannot farm fake leaderboard PnL by "buying" an enormous amount of a tiny,
 * illiquid token at its quoted price.
 *
 * Design principle (BlackPebble): low-cap meme tokens MUST stay tradable. Normal
 * degen-sized entries are never rejected just because liquidity data is missing
 * or thin - instead we estimate depth from market cap, apply heavier slippage,
 * and only hard-reject trades that are extremely oversized relative to the
 * token's market cap. Prefer a slippage penalty over an outright rejection.
 *
 * This module is the single source of truth for the model: the pre-trade quote
 * endpoint, the spot execution path and the leverage path all call
 * computeSlippage(), so the estimate the user sees is exactly what gets applied.
 */

// A single trade may never exceed this share of REAL pool liquidity.
export const MAX_TRADE_IMPACT_PERCENT = 20;
// Soft warnings shown before execution (the trade still goes through).
export const HIGH_IMPACT_WARNING_PERCENT = 5;
export const EXTREME_IMPACT_WARNING_PERCENT = 10;

// --- Low-data (pre-migration / unreliable liquidity) fallback ---
// Some tokens have a usable price and market cap but missing, zero, or clearly
// unreliable pool-liquidity data (fresh pump.fun mints, Jupiter-only routes,
// DexScreener pairs with a null liquidity field). Rather than block these, we
// estimate tradable depth from the market cap, apply a harsher slippage curve,
// and only reject trades that are extremely large relative to the market cap.
//   estimatedLiquidityUsd = max(marketCapUsd * 0.03, 500)
export const LOW_DATA_LIQUIDITY_FRACTION = 0.03; // estimated depth = 3% of MC
export const LOW_DATA_MIN_LIQUIDITY_USD = 500; // floor for estimated depth
// In low-data mode a trade is only hard-rejected when it exceeds this share of
// the token's market cap (e.g. a $5k buy into a $6k-MC token). Everything below
// this is allowed and simply pays steeper slippage.
export const LOW_DATA_MAX_TRADE_FRACTION_OF_MC = 0.25; // 25% of MC

/**
 * Minimum trade size (USD) that is ALWAYS allowed for a given market cap, no
 * matter how thin or unreliable the liquidity data is. Trades at or below this
 * floor are never rejected - they only pay (possibly steep) slippage. This is
 * what keeps normal degen-sized entries working on low-cap tokens.
 *
 *   MCAP < $10k    -> $25
 *   MCAP $10k-$25k -> $50
 *   MCAP $25k-$100k-> $100
 *   MCAP $100k-500k-> $250
 *   MCAP $500k+    -> 0 (governed entirely by the liquidity/impact model)
 */
export function minGuaranteedTradeUsd(
  marketCapUsd: number | null | undefined,
): number {
  const mc = marketCapUsd;
  if (mc == null || !Number.isFinite(mc) || mc <= 0) return 25;
  if (mc < 10_000) return 25;
  if (mc < 25_000) return 50;
  if (mc < 100_000) return 100;
  if (mc < 500_000) return 250;
  return 0;
}

/** Estimated tradable depth (USD) derived from market cap for low-data mode. */
export function estimatedLiquidityFromMc(marketCapUsd: number): number {
  return Math.max(
    marketCapUsd * LOW_DATA_LIQUIDITY_FRACTION,
    LOW_DATA_MIN_LIQUIDITY_USD,
  );
}

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

/** Steepest normal-liquidity penalty, used to clamp guaranteed small trades. */
const MAX_TIER_SLIPPAGE = TIERS[TIERS.length - 1].slippage;

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
 * the synthetic depth derived from market cap. Penalties are deliberately
 * steeper than the normal curve. Unlike the normal curve this NEVER returns
 * null - impact above the top tier clamps to LOW_DATA_MAX_SLIPPAGE, because the
 * accept/reject decision in low-data mode is made against market cap, not here.
 */
const LOW_DATA_TIERS: { maxImpact: number; slippage: number }[] = [
  { maxImpact: 1, slippage: 0.01 },
  { maxImpact: 3, slippage: 0.025 },
  { maxImpact: 5, slippage: 0.05 },
  { maxImpact: 10, slippage: 0.1 },
  { maxImpact: 20, slippage: 0.18 },
  { maxImpact: 50, slippage: 0.3 },
  { maxImpact: 100, slippage: 0.45 },
];
const LOW_DATA_MAX_SLIPPAGE = 0.6;

function lowDataSlippageForImpact(impactPercent: number): number {
  for (const t of LOW_DATA_TIERS) {
    if (impactPercent <= t.maxImpact) return t.slippage;
  }
  return LOW_DATA_MAX_SLIPPAGE;
}

export type WarningLevel = "none" | "high" | "extreme";

export interface SlippageQuote {
  ok: boolean;
  /** Set when the trade is rejected (no usable market data, or too large). */
  error?: string;
  /** True specifically when the trade is rejected for being too large. */
  blocked?: boolean;
  /**
   * True when the fill was simulated from market cap because pool liquidity was
   * missing/unreliable (high-risk, heavier-slippage mode).
   */
  lowData?: boolean;
  liquidityUsd: number;
  solUsd: number;
  rawPriceUsd: number;
  effectivePriceUsd: number;
  /** Slippage as a percent, e.g. 5 for 5%. */
  slippagePercent: number;
  /** Trade size as a percent of (real or estimated) liquidity, e.g. 3.8. */
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
 * - With real pool liquidity: tiered impact model, capped at
 *   MAX_TRADE_IMPACT_PERCENT - except a guaranteed small trade (see
 *   minGuaranteedTradeUsd) is always allowed at the steepest penalty.
 * - Without usable liquidity: estimate depth from market cap, apply the harsher
 *   low-data curve, and only reject when the trade is extremely oversized
 *   relative to market cap (and above the guaranteed floor).
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
  const mc = opts.marketCapUsd;
  const hasMc = mc != null && Number.isFinite(mc) && mc > 0;

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

  // A trade at or below this size is never rejected - it only pays slippage.
  // The floor is a market-cap-derived allowance, so it only applies when MC is
  // known. Without a usable MC we cannot tell whether a trade is genuinely small
  // relative to the token, so the honest liquidity-impact cap governs and there
  // is no bypass - this prevents farming the per-trade cap on MC-less tokens via
  // repeated tiny trades into a thin real pool.
  const guaranteedFloorUsd = hasMc ? minGuaranteedTradeUsd(mc as number) : 0;
  const isGuaranteed = guaranteedFloorUsd > 0 && tradeUsdValue <= guaranteedFloorUsd;

  const priced = (frac: number): number =>
    side === "buy" ? rawPriceUsd * (1 + frac) : rawPriceUsd * (1 - frac);

  // --- Real pool liquidity present: honest impact model ---
  if (hasLiquidity) {
    const tradeImpactPercent = (tradeUsdValue / (liquidityUsd as number)) * 100;
    let frac = slippageForImpact(tradeImpactPercent);
    if (frac == null) {
      // Above the normal cap. Allow guaranteed small entries at the steepest
      // penalty; otherwise reject as too large for available liquidity.
      if (!isGuaranteed) {
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
      frac = MAX_TIER_SLIPPAGE;
    }
    return {
      ...base,
      ok: true,
      effectivePriceUsd: priced(frac),
      slippagePercent: frac * 100,
      tradeImpactPercent,
      warningLevel: warningFor(tradeImpactPercent),
    };
  }

  // --- Low-data fallback: estimate depth from market cap ---
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

  const estLiquidityUsd = estimatedLiquidityFromMc(mc as number);
  const impact = (tradeUsdValue / estLiquidityUsd) * 100;

  // Reject ONLY trades that are extremely oversized relative to market cap, and
  // never a guaranteed small entry.
  const extremelyOversized =
    !isGuaranteed && tradeUsdValue > (mc as number) * LOW_DATA_MAX_TRADE_FRACTION_OF_MC;
  if (extremelyOversized) {
    return {
      ...base,
      liquidityUsd: estLiquidityUsd,
      ok: false,
      blocked: true,
      lowData: true,
      error: "Order too large for this token's market cap.",
      effectivePriceUsd: rawPriceUsd,
      slippagePercent: 0,
      tradeImpactPercent: impact,
      warningLevel: "extreme",
    };
  }

  const frac = lowDataSlippageForImpact(impact);
  return {
    ...base,
    liquidityUsd: estLiquidityUsd,
    ok: true,
    lowData: true,
    effectivePriceUsd: priced(frac),
    slippagePercent: frac * 100,
    tradeImpactPercent: impact,
    // Low-data fills always carry at least a "high" warning because the depth is
    // estimated, escalating to "extreme" for large impact.
    warningLevel: impact > EXTREME_IMPACT_WARNING_PERCENT ? "extreme" : "high",
  };
}
