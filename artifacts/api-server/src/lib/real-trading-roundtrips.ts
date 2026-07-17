/**
 * Round-trip reconstruction with retained executions and stable identifiers
 * (Phase 2C, Part 7 + 9).
 *
 * The legacy `matchFifo` produces one anonymous `ClosedRoundTrip` per sell,
 * which is correct for aggregate P&L but flattens complex trades and carries no
 * execution evidence or stable id. Trade Replay, entry/exit quality, and
 * evidence drill-down all need:
 *   - the individual buy/sell executions (with signatures)
 *   - a stable identifier per round trip and per execution
 *   - partial-exit / multiple-entry structure preserved
 *
 * This module reconstructs POSITION-LIFECYCLE round trips: a trip opens when a
 * mint's position rises from ~0 and closes when it returns to ~0. Re-entry
 * after a full exit starts a NEW trip. Realized P&L uses the SAME FIFO cost-
 * basis matching as `matchFifo`, so aggregate numbers are unchanged (verified
 * by tests). No formulas were altered - this is additive structure only.
 *
 * Pure - no I/O, fully testable.
 */

import {
  classifyOutcome,
  type ParsedSwapEvent,
  type RoundTripOutcome,
} from "./real-trading-math.js";
import type { ChainId } from "./market-data/types.js";

/** Quantity below this is treated as a closed position (dust tolerance). */
const CLOSE_EPSILON = 1e-9;

/** One buy leg that contributed to a trip. */
export interface EntryExecution {
  executionId: string;
  signature: string;
  blockTime: number;
  tokenAmount: number;
  solAmount: number;
  /** SOL per token at execution (solAmount / tokenAmount). */
  priceSol: number;
  dexSource: string | null;
}

/** One sell leg that contributed to a trip, with its FIFO-matched slice. */
export interface ExitExecution {
  executionId: string;
  signature: string;
  blockTime: number;
  tokenAmount: number;
  solAmount: number;
  priceSol: number;
  /** Cost basis of the lots this sell consumed (FIFO). */
  matchedCostBasisSol: number;
  /** Proceeds attributed to the matched quantity. */
  proceedsSol: number;
  /** Realized P&L for this exit leg (proceeds - matched cost basis). */
  realizedPnlSol: number;
  /** True when this sell drove the position to ~0 (closed the trip). */
  closesPosition: boolean;
  dexSource: string | null;
}

export interface ReconstructedRoundTrip {
  roundTripId: string;
  chain: ChainId;
  tokenMint: string;
  entryExecutions: EntryExecution[];
  exitExecutions: ExitExecution[];
  /** First buy time (unix seconds). */
  buyTime: number;
  /** Last exit time for a closed trip; null while open. */
  sellTime: number | null;
  holdDurationSec: number;
  /** Cost basis of the quantity that has actually been sold (matched). */
  costBasisSol: number;
  proceedsSol: number;
  realizedPnlSol: number;
  roiPercent: number;
  /** Quantity still held for an open trip (0 when closed). */
  remainingTokenAmount: number;
  /** Weighted-average entry price (SOL) across all entry executions. */
  avgEntryPriceSol: number;
  closed: boolean;
  outcome: RoundTripOutcome | null;
  /** True when the trip had more than one buy and/or more than one sell. */
  isComplex: boolean;
}

