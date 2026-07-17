/**
 * Trade Replay data model (Phase 2C, Part 9).
 *
 * A deterministic evidence drill-down for a completed historical round trip -
 * NOT video playback. It assembles the trade lifecycle (what was bought, how
 * the position was built, price action before/during/after, how it was exited)
 * from a reconstructed round trip plus optional enrichment (entry/exit quality,
 * liquidity, price paths). Everything degrades honestly: missing enrichment
 * surfaces as unavailable, never invented.
 *
 * Stable identifiers (roundTripId / executionId) come from the reconstruction
 * layer, so replays are addressable without exposing internal database ids.
 *
 * Pure - no I/O, fully testable.
 */

import type { ChainId, HistoricalCandle } from "./market-data/types.js";
import type { EntryQualityEvidence } from "./real-trading-entry-quality.js";
import type { ExitQualityEvidence } from "./real-trading-exit-quality.js";
import type { HoldingLiquidity } from "./real-trading-liquidity.js";
import type {
  ReconstructedRoundTrip,
  EntryExecution,
  ExitExecution,
} from "./real-trading-roundtrips.js";
import type { RoundTripOutcome } from "./real-trading-math.js";

/** Lightweight token identity for a replay/summary. */
export interface ReplayToken {
  mint: string;
  chain: ChainId;
  symbol: string | null;
  name: string | null;
  logo: string | null;
  pairAddress: string | null;
}

/** A compact per-trade row for the Trade Replay list endpoint. */
export interface TradeSummary {
  roundTripId: string;
  token: ReplayToken;
  buyTime: number;
  sellTime: number | null;
  holdDurationSec: number;
  costBasisSol: number;
  proceedsSol: number;
  realizedPnlSol: number;
  roiPercent: number;
  outcome: RoundTripOutcome | null;
  entryCount: number;
  exitCount: number;
  isComplex: boolean;
  closed: boolean;
  entryClassification: string | null;
  exitClassification: string | null;
  /** Behavior flag keys connected to this trade. */
  behaviorFlags: string[];
}

/** Three price paths that tell the lifecycle story. */
export interface ReplayPricePaths {
  beforeEntry: HistoricalCandle[];
  duringTrade: HistoricalCandle[];
  afterExit: HistoricalCandle[];
  source: string | null;
  interval: string | null;
}

export interface TradeReplay {
  roundTripId: string;
  token: ReplayToken;
  entryExecutions: EntryExecution[];
  exitExecutions: ExitExecution[];
  buyTime: number;
  sellTime: number | null;
  holdDurationSec: number;
  costBasisSol: number;
  proceedsSol: number;
  realizedPnlSol: number;
  roiPercent: number;
  outcome: RoundTripOutcome | null;
  avgEntryPriceSol: number;
  /** Entry/exit valuation, correctly labeled MC vs FDV upstream. */
  entryMarketCapUsd: number | null;
  exitMarketCapUsd: number | null;
  entryMarketCapIsFdv: boolean;
  exitMarketCapIsFdv: boolean;
  entryLiquidityUsd: number | null;
  exitLiquidityUsd: number | null;
  entryQuality: EntryQualityEvidence | null;
  exitQuality: ExitQualityEvidence | null;
  currentLiquidity: HoldingLiquidity | null;
  behaviorFlags: string[];
  /** Fraction (0..1) this trade contributed to total historical losses. */
  lossContribution: number | null;
  partOfStreak: boolean;
  pricePaths: ReplayPricePaths | null;
  coverage: {
    hasEntryQuality: boolean;
    hasExitQuality: boolean;
    hasPricePaths: boolean;
    hasLiquidity: boolean;
  };
  source: string | null;
  limitations: string[];
}

export interface ReplayEnrichment {
  token?: Partial<ReplayToken>;
  entryQuality?: EntryQualityEvidence | null;
  exitQuality?: ExitQualityEvidence | null;
  currentLiquidity?: HoldingLiquidity | null;
  entryMarketCapUsd?: number | null;
  exitMarketCapUsd?: number | null;
  entryMarketCapIsFdv?: boolean;
  exitMarketCapIsFdv?: boolean;
  entryLiquidityUsd?: number | null;
  exitLiquidityUsd?: number | null;
  behaviorFlags?: string[];
  lossContribution?: number | null;
  partOfStreak?: boolean;
  pricePaths?: ReplayPricePaths | null;
  source?: string | null;
}

