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
import { getTokenMetadataBatch, getWalletTokenBalances } from "./helius.js";
import { getTokenStatsBatch } from "./prices.js";
import { getSolPriceUsd } from "./prices.js";
import { logger } from "./logger.js";
import { mintBadgesAsync } from "./badge-mint.js";
import { analyzeBehavior } from "./real-trading-behavior.js";
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
  type MintHolding,
  type OpenPosition,
  type ParsedSwapEvent,
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
  empty?: boolean;
  message?: string;
}

const TRAIT_LABELS: Record<string, string> = {
  momentum: "Momentum",
  patience: "Patient holds",
  conviction: "Conviction bets",
  risk_tolerance: "Risk appetite",
  diversification: "Diversified",
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
  const fifo = aggregateLotsByMint(openLots);
  if (fifo.length === 0) {
    return { positions: [], holdingsVerified: true, droppedGhostMints: 0 };
  }

  const balances = await getWalletTokenBalances(wallet);
  if (balances == null) {
    logger.warn({ wallet }, "Holdings unverified - live balance lookup failed");
  }
  const { holdings, verified, droppedMints } = reconcileHoldings(fifo, balances);
  if (holdings.length === 0) {
    return {
      positions: [],
      holdingsVerified: verified,
      droppedGhostMints: droppedMints,
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

  const positions = holdings.map((h: MintHolding) => {
    const stat = stats.get(h.tokenMint);
    const m = meta[h.tokenMint];
    const priceSol =
      stat?.priceSol ??
      (stat?.priceUsd != null && solUsd > 0 ? stat.priceUsd / solUsd : null);
    const currentValueSol = priceSol != null ? h.tokenAmount * priceSol : null;
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
  };
}

/** Average market cap of purchased tokens, from one batched lookup. */
async function enrichAvgMarketCap(
  events: ParsedSwapEvent[],
  metrics: TradingMetrics,
): Promise<void> {
  const buyMints = [...new Set(events.filter((e) => e.side === "buy").map((e) => e.tokenMint))];
  if (buyMints.length === 0) return;
  const stats = await getTokenStatsBatch(buyMints);
  let sum = 0;
  let count = 0;
  for (const mint of buyMints) {
    const mc = stats.get(mint)?.marketCapUsd;
    if (mc != null && mc > 0) {
      sum += mc;
      count++;
    }
  }
  if (count > 0) metrics.avgMarketCapPurchasedUsd = sum / count;
}

function emptySummary(
  wallet: string,
  syncStatus: string,
  lastSyncedAt: number | null,
): RealAnalysisSummary {
  const metrics = computeMetrics([], [], [], 0);
  return {
    wallet,
    computedAt: Math.floor(Date.now() / 1000),
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
  }>(
    `SELECT status, last_synced_at FROM real_wallet_sync_jobs WHERE wallet = $1`,
    [wallet],
  );

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
  const { positions: openPositions, holdingsVerified, droppedGhostMints } =
    await markOpenPositions(wallet, openLots);

  const firstTradeAt = events[0]!.blockTime;
  const walletAgeDays = await estimateWalletAgeDays(wallet, firstTradeAt);
  const metrics = computeMetrics(events, closed, openPositions, walletAgeDays);
  await enrichAvgMarketCap(events, metrics);

  const behavior = analyzeBehavior(events, closed, metrics);
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

  // ── Persist snapshot (full fidelity) ──────────────────────────────────────
  await dbRun(
    `INSERT INTO real_analysis_snapshots
       (wallet, user_id, computed_at, metrics_json, scores_json, personality,
        wallet_health_score, open_positions_json, insights_json, sync_trade_count,
        wallet_age_days, data_sources, personality_json, wallet_health_json,
        signals_json, dna_json, holdings_verified, dropped_ghost_mints)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
       dropped_ghost_mints = EXCLUDED.dropped_ghost_mints`,
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
  }>(
    `SELECT computed_at, metrics_json, personality, wallet_health_score,
            open_positions_json, insights_json, sync_trade_count, data_sources,
            personality_json, wallet_health_json, signals_json, dna_json,
            holdings_verified, dropped_ghost_mints
     FROM real_analysis_snapshots WHERE wallet = $1`,
    [wallet],
  );
  if (!row) return null;

  const job = await dbGet<{ status: string; last_synced_at: number | null }>(
    `SELECT status, last_synced_at FROM real_wallet_sync_jobs WHERE wallet = $1`,
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
    openPositions: parse<OpenPosition[]>(row.open_positions_json, []),
    // Old snapshots predate live-balance reconciliation - surface them as
    // unverified so the UI prompts a refresh instead of asserting stale data.
    holdingsVerified: row.holdings_verified ?? false,
    droppedGhostMints: row.dropped_ghost_mints ?? 0,
    insights: parse<BehaviorInsight[]>(row.insights_json, []),
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
