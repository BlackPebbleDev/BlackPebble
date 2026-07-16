/**
 * Pure math for Real Trading Analysis.
 * No I/O - fully testable.
 */

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Trusted stablecoin mints (USDC, USDT). These are quote/settlement assets, not
 * speculative tokens: a SOL<->USDC swap is parking, not a trade. They are never
 * treated as a traded position, so they cannot appear as winners, losers,
 * conviction positions, diversification assets, or unique-token counts. A
 * genuine intentional stablecoin position would still be visible in raw balances
 * but is intentionally excluded from speculative trade analysis.
 */
export const STABLECOIN_MINTS = new Set<string>([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

export function isStablecoinMint(mint: string): boolean {
  return STABLECOIN_MINTS.has(mint);
}

export interface ParsedSwapEvent {
  signature: string;
  blockTime: number;
  tokenMint: string;
  side: "buy" | "sell";
  tokenAmount: number;
  solAmount: number;
  dexSource: string | null;
}

export interface TradeLot {
  tokenMint: string;
  tokenAmount: number;
  costBasisSol: number;
  acquiredAt: number;
}

export interface ClosedRoundTrip {
  tokenMint: string;
  buyTime: number;
  sellTime: number;
  holdDurationSec: number;
  costBasisSol: number;
  proceedsSol: number;
  realizedPnlSol: number;
  roiPercent: number;
}

export interface OpenPosition {
  tokenMint: string;
  symbol: string | null;
  name: string | null;
  logo: string | null;
  tokenAmount: number;
  costBasisSol: number;
  avgEntryPriceSol: number;
  firstAcquiredAt: number;
  currentPriceSol: number | null;
  currentValueSol: number | null;
  unrealizedPnlSol: number | null;
  marketCapUsd: number | null;
}

export interface TradingMetrics {
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  closedRoundTrips: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  winRate: number;
  lossRate: number;
  avgGainSol: number;
  avgLossSol: number;
  largestGainSol: number;
  largestLossSol: number;
  avgHoldDurationSec: number;
  medianHoldDurationSec: number;
  avgPositionSizeSol: number;
  tradingFrequencyPerWeek: number;
  uniqueTokensTraded: number;
  holdingConcentration: number;
  /**
   * Legacy field kept for backward compatibility. Now equals
   * `historicalTradingBreadth` so no consumer conflates historical breadth with
   * current diversification. Prefer the two explicit fields below.
   */
  diversificationScore: number;
  /**
   * Descriptive: how many distinct assets the wallet has traded over time
   * (0-100). This is turnover/variety, NOT automatically good, and is NOT the
   * current portfolio's diversification.
   */
  historicalTradingBreadth: number;
  /**
   * Current portfolio diversification (0-100) computed ONLY from verified
   * current open positions. Null when there are no priced current positions
   * (e.g. holdings unverified or fully closed) - never inferred from sold
   * positions.
   */
  currentDiversification: number | null;
  /** Completed round trips whose realized P&L is within the breakeven band. */
  breakevenCount: number;
  avgMarketCapPurchasedUsd: number | null;
  /** Median USD market cap of buys, when true market cap was available. */
  medianMarketCapPurchasedUsd: number | null;
  /** True when `avgMarketCapPurchasedUsd` is an FDV fallback, not market cap. */
  avgMarketCapIsFdv: boolean;
  walletAgeDays: number;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
}

/**
 * Realized P&L within +/- this SOL band is a BREAKEVEN, not a win or a loss.
 * Prevents rounding noise (fees, slippage dust) from being scored as a loss.
 */
export const BREAKEVEN_EPSILON_SOL = 1e-4;

export type RoundTripOutcome = "win" | "loss" | "breakeven";

/** Classify a round trip by realized P&L using the breakeven epsilon band. */
export function classifyOutcome(realizedPnlSol: number): RoundTripOutcome {
  if (realizedPnlSol > BREAKEVEN_EPSILON_SOL) return "win";
  if (realizedPnlSol < -BREAKEVEN_EPSILON_SOL) return "loss";
  return "breakeven";
}


/**
 * Rent-exempt minimum for a standard SPL / Token-2022 associated token account.
 * ATA creation deposits this from the wallet and account close reclaims it;
 * neither is a trading cost, so it must be stripped from the SOL leg.
 */
export const ATA_RENT_LAMPORTS = 2_039_280;
/** Tolerance around known rent values (accounts for minor variants). */
const RENT_TOLERANCE_LAMPORTS = 5_000;
/** SOL leg smaller than this is treated as "no SOL settlement". */
const DUST_SOL = 1e-7;

export interface TokenTransferLike {
  mint?: string;
  fromUserAccount?: string;
  toUserAccount?: string;
  tokenAmount?: number | { uiAmount?: number };
}
export interface NativeTransferLike {
  fromUserAccount?: string;
  toUserAccount?: string;
  amount?: number;
}

/** Extra transaction-level context for accurate cost-basis / fee separation. */
export interface SwapParseOptions {
  /** Total network fee (base + priority) in lamports, from the tx envelope. */
  feeLamports?: number;
  /** Fee payer account - fees only affect this wallet's SOL. */
  feePayer?: string;
}

export type SwapSkipReason =
  | "no_token_delta"
  | "token_to_token_no_sol"
  | "zero_sol_leg"
  | "stablecoin_quote";

export interface SwapParseResult {
  event: ParsedSwapEvent | null;
  skipReason: SwapSkipReason | null;
  /** True when this looked like a token↔token swap with no SOL/WSOL leg. */
  tokenToToken: boolean;
  /** ATA rent lamports stripped from the SOL leg (cost-basis hygiene). */
  rentStrippedLamports: number;
  /** Network fee attributed to this wallet, kept OUT of cost basis. */
  feeLamports: number;
}

function uiAmount(t: TokenTransferLike): number {
  const amt =
    typeof t.tokenAmount === "number"
      ? t.tokenAmount
      : (t.tokenAmount?.uiAmount ?? 0);
  return Number.isFinite(amt) ? amt : 0;
}

function isRentSized(lamports: number): boolean {
  return Math.abs(Math.abs(lamports) - ATA_RENT_LAMPORTS) <= RENT_TOLERANCE_LAMPORTS;
}

/**
 * Parse a Helius-style SWAP into a directional event WITH diagnostics.
 *
 * Improvements over the naive delta parser:
 *  - WSOL-settled swaps: Wrapped SOL token transfers are folded into the SOL
 *    leg, so aggregator/mixed routes that settle in WSOL are no longer dropped.
 *  - Rent separation: ATA rent deposits/reclaims are stripped from the SOL leg
 *    so they never contaminate cost basis or proceeds.
 *  - Priority fee separation: the network fee lives in the tx envelope, never
 *    in nativeTransfers, so it is inherently excluded from cost basis; we
 *    surface it for transparency only.
 *  - Token-to-token detection: swaps with no SOL/WSOL leg are reported (not
 *    silently discarded) so ingestion can flag coverage gaps.
 */
export function classifySwap(
  wallet: string,
  signature: string,
  blockTime: number,
  tokenTransfers: TokenTransferLike[],
  nativeTransfers: NativeTransferLike[],
  dexSource: string | null,
  opts?: SwapParseOptions,
): SwapParseResult {
  const feeLamports =
    opts?.feePayer === wallet && Number.isFinite(opts?.feeLamports)
      ? opts!.feeLamports!
      : 0;

  // Non-WSOL, non-stablecoin token legs (the speculative positions).
  const netTokenByMint = new Map<string, number>();
  // WSOL token legs count toward the SOL settlement, not as a position.
  let netWsol = 0;
  // Trusted stablecoins are quote/settlement assets, never positions.
  let hadStableLeg = false;
  for (const t of tokenTransfers) {
    const mint = t.mint;
    if (!mint) continue;
    const amt = uiAmount(t);
    if (amt === 0) continue;
    let delta = 0;
    if (t.toUserAccount === wallet) delta += amt;
    if (t.fromUserAccount === wallet) delta -= amt;
    if (delta === 0) continue;
    if (mint === WSOL_MINT) {
      netWsol += delta; // uiAmount is already denominated in SOL
      continue;
    }
    if (isStablecoinMint(mint)) {
      hadStableLeg = true; // quote asset - not a speculative position
      continue;
    }
    netTokenByMint.set(mint, (netTokenByMint.get(mint) ?? 0) + delta);
  }

  // Native SOL leg, with ATA rent stripped out.
  let netSolLamports = 0;
  let rentStrippedLamports = 0;
  for (const n of nativeTransfers) {
    const amt = n.amount ?? 0;
    if (amt === 0) continue;
    if (isRentSized(amt)) {
      rentStrippedLamports += Math.abs(amt);
      continue;
    }
    if (n.toUserAccount === wallet) netSolLamports += amt;
    if (n.fromUserAccount === wallet) netSolLamports -= amt;
  }
  const netSol = netSolLamports / 1e9 + netWsol;

  // Largest absolute non-WSOL token delta is the traded position.
  let bestMint: string | null = null;
  let bestDelta = 0;
  let significantMints = 0;
  for (const [mint, delta] of netTokenByMint) {
    if (Math.abs(delta) > 0) significantMints++;
    if (Math.abs(delta) > Math.abs(bestDelta)) {
      bestMint = mint;
      bestDelta = delta;
    }
  }

  const base = { rentStrippedLamports, feeLamports };

  if (!bestMint || bestDelta === 0) {
    // A stablecoin-only leg (e.g. SOL<->USDC parking) is a quote settlement,
    // not a speculative trade - report it distinctly so it is never a position.
    if (hadStableLeg) {
      return {
        event: null,
        skipReason: "stablecoin_quote",
        tokenToToken: false,
        ...base,
      };
    }
    return { event: null, skipReason: "no_token_delta", tokenToToken: false, ...base };
  }

  const solAmount = Math.abs(netSol);

  // Token-to-token swap: no SOL/WSOL settlement but two token legs move.
  const tokenToToken = solAmount < DUST_SOL && significantMints >= 2;
  if (solAmount < DUST_SOL) {
    return {
      event: null,
      skipReason: tokenToToken ? "token_to_token_no_sol" : "zero_sol_leg",
      tokenToToken,
      ...base,
    };
  }

  const side: "buy" | "sell" = bestDelta > 0 ? "buy" : "sell";
  return {
    event: {
      signature,
      blockTime,
      tokenMint: bestMint,
      side,
      tokenAmount: Math.abs(bestDelta),
      solAmount,
      dexSource,
    },
    skipReason: null,
    tokenToToken: false,
    ...base,
  };
}

/**
 * Parse net token/SOL deltas from a Helius-style SWAP into a directional event.
 * Thin wrapper over {@link classifySwap} for callers that only need the event.
 */
export function parseSwapDeltas(
  wallet: string,
  signature: string,
  blockTime: number,
  tokenTransfers: TokenTransferLike[],
  nativeTransfers: NativeTransferLike[],
  dexSource: string | null,
  opts?: SwapParseOptions,
): ParsedSwapEvent | null {
  return classifySwap(
    wallet,
    signature,
    blockTime,
    tokenTransfers,
    nativeTransfers,
    dexSource,
    opts,
  ).event;
}

/** FIFO cost-basis matching for sells → closed round trips + remaining lots. */
export function matchFifo(
  events: ParsedSwapEvent[],
): { closed: ClosedRoundTrip[]; openLots: TradeLot[] } {
  const sorted = [...events].sort((a, b) => a.blockTime - b.blockTime);
  const lotsByMint = new Map<string, TradeLot[]>();
  const closed: ClosedRoundTrip[] = [];

  for (const ev of sorted) {
    if (ev.side === "buy") {
      const queue = lotsByMint.get(ev.tokenMint) ?? [];
      queue.push({
        tokenMint: ev.tokenMint,
        tokenAmount: ev.tokenAmount,
        costBasisSol: ev.solAmount,
        acquiredAt: ev.blockTime,
      });
      lotsByMint.set(ev.tokenMint, queue);
      continue;
    }

    let remaining = ev.tokenAmount;
    const proceedsTotal = ev.solAmount;
    const queue = lotsByMint.get(ev.tokenMint) ?? [];
    const consumedCost: number[] = [];
    const consumedTimes: number[] = [];

    while (remaining > 1e-12 && queue.length > 0) {
      const lot = queue[0]!;
      const take = Math.min(lot.tokenAmount, remaining);
      const costSlice = (take / lot.tokenAmount) * lot.costBasisSol;
      consumedCost.push(costSlice);
      consumedTimes.push(lot.acquiredAt);
      lot.tokenAmount -= take;
      lot.costBasisSol -= costSlice;
      remaining -= take;
      if (lot.tokenAmount <= 1e-12) queue.shift();
    }

    const matchedAmount = ev.tokenAmount - remaining;
    if (matchedAmount <= 0) continue;

    const costBasis = consumedCost.reduce((a, b) => a + b, 0);
    const proceeds = (matchedAmount / ev.tokenAmount) * proceedsTotal;
    const pnl = proceeds - costBasis;
    const buyTime = consumedTimes.length > 0 ? Math.min(...consumedTimes) : ev.blockTime;

    closed.push({
      tokenMint: ev.tokenMint,
      buyTime,
      sellTime: ev.blockTime,
      holdDurationSec: Math.max(0, ev.blockTime - buyTime),
      costBasisSol: costBasis,
      proceedsSol: proceeds,
      realizedPnlSol: pnl,
      roiPercent: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
    });
    lotsByMint.set(ev.tokenMint, queue);
  }

  const openLots: TradeLot[] = [];
  for (const queue of lotsByMint.values()) {
    for (const lot of queue) {
      if (lot.tokenAmount > 1e-12) openLots.push(lot);
    }
  }
  return { closed, openLots };
}

/** FIFO open lots aggregated to one summary per mint. */
export interface MintHolding {
  tokenMint: string;
  tokenAmount: number;
  costBasisSol: number;
  firstAcquiredAt: number;
}

export function aggregateLotsByMint(openLots: TradeLot[]): MintHolding[] {
  const byMint = new Map<string, MintHolding>();
  for (const lot of openLots) {
    const agg = byMint.get(lot.tokenMint);
    if (!agg) {
      byMint.set(lot.tokenMint, {
        tokenMint: lot.tokenMint,
        tokenAmount: lot.tokenAmount,
        costBasisSol: lot.costBasisSol,
        firstAcquiredAt: lot.acquiredAt,
      });
    } else {
      agg.tokenAmount += lot.tokenAmount;
      agg.costBasisSol += lot.costBasisSol;
      agg.firstAcquiredAt = Math.min(agg.firstAcquiredAt, lot.acquiredAt);
    }
  }
  return [...byMint.values()];
}

const HOLDING_EPSILON = 1e-9;

/** Per-mint audit of how a FIFO holding was reconciled against live balances. */
export interface PositionReconciliation {
  mint: string;
  /** Quantity the swap history (FIFO) believes is still held. */
  historyQuantity: number;
  /** Live on-chain balance (UI amount). Null when balances were unavailable. */
  liveQuantity: number | null;
  /** Final quantity used for the current position (capped to live, 0 if gone). */
  reconciledQuantity: number;
  /** Human-readable adjustment reason. */
  reason: string;
  /** True when the wallet no longer holds this mint (sold / transferred out). */
  droppedAsGhost: boolean;
  /** True when this becomes a current open position. */
  includedInOpenPositions: boolean;
  /** True when it also counts toward the analyzed trading portfolio (priced). */
  includedInAnalyzed: boolean;
}

export interface ReconciledHoldings {
  holdings: MintHolding[];
  /** True when live balances were available and applied. */
  verified: boolean;
  /** Mints the trade history thought were held but the chain says are gone. */
  droppedMints: number;
  /** Per-mint reconciliation audit trail. */
  diagnostics: PositionReconciliation[];
}

/**
 * Reconcile trade-history-derived holdings against ACTUAL on-chain balances.
 *
 * Swap history alone cannot see transfers out, burns, or non-swap exits, so
 * FIFO leftovers systematically overstate what a wallet still holds ("ghost
 * positions"). Each holding is capped at the live balance, with cost basis
 * scaled proportionally; mints the wallet no longer holds are dropped.
 *
 * `balances === null` means verification was unavailable (RPC failure). In that
 * case we return NO current positions (the FIFO view is never presented as a
 * live holding) and flag the result unverified - the UI shows an "unverified"
 * state and prompts a refresh instead of rendering positions the wallet may not
 * actually own.
 */
export function reconcileHoldings(
  fifoHoldings: MintHolding[],
  balances: Map<string, number> | null,
): ReconciledHoldings {
  if (balances == null) {
    const diagnostics: PositionReconciliation[] = fifoHoldings.map((h) => ({
      mint: h.tokenMint,
      historyQuantity: h.tokenAmount,
      liveQuantity: null,
      reconciledQuantity: 0,
      reason: "Live balance unavailable - not shown as a current position",
      droppedAsGhost: false,
      includedInOpenPositions: false,
      includedInAnalyzed: false,
    }));
    return { holdings: [], verified: false, droppedMints: 0, diagnostics };
  }
  const holdings: MintHolding[] = [];
  const diagnostics: PositionReconciliation[] = [];
  let droppedMints = 0;
  for (const h of fifoHoldings) {
    const live = balances.get(h.tokenMint) ?? 0;
    const held = Math.min(h.tokenAmount, live);
    if (held <= HOLDING_EPSILON) {
      droppedMints++;
      diagnostics.push({
        mint: h.tokenMint,
        historyQuantity: h.tokenAmount,
        liveQuantity: live,
        reconciledQuantity: 0,
        reason:
          live <= HOLDING_EPSILON
            ? "Live balance is zero - fully sold or transferred out"
            : "Negligible live balance - excluded as dust",
        droppedAsGhost: true,
        includedInOpenPositions: false,
        includedInAnalyzed: false,
      });
      continue;
    }
    const scale = held / h.tokenAmount;
    holdings.push({
      tokenMint: h.tokenMint,
      tokenAmount: held,
      costBasisSol: h.costBasisSol * scale,
      firstAcquiredAt: h.firstAcquiredAt,
    });
    diagnostics.push({
      mint: h.tokenMint,
      historyQuantity: h.tokenAmount,
      liveQuantity: live,
      reconciledQuantity: held,
      reason:
        held < h.tokenAmount
          ? "Capped to live on-chain balance"
          : "Fully held on-chain",
      droppedAsGhost: false,
      includedInOpenPositions: true,
      // Refined in markOpenPositions once pricing is known (priced => analyzed).
      includedInAnalyzed: true,
    });
  }
  return { holdings, verified: true, droppedMints, diagnostics };
}

export function computeMetrics(
  events: ParsedSwapEvent[],
  closed: ClosedRoundTrip[],
  openPositions: OpenPosition[],
  walletAgeDays: number,
): TradingMetrics {
  const buys = events.filter((e) => e.side === "buy");
  const sells = events.filter((e) => e.side === "sell");
  // Breakeven-aware classification: tiny rounding noise is NOT a loss.
  const wins = closed.filter((c) => classifyOutcome(c.realizedPnlSol) === "win");
  const losses = closed.filter(
    (c) => classifyOutcome(c.realizedPnlSol) === "loss",
  );
  const breakevens = closed.filter(
    (c) => classifyOutcome(c.realizedPnlSol) === "breakeven",
  );

  const realizedPnlSol = closed.reduce((s, c) => s + c.realizedPnlSol, 0);
  const unrealizedPnlSol = openPositions.reduce(
    (s, p) => s + (p.unrealizedPnlSol ?? 0),
    0,
  );

  const holdDurations = closed.map((c) => c.holdDurationSec).sort((a, b) => a - b);
  const medianHold = median(holdDurations);

  const buySizes = buys.map((b) => b.solAmount);
  const avgPositionSize =
    buySizes.length > 0 ? buySizes.reduce((a, b) => a + b, 0) / buySizes.length : 0;

  const timestamps = events.map((e) => e.blockTime).sort((a, b) => a - b);
  const firstTradeAt = timestamps[0] ?? null;
  const lastTradeAt = timestamps[timestamps.length - 1] ?? null;

  let tradingFrequencyPerWeek = 0;
  if (firstTradeAt && lastTradeAt && lastTradeAt > firstTradeAt) {
    const weeks = (lastTradeAt - firstTradeAt) / (7 * 86400);
    tradingFrequencyPerWeek = weeks > 0 ? events.length / weeks : events.length;
  }

  const uniqueTokens = new Set(events.map((e) => e.tokenMint)).size;

  // Herfindahl concentration on open position values.
  const values = openPositions
    .map((p) => p.currentValueSol ?? p.costBasisSol)
    .filter((v) => v > 0);
  const totalValue = values.reduce((a, b) => a + b, 0);
  let holdingConcentration = 0;
  if (totalValue > 0) {
    holdingConcentration = values.reduce((s, v) => {
      const share = v / totalValue;
      return s + share * share;
    }, 0);
  }

  // Historical trading breadth: distinct assets traded over time (descriptive).
  const historicalTradingBreadth = Math.round(Math.min(100, uniqueTokens * 8));
  // Current diversification: derived ONLY from verified current holdings. Null
  // when there are no priced current positions so it can never be inferred from
  // sold/old positions.
  const currentDiversification =
    values.length > 0 ? Math.round((1 - holdingConcentration) * 100) : null;

  // Win rate excludes breakevens from the denominator: wins / (wins + losses).
  const decisive = wins.length + losses.length;
  const winRate = decisive > 0 ? wins.length / decisive : 0;
  const lossRate = decisive > 0 ? losses.length / decisive : 0;

  const gainAmounts = wins.map((w) => w.realizedPnlSol);
  const lossAmounts = losses.map((l) => Math.abs(l.realizedPnlSol));

  return {
    totalTrades: events.length,
    buyCount: buys.length,
    sellCount: sells.length,
    closedRoundTrips: closed.length,
    realizedPnlSol,
    unrealizedPnlSol,
    totalPnlSol: realizedPnlSol + unrealizedPnlSol,
    winRate,
    lossRate,
    avgGainSol:
      gainAmounts.length > 0
        ? gainAmounts.reduce((a, b) => a + b, 0) / gainAmounts.length
        : 0,
    avgLossSol:
      lossAmounts.length > 0
        ? lossAmounts.reduce((a, b) => a + b, 0) / lossAmounts.length
        : 0,
    largestGainSol: gainAmounts.length > 0 ? Math.max(...gainAmounts) : 0,
    largestLossSol: lossAmounts.length > 0 ? Math.max(...lossAmounts) : 0,
    avgHoldDurationSec:
      holdDurations.length > 0
        ? holdDurations.reduce((a, b) => a + b, 0) / holdDurations.length
        : 0,
    medianHoldDurationSec: medianHold,
    avgPositionSizeSol: avgPositionSize,
    tradingFrequencyPerWeek,
    uniqueTokensTraded: uniqueTokens,
    holdingConcentration,
    diversificationScore: historicalTradingBreadth,
    historicalTradingBreadth,
    currentDiversification,
    breakevenCount: breakevens.length,
    avgMarketCapPurchasedUsd: null,
    medianMarketCapPurchasedUsd: null,
    avgMarketCapIsFdv: false,
    walletAgeDays,
    firstTradeAt,
    lastTradeAt,
  };
}

/** True median: averages the two middle values for even-sized datasets. */
export function median(sortedOrUnsorted: number[]): number {
  const n = sortedOrUnsorted.length;
  if (n === 0) return 0;
  const s = [...sortedOrUnsorted].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
