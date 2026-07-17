/**
 * Real Trading Analysis Engine - orchestrates ingestion, metrics, behavior,
 * signals, trader DNA, and wallet health into persisted snapshots plus
 * intelligence timeline events.
 *
 * Revised architecture (v2):
 *  - Signal registry is the single source for every score (reputation-ready).
 *  - Trader DNA is an evolving trait vector, not a static label.
 *  - Prices are fetched in ONE batched call (no N+1 per position).
 *  - Snapshots persist full-fidelity JSON so cached reads lose nothing.
 *  - Milestone timeline events power the feed/profile flywheel.
 */

import { dbGet, dbRun } from "./database.js";
import {
  getNativeSolBalance,
  getTokenMetadataBatch,
  getWalletTokenBalances,
} from "./helius.js";
import { getTokenStatsBatch } from "./prices.js";
import { getSolPriceUsd } from "./prices.js";
import { logger } from "./logger.js";
import { mintBadgesAsync } from "./badge-mint.js";
import { analyzeBehavior } from "./real-trading-behavior.js";
import { resolveInsightContradictions } from "./real-trading-contradictions.js";
import {
  computeWalletHealth,
  type WalletHealthBreakdown,
} from "./real-trading-health.js";
import {
  loadWalletEvents,
  syncWalletTrades,
  estimateWalletAgeDays,
} from "./real-trading-ingest.js";
import {
  matchFifo,
  computeMetrics,
  aggregateLotsByMint,
  reconcileHoldings,
  median,
  type MintHolding,
  type OpenPosition,
  type ParsedSwapEvent,
  type PositionReconciliation,
  type TradingMetrics,
} from "./real-trading-math.js";
import {
  computeSignals,
  persistSignalsWithDeltas,
  type SignalWithDelta,
} from "./real-trading-signals.js";
import {
  observeDnaVector,
  updateTraderDna,
  DNA_TRAITS,
  type TraderDna,
} from "./real-trading-dna.js";
import { emitTimelineEvents } from "./real-trading-timeline.js";
import { ensureRealTradingSchema } from "./real-trading-schema.js";
import type { BehaviorInsight } from "./real-trading-behavior.js";
import {
  reconcilePortfolio,
  type AssetValuationInput,
  type PortfolioReconciliation,
} from "./real-trading-portfolio.js";
import {
  overallAnalysisConfidence,
  type AnalysisConfidence,
} from "./real-trading-confidence.js";
import {
  computeHistoricalRisk,
  type HistoricalRisk,
} from "./real-trading-risk.js";
import {
  computeCoverage,
  type ReportCoverage,
} from "./real-trading-coverage.js";
import {
  computeHoldingsQuality,
  type HoldingsQuality,
} from "./real-trading-holdings.js";
import {
  buildCoachingContext,
  type CoachingContext,
  type CoachingEvidenceTrade,
} from "./real-trading-coaching.js";
import { reconstructRoundTrips } from "./real-trading-roundtrips.js";
import {
  computeQualityFromCandles,
  loadCachedCandlesForTrips,
  type EnrichmentStatus,
} from "./real-trading-enrichment.js";
import {
  computeCurrentLiquidityRisk,
  type LiquidityRiskSummary,
} from "./real-trading-liquidity.js";
import type {
  EntryQualitySummary,
} from "./real-trading-entry-quality.js";
import type {
  ExitQualitySummary,
} from "./real-trading-exit-quality.js";
import { PerfTimer } from "./real-trading-perf.js";
import { recordMetricHistory } from "./real-trading-trend-store.js";

export interface PersonalityView {
  personality: string;
  description: string;
  traits: string[];
}

