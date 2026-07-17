/**
 * Deterministic PnL math for the flagship interactive lesson.
 *
 * Pure, dependency-free, and fully tested. Works entirely with simulated
 * values — it never reads real balances. All figures are hindsight/simulation
 * only and imply nothing about future price movement.
 *
 * Fee model: `feePercent` is charged on the buy notional and on the sell
 * proceeds. Buy fees are allocated proportionally between the sold and retained
 * portions so that combinedPnl === realizedPnl + unrealizedPnl exactly.
 */

export interface PnlInputs {
  /** USD price per token at entry. */
  entryPrice: number;
  /** Tokens acquired at entry. */
  quantity: number;
  /** USD price per token now (values the retained portion). */
  currentPrice: number;
  /** USD price per token for the portion that was sold. */
  exitPrice: number;
  /** Portion of the position sold, 0-100. */
  percentSold: number;
  /** Fee charged per transaction side, as a percent (0-100). */
  feePercent: number;
  /** Adverse slippage applied to the exit fill, as a percent (0-100). */
  slippagePercent: number;
}

export interface PnlResult {
  costBasisTotal: number;
  totalInvested: number;
  buyFees: number;
  soldQuantity: number;
  remainingQuantity: number;
  effectiveExitPrice: number;
  proceeds: number;
  sellFees: number;
  soldCostBasis: number;
  realizedPnl: number;
  remainingCostBasis: number;
  remainingValue: number;
  unrealizedPnl: number;
  combinedPnl: number;
  totalFees: number;
  /** Combined return relative to total invested (cost basis + buy fees). */
  percentReturn: number;
}

function toFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampPercent(value: number): number {
  const v = toFinite(value, 0);
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

function nonNegative(value: number): number {
  const v = toFinite(value, 0);
  return v < 0 ? 0 : v;
}

/** Coerce raw form values into a valid, safe input set. */
export function sanitizePnlInputs(raw: Partial<PnlInputs>): PnlInputs {
  return {
    entryPrice: nonNegative(raw.entryPrice ?? 0),
    quantity: nonNegative(raw.quantity ?? 0),
    currentPrice: nonNegative(raw.currentPrice ?? 0),
    exitPrice: nonNegative(raw.exitPrice ?? 0),
    percentSold: clampPercent(raw.percentSold ?? 0),
    feePercent: clampPercent(raw.feePercent ?? 0),
    slippagePercent: clampPercent(raw.slippagePercent ?? 0),
  };
}

/** Derive token quantity from an investment amount and entry price. */
export function quantityFromInvestment(
  investment: number,
  entryPrice: number,
): number {
  const inv = nonNegative(investment);
  const price = nonNegative(entryPrice);
  if (price === 0) return 0;
  return inv / price;
}

export function computePnl(rawInputs: Partial<PnlInputs>): PnlResult {
  const inputs = sanitizePnlInputs(rawInputs);
  const {
    entryPrice,
    quantity,
    currentPrice,
    exitPrice,
    percentSold,
    feePercent,
    slippagePercent,
  } = inputs;

  const costBasisTotal = entryPrice * quantity;
  const buyFees = costBasisTotal * (feePercent / 100);
  const totalInvested = costBasisTotal + buyFees;

  const soldFraction = percentSold / 100;
  const soldQuantity = quantity * soldFraction;
  const remainingQuantity = quantity - soldQuantity;

  const effectiveExitPrice = exitPrice * (1 - slippagePercent / 100);
  const proceeds = soldQuantity * effectiveExitPrice;
  const sellFees = proceeds * (feePercent / 100);

  const soldCostBasis = soldQuantity * entryPrice;
  const soldBuyFees = buyFees * soldFraction;
  const realizedPnl = proceeds - sellFees - soldCostBasis - soldBuyFees;

  const remainingCostBasis = remainingQuantity * entryPrice;
  const remainingBuyFees = buyFees - soldBuyFees;
  const remainingValue = remainingQuantity * currentPrice;
  const unrealizedPnl = remainingValue - remainingCostBasis - remainingBuyFees;

  const combinedPnl = realizedPnl + unrealizedPnl;
  const totalFees = buyFees + sellFees;
  const percentReturn =
    totalInvested > 0 ? (combinedPnl / totalInvested) * 100 : 0;

  return {
    costBasisTotal,
    totalInvested,
    buyFees,
    soldQuantity,
    remainingQuantity,
    effectiveExitPrice,
    proceeds,
    sellFees,
    soldCostBasis,
    realizedPnl,
    remainingCostBasis,
    remainingValue,
    unrealizedPnl,
    combinedPnl,
    totalFees,
    percentReturn,
  };
}
