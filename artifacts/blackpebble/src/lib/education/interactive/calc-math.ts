/**
 * Pure calculation helpers for Academy calculator/simulator modules. Every
 * function is deterministic, guards against invalid input, and is independently
 * tested. UI modules stay thin over these functions.
 *
 * All models are intentionally simplified for teaching and clearly labelled as
 * such in the UI. They describe illustrative scenarios only and never predict
 * real market outcomes.
 */

function num(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function nonNeg(v: number | undefined): number {
  return Math.max(0, num(v));
}

// ── Market cap ──────────────────────────────────────────────────────────────

export function marketCap(price: number, circulatingSupply: number): number {
  return nonNeg(price) * nonNeg(circulatingSupply);
}

export function priceFromCap(cap: number, supply: number): number {
  const s = nonNeg(supply);
  return s > 0 ? nonNeg(cap) / s : 0;
}

// ── Market cap vs FDV ─────────────────────────────────────────────────────────

export interface FdvInputs {
  price: number;
  circulatingSupply: number;
  totalSupply: number;
}

export interface FdvResult {
  marketCap: number;
  fdv: number;
  circulatingPct: number;
  valuationGap: number;
  lockedSupply: number;
  lockedPct: number;
}

export function computeFdv(input: FdvInputs): FdvResult {
  const price = nonNeg(input.price);
  const circ = nonNeg(input.circulatingSupply);
  // Total supply can never be below circulating supply.
  const total = Math.max(circ, nonNeg(input.totalSupply));
  const cap = price * circ;
  const fdv = price * total;
  const locked = total - circ;
  return {
    marketCap: cap,
    fdv,
    circulatingPct: total > 0 ? (circ / total) * 100 : 0,
    valuationGap: fdv - cap,
    lockedSupply: locked,
    lockedPct: total > 0 ? (locked / total) * 100 : 0,
  };
}

// ── Liquidity / price impact (simplified constant-product) ────────────────────

export type TradeDirection = "buy" | "sell";

export interface ImpactInputs {
  liquidityUsd: number;
  tradeSizeUsd: number;
  direction: TradeDirection;
}

export interface ImpactResult {
  priceImpactPct: number;
  pctOfLiquidity: number;
  reserveUsdBefore: number;
  reserveUsdAfter: number;
  executedPriceRatio: number;
}

/**
 * Simplified constant-product (x*y=k) impact. The pool is modelled with a quote
 * reserve of liquidityUsd/2 and a spot price normalized to 1, which makes impact
 * scale-invariant. Returns absolute price-impact percentage.
 */
export function computeImpact(input: ImpactInputs): ImpactResult {
  const liquidity = nonNeg(input.liquidityUsd);
  const trade = nonNeg(input.tradeSizeUsd);
  const reserve = liquidity / 2;
  if (reserve <= 0 || trade <= 0) {
    return {
      priceImpactPct: 0,
      pctOfLiquidity: 0,
      reserveUsdBefore: reserve,
      reserveUsdAfter: reserve,
      executedPriceRatio: 1,
    };
  }
  const ratio = trade / reserve;
  let executedPriceRatio: number;
  let reserveAfter: number;
  if (input.direction === "sell") {
    // base in -> quote out; executed price = 1/(1+ratio)
    executedPriceRatio = 1 / (1 + ratio);
    reserveAfter = reserve - reserve * (ratio / (1 + ratio));
  } else {
    // quote in -> base out; executed price = 1 + ratio
    executedPriceRatio = 1 + ratio;
    reserveAfter = reserve + trade;
  }
  return {
    priceImpactPct: Math.abs(executedPriceRatio - 1) * 100,
    pctOfLiquidity: liquidity > 0 ? (trade / liquidity) * 100 : 0,
    reserveUsdBefore: reserve,
    reserveUsdAfter: reserveAfter,
    executedPriceRatio,
  };
}

// ── Slippage ──────────────────────────────────────────────────────────────────

export interface SlippageInputs {
  expectedPrice: number;
  tradeSizeUsd: number;
  liquidityUsd: number;
  tolerancePct: number;
  direction: TradeDirection;
}

export interface SlippageResult {
  expectedPrice: number;
  estimatedExecutedPrice: number;
  priceImpactPct: number;
  tolerancePct: number;
  exceedsTolerance: boolean;
  worstCasePrice: number;
}

export function computeSlippage(input: SlippageInputs): SlippageResult {
  const expected = nonNeg(input.expectedPrice);
  const tolerance = nonNeg(input.tolerancePct);
  const impact = computeImpact({
    liquidityUsd: input.liquidityUsd,
    tradeSizeUsd: input.tradeSizeUsd,
    direction: input.direction,
  });
  const executed = expected * impact.executedPriceRatio;
  // Worst acceptable fill given the tolerance the trader set.
  const worst =
    input.direction === "sell"
      ? expected * (1 - tolerance / 100)
      : expected * (1 + tolerance / 100);
  return {
    expectedPrice: expected,
    estimatedExecutedPrice: executed,
    priceImpactPct: impact.priceImpactPct,
    tolerancePct: tolerance,
    exceedsTolerance: impact.priceImpactPct > tolerance,
    worstCasePrice: worst,
  };
}

// ── Stop loss / take profit ───────────────────────────────────────────────────

export interface SlTpInputs {
  entry: number;
  stop: number;
  target: number;
}

export interface SlTpResult {
  downsidePct: number;
  upsidePct: number;
  riskRewardRatio: number | null;
  valid: boolean;
}

export function computeSlTp(input: SlTpInputs): SlTpResult {
  const entry = nonNeg(input.entry);
  const stop = nonNeg(input.stop);
  const target = nonNeg(input.target);
  if (entry <= 0) {
    return { downsidePct: 0, upsidePct: 0, riskRewardRatio: null, valid: false };
  }
  const downsidePct = ((entry - stop) / entry) * 100;
  const upsidePct = ((target - entry) / entry) * 100;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  const rr = risk > 0 ? reward / risk : null;
  const valid = stop < entry && target > entry;
  return {
    downsidePct,
    upsidePct,
    riskRewardRatio: rr,
    valid,
  };
}

// ── Position size ─────────────────────────────────────────────────────────────

export interface PositionSizeInputs {
  accountBalance: number;
  riskPct: number;
  entry: number;
  stop: number;
}

export interface PositionSizeResult {
  riskAmount: number;
  stopDistancePct: number;
  positionSize: number;
  tokenQuantity: number;
  lossAtStop: number;
  valid: boolean;
}

export function computePositionSize(
  input: PositionSizeInputs,
): PositionSizeResult {
  const balance = nonNeg(input.accountBalance);
  const riskPct = nonNeg(input.riskPct);
  const entry = nonNeg(input.entry);
  const stop = nonNeg(input.stop);
  const riskAmount = balance * (riskPct / 100);
  const stopDistance = entry > 0 ? (entry - stop) / entry : 0;
  const valid = entry > 0 && stop < entry && stop >= 0;
  const positionSize = valid && stopDistance > 0 ? riskAmount / stopDistance : 0;
  return {
    riskAmount,
    stopDistancePct: stopDistance * 100,
    positionSize,
    tokenQuantity: entry > 0 ? positionSize / entry : 0,
    lossAtStop: positionSize * stopDistance,
    valid,
  };
}

// ── Holder concentration ──────────────────────────────────────────────────────

export interface ConcentrationResult {
  topHolderPct: number;
  top10Pct: number;
  herfindahl: number;
  band: "distributed" | "moderate" | "concentrated" | "highly-concentrated";
}

/** Allocations are relative weights (need not sum to 100). */
export function computeConcentration(allocations: number[]): ConcentrationResult {
  const weights = allocations.map((a) => nonNeg(a));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) {
    return { topHolderPct: 0, top10Pct: 0, herfindahl: 0, band: "distributed" };
  }
  const pcts = weights.map((w) => (w / total) * 100).sort((a, b) => b - a);
  const topHolderPct = pcts[0] ?? 0;
  const top10Pct = pcts.slice(0, 10).reduce((s, p) => s + p, 0);
  const herfindahl = pcts.reduce((s, p) => s + (p / 100) ** 2, 0);
  let band: ConcentrationResult["band"] = "distributed";
  if (top10Pct >= 80 || topHolderPct >= 40) band = "highly-concentrated";
  else if (top10Pct >= 60 || topHolderPct >= 25) band = "concentrated";
  else if (top10Pct >= 40 || topHolderPct >= 15) band = "moderate";
  return { topHolderPct, top10Pct, herfindahl, band };
}

// ── Bonding curve (simplified linear) ─────────────────────────────────────────

export interface BondingCurveInputs {
  basePrice: number;
  slope: number;
  supplySold: number;
}

export interface BondingCurvePoint {
  price: number;
  /** Cumulative cost to buy from 0 to supplySold (area under the line). */
  cumulativeCost: number;
  averagePrice: number;
}

/**
 * price(s) = basePrice + slope * s. Cost to buy the first `s` units is the
 * integral: basePrice*s + slope*s^2/2. Intentionally simplified; real
 * launchpads use their own curves.
 */
export function bondingCurvePoint(
  input: BondingCurveInputs,
): BondingCurvePoint {
  const base = nonNeg(input.basePrice);
  const slope = nonNeg(input.slope);
  const s = nonNeg(input.supplySold);
  const price = base + slope * s;
  const cumulativeCost = base * s + (slope * s * s) / 2;
  return {
    price,
    cumulativeCost,
    averagePrice: s > 0 ? cumulativeCost / s : base,
  };
}