export interface RealAnalysisSummary {
  wallet: string;
  computedAt: number;
  syncStatus: string;
  lastSyncedAt: number | null;
  tradeCount: number;
  dataSources: string;
  metrics: TradingMetrics;
  /** Registry signals with ~30d deltas - the reputation primitives. */
  signals: SignalWithDelta[];
  /** Evolving trader DNA (vector + archetype projection). */
  dna: TraderDna | null;
  /** Display projection of DNA for simple consumers. */
  personality: PersonalityView;
  walletHealth: WalletHealthBreakdown;
  openPositions: OpenPosition[];
  /**
   * True when open positions were reconciled against live on-chain balances.
   * False means the balance lookup failed (or the snapshot predates
   * verification) and holdings are trade-history estimates only.
   */
  holdingsVerified: boolean;
  /** Trade-history tokens the wallet no longer holds (excluded from positions). */
  droppedGhostMints: number;
  insights: BehaviorInsight[];
  /**
   * Truthful wallet valuation: native SOL + priced holdings (Total On-Chain)
   * vs current value reconstructable from swap history (Analyzed Trading),
   * with a per-asset audit trail. Null when balances could not be read.
   */
  portfolio: PortfolioReconciliation | null;
  /** Overall confidence gate for scores (driven by closed round-trip count). */
  analysisConfidence: AnalysisConfidence;
  /** True when swap history exceeds the per-sync reconstruction limit. */
  historyTruncated: boolean;
  /** Token↔token swaps that could not be reconstructed in SOL terms. */
  skippedTokenToToken: number;
  /**
   * Per-mint reconciliation audit trail for current positions: what FIFO
   * believed, what the chain says, and why each mint was kept / capped /
   * dropped. Empty when there is nothing to reconcile.
   */
  reconciliation: PositionReconciliation[];
  /**
   * Single identifier shared by every current-wallet metric produced in the
   * same reconciliation run (valuation, exposure, holdings, open positions).
   * The frontend uses it to guarantee it never mixes surfaces from different
   * snapshots. Equal to `computedAt`.
   */
  reconciliationId: number;
  /** Historical risk intelligence (drawdowns, streaks, volatility). Phase 2B. */
  historicalRisk?: HistoricalRisk | null;
  /** Report coverage & confidence metadata. Phase 2B. */
  coverage?: ReportCoverage | null;
  /** Current holdings quality & conviction (verified holdings only). Phase 2B. */
  holdingsQuality?: HoldingsQuality | null;
  /** Deterministic, rule-based coaching context (no AI). Phase 2B. */
  coaching?: CoachingContext | null;
  /** Entry quality summary (evidence stripped for size). Phase 2C. */
  entryQuality?: EntryQualitySummary | null;
  /** Exit quality summary (evidence stripped for size). Phase 2C. */
  exitQuality?: ExitQualitySummary | null;
  /** Current-holdings liquidity risk (never mixed with historical). Phase 2C. */
  liquidityRisk?: LiquidityRiskSummary | null;
  /** Readiness of entry/exit intelligence enrichment. Phase 2C. */
  enrichmentStatus?: EnrichmentStatus | null;
  empty?: boolean;
  message?: string;
}

/** Drop heavy per-trade evidence arrays before persisting a summary. */
function trimEntrySummary(
  s: EntryQualitySummary | null,
): EntryQualitySummary | null {
  return s ? { ...s, evidence: [] } : null;
}
function trimExitSummary(
  s: ExitQualitySummary | null,
): ExitQualitySummary | null {
  return s ? { ...s, evidence: [] } : null;
}

const TRAIT_LABELS: Record<string, string> = {
  momentum: "Momentum",
  patience: "Patient holds",
  conviction: "Conviction bets",
  risk_tolerance: "Risk appetite",
  diversification: "Trades many tokens",
  discipline: "Disciplined",
  recovery: "Resilient",
  rotation: "Narrative rotation",
  scalping: "Fast execution",
  swing: "Swing style",
  fomo: "Momentum chasing",
};

function personalityFromDna(dna: TraderDna): PersonalityView {
  const topTraits = [...DNA_TRAITS]
    .map((t) => ({ t, v: dna.vector[t] }))
    .sort((a, b) => b.v - a.v)
    .filter((x) => x.v >= 0.5)
    .slice(0, 4)
    .map((x) => TRAIT_LABELS[x.t] ?? x.t);
  return {
    personality: dna.primaryLabel,
    description: dna.primaryDescription,
    traits: topTraits,
  };
}

const EMPTY_PERSONALITY: PersonalityView = {
  personality: "Emerging Trader",
  description:
    "Building your track record. BlackPebble will refine your profile as more trades are analyzed.",
  traits: [],
};

interface MarkedPositions {
  positions: OpenPosition[];
  /** Live on-chain balances were available and applied. */
  holdingsVerified: boolean;
  /** Trade-history mints the wallet no longer actually holds. */
  droppedGhostMints: number;
  /** Raw live balances (all mints) - reused for portfolio valuation. */
  balances: Map<string, number> | null;
  /** Per-mint reconciliation audit trail (kept/dropped/capped). */
  reconciliation: PositionReconciliation[];
  /** Live pool liquidity (USD) per current-position mint. Phase 2C. */
  liquidityByMint: Map<string, number | null>;
  /** SOL→USD rate used for the current valuation. Phase 2C. */
  solUsd: number;
}

/**
 * Turn FIFO leftovers into TRUTHFUL open positions:
 *  1. Aggregate lots per mint.
 *  2. Reconcile against LIVE on-chain balances - swap history can't see
 *     transfers/burns/non-swap exits, so unreconciled FIFO systematically
 *     overstates holdings ("ghost positions").
 *  3. Price + identify with ONE batched lookup each (no N+1).
 */
