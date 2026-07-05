/**
 * Pure math for Real Trading Analysis.
 * No I/O - fully testable.
 */

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

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
  diversificationScore: number;
  avgMarketCapPurchasedUsd: number | null;
  walletAgeDays: number;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
}


/** Parse net token/SOL deltas from a Helius-style SWAP into a directional event. */
export function parseSwapDeltas(
  wallet: string,
  signature: string,
  blockTime: number,
  tokenTransfers: Array<{
    mint?: string;
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount?: number | { uiAmount?: number };
  }>,
  nativeTransfers: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    amount?: number;
  }>,
  dexSource: string | null,
): ParsedSwapEvent | null {
  const netTokenByMint = new Map<string, number>();
  for (const t of tokenTransfers) {
    const mint = t.mint;
    if (!mint || mint === WSOL_MINT) continue;
    const amt =
      typeof t.tokenAmount === "number"
        ? t.tokenAmount
        : (t.tokenAmount?.uiAmount ?? 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    let delta = 0;
    if (t.toUserAccount === wallet) delta += amt;
    if (t.fromUserAccount === wallet) delta -= amt;
    if (delta === 0) continue;
    netTokenByMint.set(mint, (netTokenByMint.get(mint) ?? 0) + delta);
  }

  let netSolLamports = 0;
  for (const n of nativeTransfers) {
    const amt = n.amount ?? 0;
    if (n.toUserAccount === wallet) netSolLamports += amt;
    if (n.fromUserAccount === wallet) netSolLamports -= amt;
  }
  const netSol = netSolLamports / 1e9;

  // Pick the mint with the largest absolute token delta.
  let bestMint: string | null = null;
  let bestDelta = 0;
  for (const [mint, delta] of netTokenByMint) {
    if (Math.abs(delta) > Math.abs(bestDelta)) {
      bestMint = mint;
      bestDelta = delta;
    }
  }
  if (!bestMint || bestDelta === 0) return null;

  const side: "buy" | "sell" = bestDelta > 0 ? "buy" : "sell";
  const tokenAmount = Math.abs(bestDelta);
  const solAmount = Math.abs(netSol);
  if (tokenAmount <= 0 || solAmount <= 0) return null;

  return {
    signature,
    blockTime,
    tokenMint: bestMint,
    side,
    tokenAmount,
    solAmount,
    dexSource,
  };
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

export interface ReconciledHoldings {
  holdings: MintHolding[];
  /** True when live balances were available and applied. */
  verified: boolean;
  /** Mints the trade history thought were held but the chain says are gone. */
  droppedMints: number;
}

/**
 * Reconcile trade-history-derived holdings against ACTUAL on-chain balances.
 *
 * Swap history alone cannot see transfers out, burns, or non-swap exits, so
 * FIFO leftovers systematically overstate what a wallet still holds ("ghost
 * positions"). Each holding is capped at the live balance, with cost basis
 * scaled proportionally; mints the wallet no longer holds are dropped.
 *
 * `balances === null` means verification was unavailable (RPC failure) - the
 * FIFO view is passed through but flagged unverified so display layers never
 * present it as fact.
 */
export function reconcileHoldings(
  fifoHoldings: MintHolding[],
  balances: Map<string, number> | null,
): ReconciledHoldings {
  if (balances == null) {
    return { holdings: fifoHoldings, verified: false, droppedMints: 0 };
  }
  const holdings: MintHolding[] = [];
  let droppedMints = 0;
  for (const h of fifoHoldings) {
    const live = balances.get(h.tokenMint) ?? 0;
    const held = Math.min(h.tokenAmount, live);
    if (held <= HOLDING_EPSILON) {
      droppedMints++;
      continue;
    }
    const scale = held / h.tokenAmount;
    holdings.push({
      tokenMint: h.tokenMint,
      tokenAmount: held,
      costBasisSol: h.costBasisSol * scale,
      firstAcquiredAt: h.firstAcquiredAt,
    });
  }
  return { holdings, verified: true, droppedMints };
}

export function computeMetrics(
  events: ParsedSwapEvent[],
  closed: ClosedRoundTrip[],
  openPositions: OpenPosition[],
  walletAgeDays: number,
): TradingMetrics {
  const buys = events.filter((e) => e.side === "buy");
  const sells = events.filter((e) => e.side === "sell");
  const wins = closed.filter((c) => c.realizedPnlSol > 0);
  const losses = closed.filter((c) => c.realizedPnlSol <= 0);

  const realizedPnlSol = closed.reduce((s, c) => s + c.realizedPnlSol, 0);
  const unrealizedPnlSol = openPositions.reduce(
    (s, p) => s + (p.unrealizedPnlSol ?? 0),
    0,
  );

  const holdDurations = closed.map((c) => c.holdDurationSec).sort((a, b) => a - b);
  const medianHold =
    holdDurations.length === 0
      ? 0
      : holdDurations[Math.floor(holdDurations.length / 2)]!;

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

  const diversificationScore = Math.round(
    Math.min(100, uniqueTokens * 8 + (1 - holdingConcentration) * 40),
  );

  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const lossRate = closed.length > 0 ? losses.length / closed.length : 0;

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
    diversificationScore,
    avgMarketCapPurchasedUsd: null,
    walletAgeDays,
    firstTradeAt,
    lastTradeAt,
  };
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