function defaultToken(trip: ReconstructedRoundTrip): ReplayToken {
  return {
    mint: trip.tokenMint,
    chain: trip.chain,
    symbol: null,
    name: null,
    logo: null,
    pairAddress: null,
  };
}

/** Build a compact summary row from a round trip (+ optional classifications). */
export function buildTradeSummary(
  trip: ReconstructedRoundTrip,
  enrichment?: {
    token?: Partial<ReplayToken>;
    entryClassification?: string | null;
    exitClassification?: string | null;
    behaviorFlags?: string[];
  },
): TradeSummary {
  return {
    roundTripId: trip.roundTripId,
    token: { ...defaultToken(trip), ...(enrichment?.token ?? {}) },
    buyTime: trip.buyTime,
    sellTime: trip.sellTime,
    holdDurationSec: trip.holdDurationSec,
    costBasisSol: trip.costBasisSol,
    proceedsSol: trip.proceedsSol,
    realizedPnlSol: trip.realizedPnlSol,
    roiPercent: trip.roiPercent,
    outcome: trip.outcome,
    entryCount: trip.entryExecutions.length,
    exitCount: trip.exitExecutions.length,
    isComplex: trip.isComplex,
    closed: trip.closed,
    entryClassification: enrichment?.entryClassification ?? null,
    exitClassification: enrichment?.exitClassification ?? null,
    behaviorFlags: enrichment?.behaviorFlags ?? [],
  };
}

/** Build a full Trade Replay from a round trip and any available enrichment. */
export function buildTradeReplay(
  trip: ReconstructedRoundTrip,
  enrichment: ReplayEnrichment = {},
): TradeReplay {
  const limitations: string[] = [];
  if (!enrichment.entryQuality) {
    limitations.push("Entry quality analysis is not yet available for this trade.");
  }
  if (!enrichment.exitQuality) {
    limitations.push("Exit quality analysis is not yet available for this trade.");
  }
  if (!enrichment.pricePaths) {
    limitations.push("Historical price paths are not yet available for this trade.");
  }
  return {
    roundTripId: trip.roundTripId,
    token: { ...defaultToken(trip), ...(enrichment.token ?? {}) },
    entryExecutions: trip.entryExecutions,
    exitExecutions: trip.exitExecutions,
    buyTime: trip.buyTime,
    sellTime: trip.sellTime,
    holdDurationSec: trip.holdDurationSec,
    costBasisSol: trip.costBasisSol,
    proceedsSol: trip.proceedsSol,
    realizedPnlSol: trip.realizedPnlSol,
    roiPercent: trip.roiPercent,
    outcome: trip.outcome,
    avgEntryPriceSol: trip.avgEntryPriceSol,
    entryMarketCapUsd: enrichment.entryMarketCapUsd ?? null,
    exitMarketCapUsd: enrichment.exitMarketCapUsd ?? null,
    entryMarketCapIsFdv: enrichment.entryMarketCapIsFdv ?? false,
    exitMarketCapIsFdv: enrichment.exitMarketCapIsFdv ?? false,
    entryLiquidityUsd: enrichment.entryLiquidityUsd ?? null,
    exitLiquidityUsd: enrichment.exitLiquidityUsd ?? null,
    entryQuality: enrichment.entryQuality ?? null,
    exitQuality: enrichment.exitQuality ?? null,
    currentLiquidity: enrichment.currentLiquidity ?? null,
    behaviorFlags: enrichment.behaviorFlags ?? [],
    lossContribution: enrichment.lossContribution ?? null,
    partOfStreak: enrichment.partOfStreak ?? false,
    pricePaths: enrichment.pricePaths ?? null,
    coverage: {
      hasEntryQuality: enrichment.entryQuality?.score != null,
      hasExitQuality: enrichment.exitQuality?.score != null,
      hasPricePaths: (enrichment.pricePaths?.duringTrade.length ?? 0) > 0,
      hasLiquidity:
        enrichment.entryLiquidityUsd != null ||
        enrichment.exitLiquidityUsd != null ||
        enrichment.currentLiquidity != null,
    },
    source: enrichment.source ?? null,
    limitations,
  };
}