async function markOpenPositions(
  wallet: string,
  openLots: ReturnType<typeof matchFifo>["openLots"],
): Promise<MarkedPositions> {
  const balances = await getWalletTokenBalances(wallet);
  if (balances == null) {
    logger.warn({ wallet }, "Holdings unverified - live balance lookup failed");
  }

  const fifo = aggregateLotsByMint(openLots);
  if (fifo.length === 0) {
    return {
      positions: [],
      holdingsVerified: balances != null,
      droppedGhostMints: 0,
      balances,
      reconciliation: [],
      liquidityByMint: new Map(),
      solUsd: 0,
    };
  }

  const { holdings, verified, droppedMints, diagnostics } = reconcileHoldings(
    fifo,
    balances,
  );
  if (holdings.length === 0) {
    return {
      positions: [],
      holdingsVerified: verified,
      droppedGhostMints: droppedMints,
      balances,
      reconciliation: diagnostics,
      liquidityByMint: new Map(),
      solUsd: 0,
    };
  }

  const mints = holdings.map((h) => h.tokenMint);
  const [stats, solUsd, meta] = await Promise.all([
    getTokenStatsBatch(mints),
    getSolPriceUsd().catch(() => 0),
    getTokenMetadataBatch(mints).catch(
      () => ({}) as Awaited<ReturnType<typeof getTokenMetadataBatch>>,
    ),
  ]);

  const liquidityByMint = new Map<string, number | null>();
  const positions = holdings.map((h: MintHolding) => {
    const stat = stats.get(h.tokenMint);
    const m = meta[h.tokenMint];
    liquidityByMint.set(h.tokenMint, stat?.liquidityUsd ?? null);
    const priceSol =
      stat?.priceSol ??
      (stat?.priceUsd != null && solUsd > 0 ? stat.priceUsd / solUsd : null);
    const currentValueSol = priceSol != null ? h.tokenAmount * priceSol : null;
    // An open position only counts toward the Analyzed Trading Portfolio when
    // it is actually priced; unpriced holdings are disclosed, not valued.
    const diag = diagnostics.find((d) => d.mint === h.tokenMint);
    if (diag) diag.includedInAnalyzed = priceSol != null && priceSol > 0;
    return {
      tokenMint: h.tokenMint,
      symbol: m?.symbol ?? stat?.symbol ?? null,
      name: m?.name ?? stat?.name ?? null,
      logo: m?.logo ?? stat?.logo ?? null,
      tokenAmount: h.tokenAmount,
      costBasisSol: h.costBasisSol,
      avgEntryPriceSol: h.costBasisSol / h.tokenAmount,
      firstAcquiredAt: h.firstAcquiredAt,
      currentPriceSol: priceSol,
      currentValueSol,
      unrealizedPnlSol:
        currentValueSol != null ? currentValueSol - h.costBasisSol : null,
      marketCapUsd: stat?.marketCapUsd ?? null,
    };
  });

  return {
    positions,
    holdingsVerified: verified,
    droppedGhostMints: droppedMints,
    balances,
    reconciliation: diagnostics,
    liquidityByMint,
    solUsd,
  };
}

/**
 * Build a truthful portfolio valuation (Part 1). Prices EVERY live holding -
 * not just swap-traced ones - and classifies each as priced / unpriced / spam /
 * unsupported / excluded so totals are never silently understated. `tracedMints`
 * are the mints reconstructable from swap history (they power the Analyzed
 * Trading Portfolio). Returns null only when live balances are unavailable.
 */
async function buildPortfolio(
  wallet: string,
  balances: Map<string, number> | null,
  tracedMints: Set<string>,
): Promise<PortfolioReconciliation | null> {
  const nativeSol = await getNativeSolBalance(wallet).catch(() => null);

  if (balances == null) {
    // No token balances, but native SOL alone is still a truthful partial total.
    if (nativeSol == null) return null;
    return reconcilePortfolio(nativeSol, []);
  }

  const mints = [...balances.keys()];
  const [stats, solUsd, meta] = await Promise.all([
    getTokenStatsBatch(mints),
    getSolPriceUsd().catch(() => 0),
    getTokenMetadataBatch(mints).catch(
      () => ({}) as Awaited<ReturnType<typeof getTokenMetadataBatch>>,
    ),
  ]);

  const inputs: AssetValuationInput[] = mints.map((mint) => {
    const amount = balances.get(mint) ?? 0;
    const stat = stats.get(mint);
    const priceSol =
      stat?.priceSol ??
      (stat?.priceUsd != null && solUsd > 0 ? stat.priceUsd / solUsd : null);
    return {
      mint,
      symbol: meta[mint]?.symbol ?? stat?.symbol ?? null,
      amount,
      priceSol: priceSol != null && priceSol > 0 ? priceSol : null,
      priceSource: priceSol != null && priceSol > 0 ? "dexscreener" : null,
      tracedByHistory: tracedMints.has(mint),
    };
  });

  return reconcilePortfolio(nativeSol ?? 0, inputs);
}