/** FNV-1a 32-bit hash → base36. Deterministic, stable across runs. */
function hashId(prefix: string, parts: (string | number)[]): string {
  const s = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${prefix}_${(h >>> 0).toString(36)}`;
}

interface WorkingLot {
  tokenAmount: number;
  costBasisSol: number;
}

interface WorkingTrip {
  tokenMint: string;
  lots: WorkingLot[];
  entryExecutions: EntryExecution[];
  exitExecutions: ExitExecution[];
  buyTime: number;
  boughtQty: number;
  soldQty: number;
  matchedCostBasisSol: number;
  proceedsSol: number;
  realizedPnlSol: number;
}

function finalizeTrip(
  t: WorkingTrip,
  chain: ChainId,
  closed: boolean,
): ReconstructedRoundTrip {
  const firstSig = t.entryExecutions[0]?.signature ?? "";
  const lastSig =
    t.exitExecutions[t.exitExecutions.length - 1]?.signature ?? firstSig;
  const roundTripId = hashId("rt", [
    t.tokenMint,
    firstSig,
    lastSig,
    t.buyTime,
    t.exitExecutions.length,
  ]);
  const remaining = t.lots.reduce((s, l) => s + l.tokenAmount, 0);
  const sellTime = closed
    ? (t.exitExecutions[t.exitExecutions.length - 1]?.blockTime ?? t.buyTime)
    : null;
  const totalEntrySol = t.entryExecutions.reduce((s, e) => s + e.solAmount, 0);
  const totalEntryQty = t.entryExecutions.reduce((s, e) => s + e.tokenAmount, 0);
  return {
    roundTripId,
    chain,
    tokenMint: t.tokenMint,
    entryExecutions: t.entryExecutions,
    exitExecutions: t.exitExecutions,
    buyTime: t.buyTime,
    sellTime,
    holdDurationSec:
      sellTime != null ? Math.max(0, sellTime - t.buyTime) : 0,
    costBasisSol: t.matchedCostBasisSol,
    proceedsSol: t.proceedsSol,
    realizedPnlSol: t.realizedPnlSol,
    roiPercent:
      t.matchedCostBasisSol > 0
        ? (t.realizedPnlSol / t.matchedCostBasisSol) * 100
        : 0,
    remainingTokenAmount: Math.max(0, remaining),
    avgEntryPriceSol: totalEntryQty > 0 ? totalEntrySol / totalEntryQty : 0,
    closed,
    outcome: closed ? classifyOutcome(t.realizedPnlSol) : null,
    isComplex: t.entryExecutions.length > 1 || t.exitExecutions.length > 1,
  };
}

/**
 * Reconstruct position-lifecycle round trips from parsed swap events.
 *
 * @param events parsed swaps (any order; sorted internally by block time)
 * @param chain  chain identity for the produced trips (default solana)
 */
export function reconstructRoundTrips(
  events: ParsedSwapEvent[],
  chain: ChainId = "solana",
): { closed: ReconstructedRoundTrip[]; open: ReconstructedRoundTrip[] } {
  const sorted = [...events].sort((a, b) => a.blockTime - b.blockTime);
  const openByMint = new Map<string, WorkingTrip>();
  const closed: ReconstructedRoundTrip[] = [];

  for (const ev of sorted) {
    const mint = ev.tokenMint;
    if (ev.side === "buy") {
      let trip = openByMint.get(mint);
      if (!trip) {
        trip = {
          tokenMint: mint,
          lots: [],
          entryExecutions: [],
          exitExecutions: [],
          buyTime: ev.blockTime,
          boughtQty: 0,
          soldQty: 0,
          matchedCostBasisSol: 0,
          proceedsSol: 0,
          realizedPnlSol: 0,
        };
        openByMint.set(mint, trip);
      }
      const idx = trip.entryExecutions.length;
      trip.entryExecutions.push({
        executionId: hashId("ex", [ev.signature, mint, "buy", idx]),
        signature: ev.signature,
        blockTime: ev.blockTime,
        tokenAmount: ev.tokenAmount,
        solAmount: ev.solAmount,
        priceSol: ev.tokenAmount > 0 ? ev.solAmount / ev.tokenAmount : 0,
        dexSource: ev.dexSource,
      });
      trip.lots.push({ tokenAmount: ev.tokenAmount, costBasisSol: ev.solAmount });
      trip.boughtQty += ev.tokenAmount;
      continue;
    }

    // Sell: match FIFO against the open trip's lots (identical to matchFifo).
    const trip = openByMint.get(mint);
    if (!trip || trip.lots.length === 0) {
      // Sell with no matching open position (transfer-in / untracked buy).
      // Skipped from round-trip P&L exactly as matchFifo would (no lots).
      continue;
    }
    let remaining = ev.tokenAmount;
    let matchedCost = 0;
    while (remaining > 1e-12 && trip.lots.length > 0) {
      const lot = trip.lots[0]!;
      const take = Math.min(lot.tokenAmount, remaining);
      const costSlice = (take / lot.tokenAmount) * lot.costBasisSol;
      matchedCost += costSlice;
      lot.tokenAmount -= take;
      lot.costBasisSol -= costSlice;
      remaining -= take;
      if (lot.tokenAmount <= 1e-12) trip.lots.shift();
    }
    const matchedAmount = ev.tokenAmount - remaining;
    if (matchedAmount <= 0) continue;
    const proceeds = (matchedAmount / ev.tokenAmount) * ev.solAmount;
    const pnl = proceeds - matchedCost;
    const positionLeft = trip.lots.reduce((s, l) => s + l.tokenAmount, 0);
    const closesPosition = positionLeft <= CLOSE_EPSILON;
    const idx = trip.exitExecutions.length;
    trip.exitExecutions.push({
      executionId: hashId("ex", [ev.signature, mint, "sell", idx]),
      signature: ev.signature,
      blockTime: ev.blockTime,
      tokenAmount: matchedAmount,
      solAmount: proceeds,
      priceSol: matchedAmount > 0 ? proceeds / matchedAmount : 0,
      matchedCostBasisSol: matchedCost,
      proceedsSol: proceeds,
      realizedPnlSol: pnl,
      closesPosition,
      dexSource: ev.dexSource,
    });
    trip.soldQty += matchedAmount;
    trip.matchedCostBasisSol += matchedCost;
    trip.proceedsSol += proceeds;
    trip.realizedPnlSol += pnl;

    if (closesPosition) {
      closed.push(finalizeTrip(trip, chain, true));
      openByMint.delete(mint);
    }
  }

  const open: ReconstructedRoundTrip[] = [];
  for (const trip of openByMint.values()) {
    // A trip that saw at least one buy but never fully closed is "open".
    open.push(finalizeTrip(trip, chain, false));
  }
  return { closed, open };
}
