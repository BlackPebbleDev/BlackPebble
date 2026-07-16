/**
 * Wallet valuation reconciliation for Real Trading Analysis.
 *
 * The audit found "Wallet Value" was misleading: it silently treated unpriced
 * assets as zero, excluded non-swap holdings, and disagreed with "Current
 * Exposure". This module makes valuation truthful by separating two concepts
 * and by classifying every asset instead of dropping the ones it cannot price.
 *
 *  1. Total On-Chain Portfolio  = native SOL + every PRICED live holding.
 *     The user's best-estimate live net worth on this wallet.
 *
 *  2. Analyzed Trading Portfolio = current value of holdings that Trader
 *     Intelligence can confidently reconstruct from verified swap history.
 *     This is what PnL, cost basis, scores and position analysis operate on.
 *
 * Nothing is silently valued at zero: unpriced / spam / unsupported assets are
 * tracked and reported so totals are never quietly understated.
 *
 * Pure - no I/O, fully testable.
 */

export type AssetInclusion =
  | "priced"
  | "unpriced"
  | "excluded"
  | "spam"
  | "unsupported";

export interface AssetValuationInput {
  mint: string;
  symbol?: string | null;
  /** Live on-chain balance (UI amount). */
  amount: number;
  /** Current price in SOL, if a trusted source was found. */
  priceSol?: number | null;
  /** Price source label (e.g. "dexscreener", "jupiter"). */
  priceSource?: string | null;
  /** Flagged as spam / scam - excluded from value entirely. */
  spam?: boolean;
  /** False when the token type/program cannot be valued safely. */
  supported?: boolean;
  /** True when this holding is reconstructable from swap history (FIFO). */
  tracedByHistory?: boolean;
}

export interface AssetValuation {
  mint: string;
  symbol: string | null;
  amount: number;
  priceSol: number | null;
  priceSource: string | null;
  valueSol: number | null;
  inclusion: AssetInclusion;
  reason: string;
  includedInOnChain: boolean;
  includedInAnalyzed: boolean;
}

export interface PortfolioCounts {
  priced: number;
  unpriced: number;
  excluded: number;
  spam: number;
  unsupported: number;
}

export interface PortfolioReconciliation {
  /** Native SOL balance. */
  nativeSol: number;
  /** Itemized per-asset breakdown (audit trail). */
  assets: AssetValuation[];
  /** Native SOL + every priced live holding. */
  totalOnChainPortfolioSol: number;
  /** Current value of priced holdings traceable to verified swap history. */
  analyzedTradingPortfolioSol: number;
  /** Sum of priced live holding values (excludes native SOL). */
  pricedHoldingsValueSol: number;
  /** SOL value of holdings that could NOT be priced (informational). */
  unpricedHoldingsCount: number;
  counts: PortfolioCounts;
}

const DUST_AMOUNT = 1e-9;

function classifyAsset(input: AssetValuationInput): AssetValuation {
  const symbol = input.symbol ?? null;
  const priceSource = input.priceSource ?? null;
  const amount = Number.isFinite(input.amount) ? input.amount : 0;
  const traced = input.tracedByHistory === true;

  const base = {
    mint: input.mint,
    symbol,
    amount,
    priceSource,
  };

  if (amount <= DUST_AMOUNT) {
    return {
      ...base,
      priceSol: input.priceSol ?? null,
      valueSol: null,
      inclusion: "excluded",
      reason: "Zero or negligible balance",
      includedInOnChain: false,
      includedInAnalyzed: false,
    };
  }
  if (input.spam) {
    return {
      ...base,
      priceSol: input.priceSol ?? null,
      valueSol: null,
      inclusion: "spam",
      reason: "Flagged as spam / scam token",
      includedInOnChain: false,
      includedInAnalyzed: false,
    };
  }
  if (input.supported === false) {
    return {
      ...base,
      priceSol: input.priceSol ?? null,
      valueSol: null,
      inclusion: "unsupported",
      reason: "Token type not supported for valuation",
      includedInOnChain: false,
      includedInAnalyzed: false,
    };
  }
  if (input.priceSol == null || !Number.isFinite(input.priceSol) || input.priceSol <= 0) {
    return {
      ...base,
      priceSol: null,
      valueSol: null,
      inclusion: "unpriced",
      reason: "No trusted price source - excluded from totals (not treated as zero)",
      includedInOnChain: false,
      includedInAnalyzed: false,
    };
  }

  const valueSol = amount * input.priceSol;
  return {
    ...base,
    priceSol: input.priceSol,
    valueSol,
    inclusion: "priced",
    reason: traced
      ? "Priced and reconstructed from swap history"
      : "Priced live holding (not traced to swap history)",
    includedInOnChain: true,
    includedInAnalyzed: traced,
  };
}

/**
 * Reconcile a wallet's live balances into truthful portfolio totals with a full
 * per-asset audit trail. `nativeSol` is the live native SOL balance.
 */
export function reconcilePortfolio(
  nativeSol: number,
  inputs: AssetValuationInput[],
): PortfolioReconciliation {
  const safeNative = Number.isFinite(nativeSol) && nativeSol > 0 ? nativeSol : 0;
  const assets = inputs.map(classifyAsset);

  const counts: PortfolioCounts = {
    priced: 0,
    unpriced: 0,
    excluded: 0,
    spam: 0,
    unsupported: 0,
  };
  let pricedHoldingsValueSol = 0;
  let analyzedTradingPortfolioSol = 0;

  for (const a of assets) {
    counts[a.inclusion]++;
    if (a.includedInOnChain && a.valueSol != null) {
      pricedHoldingsValueSol += a.valueSol;
    }
    if (a.includedInAnalyzed && a.valueSol != null) {
      analyzedTradingPortfolioSol += a.valueSol;
    }
  }

  return {
    nativeSol: safeNative,
    assets,
    totalOnChainPortfolioSol: safeNative + pricedHoldingsValueSol,
    analyzedTradingPortfolioSol,
    pricedHoldingsValueSol,
    unpricedHoldingsCount: counts.unpriced,
    counts,
  };
}