/**
 * Average market cap of purchased tokens, from one batched lookup.
 *
 * Honest MC vs FDV (Phase 2, Part 3B): DexScreener's blended `marketCapUsd`
 * silently falls back to FDV. We prefer TRUE circulating market cap and only
 * fall back to FDV when no true market cap is available for any buy - and in
 * that case we FLAG it (`avgMarketCapIsFdv`) so the UI never calls FDV
 * "market cap". Also reports the median so a few mega-cap outliers cannot skew
 * the headline number.
 */
async function enrichAvgMarketCap(
  events: ParsedSwapEvent[],
  metrics: TradingMetrics,
): Promise<void> {
  const buyMints = [...new Set(events.filter((e) => e.side === "buy").map((e) => e.tokenMint))];
  if (buyMints.length === 0) return;
  const stats = await getTokenStatsBatch(buyMints);
  const trueMc: number[] = [];
  const fdv: number[] = [];
  for (const mint of buyMints) {
    const s = stats.get(mint);
    const mc = s?.trueMarketCapUsd;
    const f = s?.fdvUsd;
    if (mc != null && mc > 0) trueMc.push(mc);
    else if (f != null && f > 0) fdv.push(f);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if (trueMc.length > 0) {
    metrics.avgMarketCapPurchasedUsd = avg(trueMc);
    metrics.medianMarketCapPurchasedUsd = median(trueMc);
    metrics.avgMarketCapIsFdv = false;
  } else if (fdv.length > 0) {
    metrics.avgMarketCapPurchasedUsd = avg(fdv);
    metrics.medianMarketCapPurchasedUsd = median(fdv);
    metrics.avgMarketCapIsFdv = true;
  }
}

function emptySummary(
  wallet: string,
  syncStatus: string,
  lastSyncedAt: number | null,
): RealAnalysisSummary {
  const metrics = computeMetrics([], [], [], 0);
  const computedAt = Math.floor(Date.now() / 1000);
  return {
    wallet,
    computedAt,
    syncStatus,
    lastSyncedAt,
    tradeCount: 0,
    dataSources: "helius_swap_history",
    metrics,
    signals: [],
    dna: null,
    personality: EMPTY_PERSONALITY,
    walletHealth: computeWalletHealth([], metrics),
    openPositions: [],
    holdingsVerified: true,
    droppedGhostMints: 0,
    insights: [],
    portfolio: null,
    analysisConfidence: overallAnalysisConfidence(0, 0),
    historyTruncated: false,
    skippedTokenToToken: 0,
    reconciliation: [],
    reconciliationId: computedAt,
    historicalRisk: null,
    coverage: null,
    holdingsQuality: null,
    coaching: null,
    entryQuality: null,
    exitQuality: null,
    liquidityRisk: null,
    enrichmentStatus: "insufficient_data",
    empty: true,
    message:
      "No swap history found yet. Connect your wallet and sync to begin analysis.",
  };
}

export async function runAnalysis(
  wallet: string,
  options?: { sync?: boolean },
): Promise<RealAnalysisSummary> {
  await ensureRealTradingSchema();

  if (options?.sync !== false) {
    await syncWalletTrades(wallet);
  }

  const events = await loadWalletEvents(wallet);
  const job = await dbGet<{
    status: string;
    last_synced_at: number | null;
    history_truncated: boolean | null;
    skipped_token_to_token: number | null;
  }>(
    `SELECT status, last_synced_at, history_truncated, skipped_token_to_token
       FROM real_wallet_sync_jobs WHERE wallet = $1`,
    [wallet],
  );
  const historyTruncated = job?.history_truncated ?? false;
  const skippedTokenToToken = job?.skipped_token_to_token ?? 0;

  if (events.length === 0) {
    return emptySummary(wallet, job?.status ?? "idle", job?.last_synced_at ?? null);
  }

  // Previous snapshot state - needed for milestone detection BEFORE overwrite.
  const prevSnapshot = await dbGet<{
    sync_trade_count: number;
    wallet_health_score: number | null;
    metrics_json: string;
  }>(
    `SELECT sync_trade_count, wallet_health_score, metrics_json
       FROM real_analysis_snapshots WHERE wallet = $1`,
    [wallet],
  );
  let prevLargestGain: number | null = null;
  if (prevSnapshot?.metrics_json) {
    try {
      prevLargestGain =
        (JSON.parse(prevSnapshot.metrics_json) as TradingMetrics)
          .largestGainSol ?? null;
    } catch {
      prevLargestGain = null;
    }
  }

  // ── Compute ────────────────────────────────────────────────────────────────
  const { closed, openLots } = matchFifo(events);
  const {
    positions: openPositions,
    holdingsVerified,
    droppedGhostMints,
    balances,
    reconciliation,
    liquidityByMint,
    solUsd: currentSolUsd,
  } = await markOpenPositions(wallet, openLots);

  logger.info(
    {
      analyzedWallet: wallet,
      balanceLookup: balances == null ? "FAILED" : `${balances.size} mints`,
      holdingsVerified,
      droppedGhostMints,
      openPositions: openPositions.length,
      openPositionsValueSol: openPositions.reduce(
        (s, p) => s + (p.currentValueSol ?? 0),
        0,
      ),
    },
    "TI holdings reconciled against live balances",
  );

  const portfolio = await buildPortfolio(
    wallet,
    balances,
    new Set(openPositions.map((p) => p.tokenMint)),
  ).catch((e) => {
    logger.warn({ err: e, wallet }, "Portfolio valuation failed");
    return null;
  });

  logger.info(
    {
      analyzedWallet: wallet,
      portfolio:
        portfolio == null
          ? "NULL"
          : {
              nativeSol: portfolio.nativeSol,
              totalOnChainSol: portfolio.totalOnChainPortfolioSol,
              analyzedTradingSol: portfolio.analyzedTradingPortfolioSol,
              priced: portfolio.counts.priced,
              unpriced: portfolio.counts.unpriced,
            },
    },
    "TI portfolio reconciled",
  );

  const analysisConfidence = overallAnalysisConfidence(
    closed.length,
    events.length,
  );

  const firstTradeAt = events[0]!.blockTime;
  const walletAgeDays = await estimateWalletAgeDays(wallet, firstTradeAt);
  const metrics = computeMetrics(events, closed, openPositions, walletAgeDays);
  await enrichAvgMarketCap(events, metrics);

  const behavior = analyzeBehavior(events, closed, metrics);
  // Never surface two opposite statements about the same trader (e.g. "diamond
  // hands" alongside "sells winners early"). Keep the strongest-evidence one.
  behavior.insights = resolveInsightContradictions(behavior.insights);
  const health = computeWalletHealth(openPositions, metrics);
  const computedAt = Math.floor(Date.now() / 1000);

  const userRow = await dbGet<{ user_id: number }>(
    `SELECT user_id FROM user_identities WHERE wallet_address = $1 LIMIT 1`,
    [wallet],
  );
  const userId = userRow?.user_id ?? null;

  // Signals: compute → persist → deltas.
  const rawSignals = computeSignals({
    events,
    closed,
    openPositions,
    metrics,
    behaviorTags: behavior.tags,
  });
  const signals = await persistSignalsWithDeltas(wallet, userId, rawSignals, computedAt);

  // Trader DNA: observe → evolve (EMA) → classify.
  const observed = observeDnaVector(metrics, rawSignals, behavior.tags);
  const dna = await updateTraderDna(wallet, userId, observed, metrics.totalTrades, computedAt);
  const personality = personalityFromDna(dna);

  // ── Phase 2B intelligence (all pure, computed once from in-memory data) ────
  const historicalRisk = computeHistoricalRisk(closed, events);
  const medianEntrySol = median(
    events.filter((e) => e.side === "buy" && e.solAmount > 0).map((e) => e.solAmount),
  );
  const holdingsQuality = computeHoldingsQuality(
    openPositions,
    holdingsVerified,
    medianEntrySol,
    computedAt,
  );
  // ── Phase 2C: entry/exit quality (from cached candles only - no blocking
  // external calls), current-holdings liquidity, trade-replay round trips ────
  const { closed: roundTrips } = reconstructRoundTrips(events, "solana");
  const cachedCandles = await loadCachedCandlesForTrips(
    "solana",
    roundTrips,
  ).catch(() => new Map());
  const quality = computeQualityFromCandles(
    roundTrips,
    cachedCandles,
    analysisConfidence.tier,
    "geckoterminal_cache",
  );
  const entryQuality = quality.entrySummary;
  const exitQuality = quality.exitSummary;
  const enrichmentStatus = quality.status;

  // Current-holdings liquidity risk (NEVER mixed with historical trades).
  const liquidityRisk = computeCurrentLiquidityRisk(
    openPositions.map((p) => ({
      mint: p.tokenMint,
      symbol: p.symbol,
      holdingValueUsd:
        p.currentValueSol != null && currentSolUsd > 0
          ? p.currentValueSol * currentSolUsd
          : null,
      liquidityUsd: liquidityByMint.get(p.tokenMint) ?? null,
    })),
  );

  const coverage = computeCoverage({
    parsedSwaps: events.length,
    unsupportedSwaps: skippedTokenToToken,
    completedTrades: closed.length,
    verifiedHoldings:
      portfolio?.counts.priced ??
      openPositions.filter((p) => p.currentValueSol != null).length,
    unpricedHoldings:
      portfolio?.counts.unpriced ??
      openPositions.filter((p) => p.currentValueSol == null).length,
    holdingsVerified,
    historyTruncated,
    droppedGhostMints,
    firstTradeAt: metrics.firstTradeAt,
    lastTradeAt: metrics.lastTradeAt,
    entryQualityCoverage: entryQuality.coveragePercent / 100,
    exitQualityCoverage: exitQuality.coveragePercent / 100,
    liquidityCoverage: liquidityRisk.liquidityCoverage,
    sources: ["helius_swap_history", "dexscreener_prices", "geckoterminal_ohlcv"],
  });

  // Selected evidence trades: the biggest realized losses (most instructive).
  const evidenceTrades: CoachingEvidenceTrade[] = [...roundTrips]
    .filter((t) => t.realizedPnlSol < 0)
    .sort((a, b) => a.realizedPnlSol - b.realizedPnlSol)
    .slice(0, 6)
    .map((t) => ({
      roundTripId: t.roundTripId,
      mint: t.tokenMint,
      realizedPnlSol: t.realizedPnlSol,
      reason: "Among the largest realized losses in the analyzed history.",
    }));

  const coaching = buildCoachingContext({
    signals,
    insights: behavior.insights,
    historicalRisk,
    reportConfidence: analysisConfidence.tier,
    entrySummary: entryQuality,
    exitSummary: exitQuality,
    liquiditySummary: liquidityRisk,
    coverageTier: coverage.tier,
    analyzedRange: {
      start: metrics.firstTradeAt,
      end: metrics.lastTradeAt,
    },
    evidenceTrades,
  });

  // ── Persist snapshot (full fidelity) ──────────────────────────────────────
  await dbRun(
    `INSERT INTO real_analysis_snapshots
       (wallet, user_id, computed_at, metrics_json, scores_json, personality,
        wallet_health_score, open_positions_json, insights_json, sync_trade_count,
        wallet_age_days, data_sources, personality_json, wallet_health_json,
        signals_json, dna_json, holdings_verified, dropped_ghost_mints,
        portfolio_json, reconciliation_json,
        historical_risk_json, coverage_json, holdings_quality_json, coaching_json,
        entry_quality_json, exit_quality_json, liquidity_json, enrichment_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
     ON CONFLICT (wallet) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       computed_at = EXCLUDED.computed_at,
       metrics_json = EXCLUDED.metrics_json,
       scores_json = EXCLUDED.scores_json,
       personality = EXCLUDED.personality,
       wallet_health_score = EXCLUDED.wallet_health_score,
       open_positions_json = EXCLUDED.open_positions_json,
       insights_json = EXCLUDED.insights_json,
       sync_trade_count = EXCLUDED.sync_trade_count,
       wallet_age_days = EXCLUDED.wallet_age_days,
       data_sources = EXCLUDED.data_sources,
       personality_json = EXCLUDED.personality_json,
       wallet_health_json = EXCLUDED.wallet_health_json,
       signals_json = EXCLUDED.signals_json,
       dna_json = EXCLUDED.dna_json,
       holdings_verified = EXCLUDED.holdings_verified,
       dropped_ghost_mints = EXCLUDED.dropped_ghost_mints,
       portfolio_json = EXCLUDED.portfolio_json,
       reconciliation_json = EXCLUDED.reconciliation_json,
       historical_risk_json = EXCLUDED.historical_risk_json,
       coverage_json = EXCLUDED.coverage_json,
       holdings_quality_json = EXCLUDED.holdings_quality_json,
       coaching_json = EXCLUDED.coaching_json,
       entry_quality_json = EXCLUDED.entry_quality_json,
       exit_quality_json = EXCLUDED.exit_quality_json,
       liquidity_json = EXCLUDED.liquidity_json,
       enrichment_status = EXCLUDED.enrichment_status`,
    [
      wallet,
      userId,
      computedAt,
      JSON.stringify(metrics),
      // scores_json kept for backward compatibility with older readers; the
      // signal registry is now the canonical score source.
      JSON.stringify(Object.fromEntries(signals.map((s) => [s.key, s.value]))),
      personality.personality,
      health.score,
      JSON.stringify(openPositions),
      JSON.stringify(behavior.insights),
      events.length,
      metrics.walletAgeDays,
      "helius_swap_history,dexscreener_prices",
      JSON.stringify(personality),
      JSON.stringify(health),
      JSON.stringify(signals),
      JSON.stringify(dna),
      holdingsVerified,
      droppedGhostMints,
      portfolio ? JSON.stringify(portfolio) : null,
      JSON.stringify(reconciliation),
      JSON.stringify(historicalRisk),
      JSON.stringify(coverage),
      JSON.stringify(holdingsQuality),
      JSON.stringify(coaching),
      JSON.stringify(trimEntrySummary(entryQuality)),
      JSON.stringify(trimExitSummary(exitQuality)),
      JSON.stringify(liquidityRisk),
      enrichmentStatus,
    ],
  );

  // Insight history (retention flywheel).
  for (const insight of behavior.insights) {
    await dbRun(
      `INSERT INTO real_insights
         (wallet, insight_key, category, title, description, severity, confidence, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (wallet, insight_key) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         severity = EXCLUDED.severity,
         confidence = EXCLUDED.confidence,
         computed_at = EXCLUDED.computed_at`,
      [
        wallet,
        insight.key,
        insight.category,
        insight.title,
        insight.description,
        insight.severity,
        insight.confidence,
        computedAt,
      ],
    );
  }

  // Milestone timeline events (best-effort - never fails the analysis).
  try {
    await emitTimelineEvents({
      wallet,
      userId,
      isFirstAnalysis: !prevSnapshot,
      tradeCount: events.length,
      previousTradeCount: prevSnapshot?.sync_trade_count ?? 0,
      signals,
      dna,
      walletHealthScore: health.score,
      previousWalletHealthScore: prevSnapshot?.wallet_health_score ?? null,
      largestGainSol: metrics.largestGainSol,
      previousLargestGainSol: prevLargestGain,
    });
  } catch (e) {
    logger.warn({ err: e, wallet }, "Timeline event emission failed");
  }

  if (userId) {
    mintBadgesAsync(userId);
  }

  // Append-only trend history (best-effort, dedup-gated). Historical scope for
  // trade-quality metrics; current scope for live-holdings metrics.
  try {
    await recordMetricHistory(
      wallet,
      userId,
      [
        { metricKey: "risk.profit_factor", scope: "historical", value: historicalRisk.profitFactor ?? null, sampleSize: closed.length },
        { metricKey: "risk.max_drawdown_pct", scope: "historical", value: historicalRisk.maxDrawdownPercent ?? null, sampleSize: closed.length },
        { metricKey: "entry.avg_score", scope: "historical", value: entryQuality.avgEntryScore, sampleSize: entryQuality.analyzedEntries, confidenceTier: entryQuality.confidence },
        { metricKey: "exit.avg_score", scope: "historical", value: exitQuality.avgExitScore, sampleSize: exitQuality.analyzedExits, confidenceTier: exitQuality.confidence },
        { metricKey: "coverage.pricing", scope: "historical", value: coverage.pricingCoverage, sampleSize: closed.length, confidenceTier: coverage.tier },
        { metricKey: "holdings.weighted_liquidity_quality", scope: "current", value: liquidityRisk.weightedLiquidityQuality, sampleSize: liquidityRisk.positions.length, confidenceTier: liquidityRisk.confidence },
        { metricKey: "activity.trades_per_week", scope: "historical", value: metrics.tradingFrequencyPerWeek, sampleSize: events.length },
      ],
      computedAt,
      computedAt,
    );
  } catch (e) {
    logger.warn({ err: e, wallet }, "Metric history recording failed");
  }

  logger.info(
    { wallet, trades: events.length, archetype: dna.primaryArchetype },
    "Real trading analysis computed",
  );

  return {
    wallet,
    computedAt,
    syncStatus: job?.status ?? "idle",
    lastSyncedAt: job?.last_synced_at ?? null,
    tradeCount: events.length,
    dataSources: "helius_swap_history,dexscreener_prices",
    metrics,
    signals,
    dna,
    personality,
    walletHealth: health,
    openPositions,
    holdingsVerified,
    droppedGhostMints,
    insights: behavior.insights,
    portfolio,
    analysisConfidence,
    historyTruncated,
    skippedTokenToToken,
    reconciliation,
    reconciliationId: computedAt,
    historicalRisk,
    coverage,
    holdingsQuality,
    coaching,
    entryQuality,
    exitQuality,
    liquidityRisk,
    enrichmentStatus,
  };
}

export async function getCachedAnalysis(
  wallet: string,
): Promise<RealAnalysisSummary | null> {
  await ensureRealTradingSchema();
  const row = await dbGet<{
    computed_at: number;
    metrics_json: string;
    personality: string | null;
    wallet_health_score: number | null;
    open_positions_json: string | null;
    insights_json: string | null;
    sync_trade_count: number;
    data_sources: string;
    personality_json: string | null;
    wallet_health_json: string | null;
    signals_json: string | null;
    dna_json: string | null;
    holdings_verified: boolean | null;
    dropped_ghost_mints: number | null;
    portfolio_json: string | null;
    reconciliation_json: string | null;
    historical_risk_json: string | null;
    coverage_json: string | null;
    holdings_quality_json: string | null;
    coaching_json: string | null;
    entry_quality_json: string | null;
    exit_quality_json: string | null;
    liquidity_json: string | null;
    enrichment_status: string | null;
  }>(
    `SELECT computed_at, metrics_json, personality, wallet_health_score,
            open_positions_json, insights_json, sync_trade_count, data_sources,
            personality_json, wallet_health_json, signals_json, dna_json,
            holdings_verified, dropped_ghost_mints, portfolio_json,
            reconciliation_json, historical_risk_json, coverage_json,
            holdings_quality_json, coaching_json, entry_quality_json,
            exit_quality_json, liquidity_json, enrichment_status
     FROM real_analysis_snapshots WHERE wallet = $1`,
    [wallet],
  );
  if (!row) return null;

  // A snapshot written before the live-balance reconciliation pipeline has no
  // reconciliation_json. Such snapshots stored raw FIFO leftovers as
  // "open positions" and could report holdings_verified=true, which is exactly
  // how a sold/transferred token (e.g. a ghost ANSEM row) survived into the UI.
  // We refuse to serve legacy snapshots as current data: returning null forces
  // the caller to recompute a fresh, fully reconciled snapshot.
  if (row.reconciliation_json == null) return null;

  const job = await dbGet<{
    status: string;
    last_synced_at: number | null;
    history_truncated: boolean | null;
    skipped_token_to_token: number | null;
  }>(
    `SELECT status, last_synced_at, history_truncated, skipped_token_to_token
       FROM real_wallet_sync_jobs WHERE wallet = $1`,
    [wallet],
  );

  const parse = <T>(json: string | null, fallback: T): T => {
    if (!json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  };

  const metrics = parse<TradingMetrics>(row.metrics_json, computeMetrics([], [], [], 0));
  const personality = parse<PersonalityView>(row.personality_json, {
    personality: row.personality ?? EMPTY_PERSONALITY.personality,
    description: "",
    traits: [],
  });
  const walletHealth = parse<WalletHealthBreakdown>(row.wallet_health_json, {
    score: row.wallet_health_score ?? 0,
    deadPositions: 0,
    dustPositions: 0,
    concentrationRisk: 0,
    diversification: metrics.diversificationScore ?? 0,
    portfolioCleanliness: 0,
    notes: [],
  });

  const holdingsVerified = row.holdings_verified ?? false;
  const reconciliation = parse<PositionReconciliation[]>(
    row.reconciliation_json,
    [],
  );

  // Canonical current-positions rule. A stored position may only be replayed
  // when (a) holdings were verified against live balances in this snapshot AND
  // (b) the reconciliation audit for that exact mint says it is a currently
  // held, non-ghost open position. This makes a stale snapshot physically
  // incapable of resurrecting a token the wallet no longer holds.
  const canonicalMints = new Set(
    reconciliation
      .filter((r) => r.includedInOpenPositions && !r.droppedAsGhost)
      .map((r) => r.mint),
  );
  const storedPositions = holdingsVerified
    ? parse<OpenPosition[]>(row.open_positions_json, [])
    : [];
  const openPositions = holdingsVerified
    ? storedPositions.filter((p) => canonicalMints.has(p.tokenMint))
    : [];

  return {
    wallet,
    computedAt: row.computed_at,
    syncStatus: job?.status ?? "idle",
    lastSyncedAt: job?.last_synced_at ?? null,
    tradeCount: row.sync_trade_count,
    dataSources: row.data_sources,
    metrics,
    signals: parse<SignalWithDelta[]>(row.signals_json, []),
    dna: parse<TraderDna | null>(row.dna_json, null),
    personality,
    walletHealth,
    openPositions,
    holdingsVerified,
    droppedGhostMints: row.dropped_ghost_mints ?? 0,
    insights: parse<BehaviorInsight[]>(row.insights_json, []),
    portfolio: parse<PortfolioReconciliation | null>(row.portfolio_json, null),
    analysisConfidence: overallAnalysisConfidence(
      metrics.closedRoundTrips,
      metrics.totalTrades,
    ),
    historyTruncated: job?.history_truncated ?? false,
    skippedTokenToToken: job?.skipped_token_to_token ?? 0,
    reconciliation,
    reconciliationId: row.computed_at,
    historicalRisk: parse<HistoricalRisk | null>(row.historical_risk_json, null),
    coverage: parse<ReportCoverage | null>(row.coverage_json, null),
    holdingsQuality: parse<HoldingsQuality | null>(row.holdings_quality_json, null),
    coaching: parse<CoachingContext | null>(row.coaching_json, null),
    entryQuality: parse<EntryQualitySummary | null>(row.entry_quality_json, null),
    exitQuality: parse<ExitQualitySummary | null>(row.exit_quality_json, null),
    liquidityRisk: parse<LiquidityRiskSummary | null>(row.liquidity_json, null),
    enrichmentStatus: (row.enrichment_status as EnrichmentStatus | null) ?? null,
  };
}

export async function syncAllLinkedWallets(): Promise<void> {
  const { getLinkedWallets } = await import("./real-trading-ingest.js");
  const wallets = await getLinkedWallets();
  for (const wallet of wallets) {
    try {
      await runAnalysis(wallet, { sync: true });
    } catch (e) {
      logger.warn({ err: e, wallet }, "Background real analysis sync failed");
    }
  }
}
