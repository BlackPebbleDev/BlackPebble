import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isAdmin, ownsWallet, sessionFromRequest } from "../lib/auth.js";
import { dbGet } from "../lib/database.js";
import { getFeatureFlags } from "../lib/featureFlags.js";
import { getNativeSolBalance, getTokenMetadataBatch } from "../lib/helius.js";
import { logger } from "../lib/logger.js";
import { getSolPriceUsd } from "../lib/prices.js";
import {
  getCachedAnalysis,
  runAnalysis,
} from "../lib/real-trading-engine.js";
import { loadWalletEvents, syncWalletTrades } from "../lib/real-trading-ingest.js";
import { matchFifo } from "../lib/real-trading-math.js";
import { buildPerformanceReport } from "../lib/real-trading-performance.js";
import { ensureRealTradingSchema } from "../lib/real-trading-schema.js";
import { getTimeline } from "../lib/real-trading-timeline.js";
import {
  reconstructRoundTrips,
  type ReconstructedRoundTrip,
} from "../lib/real-trading-roundtrips.js";
import {
  buildTradeReplay,
  buildTradeSummary,
  type TradeSummary,
} from "../lib/real-trading-replay.js";
import {
  analyzeEntry,
  type EntryPattern,
} from "../lib/real-trading-entry-quality.js";
import {
  analyzeExit,
  type ExitPattern,
} from "../lib/real-trading-exit-quality.js";
import {
  enrichWalletTrades,
  intervalForHold,
  windowForTrip,
} from "../lib/real-trading-enrichment.js";
import { readCachedCandles } from "../lib/market-data/cache.js";
import { candlesInRange, type HistoricalCandle } from "../lib/market-data/types.js";
import { getTokenStatsBatch } from "../lib/prices.js";
import { classifyHoldingLiquidity } from "../lib/real-trading-liquidity.js";

const router: IRouter = Router();

const syncLimiter = rateLimit({
  windowMs: 60_000,
  max: 3,
  message: { error: "Sync rate limit - try again in a minute" },
  standardHeaders: true,
  legacyHeaders: false,
});

function isValidWallet(w: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w);
}

async function assertFeatureEnabled(): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags.real_trading_analysis;
}

/** GET /real-analysis/:wallet - public read (blockchain data is public). */
router.get(
  "/real-analysis/:wallet",
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }

    const wallet = String(req.params.wallet ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    await ensureRealTradingSchema();

    const refresh = req.query.refresh === "true";
    if (refresh) {
      const analysis = await runAnalysis(wallet, { sync: true });
      logger.info(
        { analyzedWallet: wallet, source: "fresh", computedAt: analysis.computedAt },
        "TI analysis served (refresh)",
      );
      return res.json({ analysis });
    }

    const cached = await getCachedAnalysis(wallet);
    if (cached) {
      logger.info(
        { analyzedWallet: wallet, source: "cache", computedAt: cached.computedAt },
        "TI analysis served (cache)",
      );
      return res.json({ analysis: cached });
    }

    const analysis = await runAnalysis(wallet, { sync: true });
    logger.info(
      { analyzedWallet: wallet, source: "fresh-cold", computedAt: analysis.computedAt },
      "TI analysis served (cold)",
    );
    return res.json({ analysis });
  }),
);

/** POST /real-analysis/:wallet/sync - trigger manual sync (rate limited). */
router.post(
  "/real-analysis/:wallet/sync",
  syncLimiter,
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }

    const wallet = String(req.params.wallet ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const session = await sessionFromRequest(req);
    if (session?.wallet && session.wallet !== wallet) {
      const linked = await dbGet<{ wallet_address: string }>(
        `SELECT wallet_address FROM user_identities
         WHERE user_id = $1 AND wallet_address = $2`,
        [session.sub, wallet],
      );
      if (!linked) {
        return res.status(403).json({ error: "Wallet not linked to your account" });
      }
    }

    const syncResult = await syncWalletTrades(wallet, { force: false });
    const analysis = await runAnalysis(wallet, { sync: false });
    return res.json({ sync: syncResult, analysis });
  }),
);

/** GET /real-analysis/:wallet/insights - behavioral insights only. */
router.get(
  "/real-analysis/:wallet/insights",
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }

    const wallet = String(req.params.wallet ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const cached = await getCachedAnalysis(wallet);
    if (cached) {
      return res.json({ insights: cached.insights });
    }

    const analysis = await runAnalysis(wallet);
    return res.json({ insights: analysis.insights });
  }),
);

/**
 * GET /real-analysis/:wallet/performance - chart series and per-token
 * performance, derived entirely from already-ingested local trade data.
 * Only the displayed winners/losers get a (cached) metadata lookup.
 */
router.get(
  "/real-analysis/:wallet/performance",
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }

    const wallet = String(req.params.wallet ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    await ensureRealTradingSchema();
    const events = await loadWalletEvents(wallet);
    const { closed } = matchFifo(events);
    const report = buildPerformanceReport(events, closed);

    const displayMints = [
      ...new Set(
        [...report.topWinners, ...report.topLosers].map((t) => t.tokenMint),
      ),
    ];
    if (displayMints.length > 0) {
      const meta = await getTokenMetadataBatch(displayMints).catch(
        () => ({}) as Awaited<ReturnType<typeof getTokenMetadataBatch>>,
      );
      for (const t of [...report.topWinners, ...report.topLosers]) {
        const m = meta[t.tokenMint];
        if (m) {
          t.symbol = m.symbol;
          t.name = m.name;
          t.logo = m.logo;
        }
      }
    }

    return res.json({ performance: report });
  }),
);

/**
 * GET /real-analysis/:wallet/diagnostics - protected line-by-line portfolio
 * reconciliation for staging sign-off (Phase 1 validation).
 *
 * Access: the authenticated OWNER of the wallet, or an admin. Returns ONLY
 * public on-chain + market data (balances, prices, valuations, classifications)
 * plus the derived totals in SOL and USD. Never exposes secrets, tokens, seed
 * phrases, or other users' data.
 *
 * `?refresh=true` forces a fresh sync + recompute before reporting.
 */
router.get(
  "/real-analysis/:wallet/diagnostics",
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }

    const wallet = String(req.params.wallet ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    // Owner-or-admin gate: this is a diagnostics surface, not public data.
    const session = await sessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const allowed = isAdmin(session) || (await ownsWallet(session, wallet));
    if (!allowed) {
      return res
        .status(403)
        .json({ error: "Diagnostics are limited to the wallet owner or an admin" });
    }

    await ensureRealTradingSchema();

    const refresh = req.query.refresh === "true";
    let source: "fresh" | "cache" | "fresh-cold" = "fresh";
    let analysis: Awaited<ReturnType<typeof runAnalysis>>;
    if (refresh) {
      analysis = await runAnalysis(wallet, { sync: true });
      source = "fresh";
    } else {
      const cached = await getCachedAnalysis(wallet);
      if (cached) {
        analysis = cached;
        source = "cache";
      } else {
        analysis = await runAnalysis(wallet, { sync: true });
        source = "fresh-cold";
      }
    }

    // Live native SOL read directly from chain at request time - lets the owner
    // confirm the analyzed wallet against Phantom/Explorer independent of the
    // (possibly cached) snapshot.
    const liveNativeSol = await getNativeSolBalance(wallet).catch(() => null);

    logger.info(
      {
        analyzedWallet: wallet,
        sessionWallet: session.wallet ?? null,
        isAdmin: isAdmin(session),
        source,
        snapshotComputedAt: analysis.computedAt,
        holdingsVerified: analysis.holdingsVerified,
        droppedGhostMints: analysis.droppedGhostMints,
        portfolioAvailable: analysis.portfolio != null,
        liveNativeSol,
      },
      "TI diagnostics requested",
    );

    const solUsd = await getSolPriceUsd().catch(() => 0);
    const toUsd = (sol: number | null): number | null =>
      sol != null && solUsd > 0 ? sol * solUsd : null;

    const p = analysis.portfolio;
    const m = analysis.metrics;

    const summary = p
      ? {
          nativeSol: p.nativeSol,
          nativeValueUsd: toUsd(p.nativeSol),
          totalOnChainPortfolioSol: p.totalOnChainPortfolioSol,
          totalOnChainPortfolioUsd: toUsd(p.totalOnChainPortfolioSol),
          analyzedTradingPortfolioSol: p.analyzedTradingPortfolioSol,
          analyzedTradingPortfolioUsd: toUsd(p.analyzedTradingPortfolioSol),
          // Current Exposure uses the SAME source as Analyzed Trading Portfolio.
          currentExposureSol: p.analyzedTradingPortfolioSol,
          currentExposureUsd: toUsd(p.analyzedTradingPortfolioSol),
          pricedHoldingsValueSol: p.pricedHoldingsValueSol,
          counts: p.counts,
        }
      : null;

    const assets = p
      ? p.assets.map((a) => ({
          mint: a.mint,
          symbol: a.symbol,
          normalizedBalance: a.amount,
          priceSol: a.priceSol,
          priceSource: a.priceSource,
          valueSol: a.valueSol,
          valueUsd: toUsd(a.valueSol),
          inclusion: a.inclusion,
          reason: a.reason,
          includedInOnChain: a.includedInOnChain,
          includedInAnalyzed: a.includedInAnalyzed,
        }))
      : [];

    // Every current-wallet field is produced by a single synchronous
    // reconciliation run, so they all share one computedAt (the reconciliation
    // id). This block lets the owner prove no stale positions are mixed with a
    // fresh balance.
    // ── Canonical current positions + per-position audit ───────────────────
    // Join reconciliation (authority on what is actually held) with the priced
    // open positions. This is the SAME rule the frontend applies, computed on
    // the server so an owner can verify the two agree.
    const DUST = 1e-9;
    const posByMint = new Map(analysis.openPositions.map((p) => [p.tokenMint, p]));
    const positionsAudit = analysis.reconciliation.map((r) => {
      const pos = posByMint.get(r.mint);
      return {
        mint: r.mint,
        symbol: pos?.symbol ?? null,
        fifoQuantity: r.historyQuantity,
        liveBalance: r.liveQuantity,
        reconciledQuantity: r.reconciledQuantity,
        includedInOpenPositions: r.includedInOpenPositions,
        includedInAnalyzed: r.includedInAnalyzed,
        droppedAsGhost: r.droppedAsGhost,
        exclusionReason: r.reason,
        currentValueSol: pos?.currentValueSol ?? null,
        currentValueUsd: toUsd(pos?.currentValueSol ?? null),
      };
    });
    const canonicalCurrentPositions = analysis.holdingsVerified
      ? positionsAudit
          .filter(
            (a) =>
              a.includedInOpenPositions &&
              !a.droppedAsGhost &&
              a.includedInAnalyzed &&
              a.reconciledQuantity > DUST,
          )
          .map((a) => ({
            mint: a.mint,
            symbol: a.symbol,
            tokenAmount: a.reconciledQuantity,
            currentValueSol: a.currentValueSol,
            currentValueUsd: a.currentValueUsd,
          }))
      : [];

    const connectedWallet = String(req.query.connectedWallet ?? "").trim() || null;
    const consistency = {
      reconciliationId: analysis.computedAt,
      analysisSnapshotComputedAt: analysis.computedAt,
      balancesComputedAt: analysis.computedAt,
      pricingComputedAt: analysis.computedAt,
      openPositionsComputedAt: analysis.computedAt,
      allCurrentFieldsShareReconciliation: true,
      analyzedWallet: wallet,
      connectedWallet,
      sessionWallet: session.wallet ?? null,
      walletsMatch:
        (connectedWallet == null || connectedWallet === wallet) &&
        (session.wallet == null || session.wallet === wallet),
    };

    return res.json({
      // ── Wallet mapping (verify the RIGHT wallet is analyzed) ──────────────
      analyzedWallet: wallet,
      connectedWallet,
      sessionWallet: session.wallet ?? null,
      walletMatchesSession:
        session.wallet == null ? null : session.wallet === wallet,
      viewerIsAdmin: isAdmin(session),
      // ── Data provenance (cache vs fresh, snapshot age) ───────────────────
      source,
      computedAt: analysis.computedAt,
      reconciliationId: analysis.reconciliationId,
      consistency,
      snapshotAgeSeconds: Math.max(
        0,
        Math.floor(Date.now() / 1000) - analysis.computedAt,
      ),
      // ── Live on-chain read at request time (independent of snapshot) ─────
      liveNativeSol,
      // ── Reconciliation health ────────────────────────────────────────────
      holdingsVerified: analysis.holdingsVerified,
      droppedGhostMints: analysis.droppedGhostMints,
      portfolioAvailable: p != null,
      pricing: { solUsd, computedAt: analysis.computedAt },
      historyTruncated: analysis.historyTruncated,
      skippedTokenToToken: analysis.skippedTokenToToken,
      analysisConfidence: analysis.analysisConfidence,
      summary,
      pnl: {
        realizedPnlSol: m.realizedPnlSol,
        unrealizedPnlSol: m.unrealizedPnlSol,
        totalPnlSol: m.totalPnlSol,
        largestGainSol: m.largestGainSol,
        largestLossSol: m.largestLossSol,
        openPositions: canonicalCurrentPositions.length,
        closedRoundTrips: m.closedRoundTrips,
      },
      // ── CANONICAL current open positions (single source of truth) ────────
      // The exact rows the UI is allowed to render: verified holdings, present
      // in reconciliation, not a ghost, priced/analyzed, above dust. If this is
      // empty while legacyOpenPositions is not, a ghost was correctly removed.
      canonicalCurrentPositions,
      // ── LEGACY reconstructed positions (DEBUG ONLY - never rendered) ──────
      // Raw trade-history (FIFO) reconstruction before the live-balance gate.
      // Kept temporarily so we can prove which rows were ghosts (e.g. ANSEM).
      legacyOpenPositions: analysis.openPositions.map((pos) => ({
        mint: pos.tokenMint,
        symbol: pos.symbol,
        tokenAmount: pos.tokenAmount,
        currentValueSol: pos.currentValueSol,
        currentValueUsd: toUsd(pos.currentValueSol),
        costBasisSol: pos.costBasisSol,
      })),
      // ── Per-position audit: FIFO vs live vs reconciled, and disposition ───
      positionsAudit,
      // Per-mint reconciliation audit (raw).
      reconciliation: analysis.reconciliation,
      // Token classifications for EVERY live holding (priced / unpriced / spam
      // / unsupported / excluded, each with a reason). RYS shows up here.
      assets,
    });
  }),
);

// ── Trade Replay (Phase 2C) ──────────────────────────────────────────────────
// Owner-or-admin only: this is a per-trade evidence drill-down, not public data.
// Current holdings protections are untouched; these routes only expose COMPLETED
// historical round trips (FIFO), never current positions.

async function ownerOrAdminGate(
  req: Parameters<typeof sessionFromRequest>[0],
  res: import("express").Response,
  wallet: string,
): Promise<boolean> {
  const session = await sessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Sign in required" });
    return false;
  }
  const allowed = isAdmin(session) || (await ownsWallet(session, wallet));
  if (!allowed) {
    res
      .status(403)
      .json({ error: "Trade Replay is limited to the wallet owner or an admin" });
    return false;
  }
  return true;
}

async function loadClosedRoundTrips(
  wallet: string,
): Promise<ReconstructedRoundTrip[]> {
  const events = await loadWalletEvents(wallet);
  return reconstructRoundTrips(events, "solana").closed;
}

/** Cheap per-trip cached-candle read + entry/exit classification. */
async function classifyTrip(
  trip: ReconstructedRoundTrip,
): Promise<{ entry: EntryPattern; exit: ExitPattern; candles: HistoricalCandle[] }> {
  const { start, end } = windowForTrip(trip);
  const interval = intervalForHold(trip.holdDurationSec);
  const candles = await readCachedCandles({
    chain: "solana",
    mint: trip.tokenMint,
    interval,
    start,
    end,
  }).catch(() => [] as HistoricalCandle[]);
  const entry = analyzeEntry(trip, candles, "geckoterminal_cache");
  const exit = analyzeExit(trip, candles, "geckoterminal_cache");
  return { entry: entry.entryPattern, exit: exit.exitPattern, candles };
}

/**
 * GET /real-analysis/:wallet/trades - paginated, filtered Trade Replay list.
 * Owner/admin only. Filters: outcome, token, from/to (unix sec), minHold,
 * maxHold. Bounded page size. No N+1: classification is computed only for the
 * returned page from the durable candle cache.
 */
router.get(
  "/real-analysis/:wallet/trades",
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const wallet = String(req.params.wallet ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    if (!(await ownerOrAdminGate(req, res, wallet))) return;

    await ensureRealTradingSchema();
    let trips = await loadClosedRoundTrips(wallet);

    const outcome = String(req.query.outcome ?? "").trim();
    if (outcome === "winner" || outcome === "loser" || outcome === "breakeven") {
      const want = outcome === "winner" ? "win" : outcome === "loser" ? "loss" : "breakeven";
      trips = trips.filter((t) => t.outcome === want);
    }
    const token = String(req.query.token ?? "").trim();
    if (token) trips = trips.filter((t) => t.tokenMint === token);
    const from = Number(req.query.from);
    if (Number.isFinite(from)) trips = trips.filter((t) => t.buyTime >= from);
    const to = Number(req.query.to);
    if (Number.isFinite(to)) trips = trips.filter((t) => (t.sellTime ?? t.buyTime) <= to);
    const minHold = Number(req.query.minHold);
    if (Number.isFinite(minHold)) trips = trips.filter((t) => t.holdDurationSec >= minHold);
    const maxHold = Number(req.query.maxHold);
    if (Number.isFinite(maxHold)) trips = trips.filter((t) => t.holdDurationSec <= maxHold);

    const sort = String(req.query.sort ?? "recent");
    trips.sort((a, b) => {
      if (sort === "pnl") return b.realizedPnlSol - a.realizedPnlSol;
      if (sort === "loss") return a.realizedPnlSol - b.realizedPnlSol;
      if (sort === "hold") return b.holdDurationSec - a.holdDurationSec;
      return (b.sellTime ?? 0) - (a.sellTime ?? 0);
    });

    const total = trips.length;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const page = trips.slice(offset, offset + limit);

    // Enrich the page's tokens with metadata in ONE batched call (no N+1).
    const mints = [...new Set(page.map((t) => t.tokenMint))];
    const stats = mints.length > 0 ? await getTokenStatsBatch(mints).catch(() => new Map()) : new Map();

    const trades: TradeSummary[] = [];
    for (const trip of page) {
      const cls = await classifyTrip(trip);
      const stat = stats.get(trip.tokenMint);
      trades.push(
        buildTradeSummary(trip, {
          token: { symbol: stat?.symbol ?? null, name: stat?.name ?? null, logo: stat?.logo ?? null },
          entryClassification: cls.entry === "insufficient_data" ? null : cls.entry,
          exitClassification: cls.exit === "insufficient_data" ? null : cls.exit,
        }),
      );
    }

    // Apply entry/exit classification filters AFTER computing the page's classes.
    const entryClass = String(req.query.entryClass ?? "").trim();
    const exitClass = String(req.query.exitClass ?? "").trim();
    const filtered = trades.filter(
      (t) =>
        (!entryClass || t.entryClassification === entryClass) &&
        (!exitClass || t.exitClassification === exitClass),
    );

    return res.json({
      trades: filtered,
      pagination: { total, limit, offset, returned: filtered.length },
    });
  }),
);

/** GET /real-analysis/:wallet/trades/:tradeId - one trade summary. */
router.get(
  "/real-analysis/:wallet/trades/:tradeId",
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const wallet = String(req.params.wallet ?? "").trim();
    const tradeId = String(req.params.tradeId ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    if (!(await ownerOrAdminGate(req, res, wallet))) return;

    await ensureRealTradingSchema();
    const trips = await loadClosedRoundTrips(wallet);
    const trip = trips.find((t) => t.roundTripId === tradeId);
    if (!trip) return res.status(404).json({ error: "Trade not found" });

    const stats = await getTokenStatsBatch([trip.tokenMint]).catch(() => new Map());
    const stat = stats.get(trip.tokenMint);
    const cls = await classifyTrip(trip);
    return res.json({
      trade: buildTradeSummary(trip, {
        token: { symbol: stat?.symbol ?? null, name: stat?.name ?? null, logo: stat?.logo ?? null },
        entryClassification: cls.entry === "insufficient_data" ? null : cls.entry,
        exitClassification: cls.exit === "insufficient_data" ? null : cls.exit,
      }),
    });
  }),
);

/**
 * GET /real-analysis/:wallet/trades/:tradeId/replay - full lifecycle replay
 * with entry/exit evidence, price paths, and current liquidity. Owner/admin.
 */
router.get(
  "/real-analysis/:wallet/trades/:tradeId/replay",
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const wallet = String(req.params.wallet ?? "").trim();
    const tradeId = String(req.params.tradeId ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    if (!(await ownerOrAdminGate(req, res, wallet))) return;

    await ensureRealTradingSchema();
    const trips = await loadClosedRoundTrips(wallet);
    const trip = trips.find((t) => t.roundTripId === tradeId);
    if (!trip) return res.status(404).json({ error: "Trade not found" });

    const { start, end } = windowForTrip(trip);
    const interval = intervalForHold(trip.holdDurationSec);
    const candles = await readCachedCandles({
      chain: "solana",
      mint: trip.tokenMint,
      interval,
      start,
      end,
    }).catch(() => [] as HistoricalCandle[]);

    const entryQuality = analyzeEntry(trip, candles, "geckoterminal_cache");
    const exitQuality = analyzeExit(trip, candles, "geckoterminal_cache");
    const exitAt = trip.sellTime ?? trip.buyTime;

    const stats = await getTokenStatsBatch([trip.tokenMint]).catch(() => new Map());
    const stat = stats.get(trip.tokenMint);
    const currentLiquidity = classifyHoldingLiquidity({
      mint: trip.tokenMint,
      symbol: stat?.symbol ?? null,
      holdingValueUsd: null,
      liquidityUsd: stat?.liquidityUsd ?? null,
    });

    const pricePaths = candles.length > 0
      ? {
          beforeEntry: candlesInRange(candles, start, trip.buyTime),
          duringTrade: candlesInRange(candles, trip.buyTime, exitAt),
          afterExit: candlesInRange(candles, exitAt, end),
          source: "geckoterminal_cache",
          interval,
        }
      : null;

    const replay = buildTradeReplay(trip, {
      token: { symbol: stat?.symbol ?? null, name: stat?.name ?? null, logo: stat?.logo ?? null },
      entryQuality,
      exitQuality,
      currentLiquidity,
      entryMarketCapUsd: entryQuality.entryMarketCapUsd,
      exitMarketCapUsd: exitQuality.exitPrice != null && stat?.marketCapUsd != null ? null : null,
      entryLiquidityUsd: entryQuality.entryLiquidityUsd,
      pricePaths,
      source: "geckoterminal_cache",
    });

    return res.json({ replay });
  }),
);

/**
 * POST /real-analysis/:wallet/enrich - bounded historical enrichment trigger.
 * Owner/admin only. Populates the durable candle cache for the wallet's recent
 * closed trips with all Part-4 safety controls (bounded, deduped, circuit
 * broken). Never blocks the main analysis; returns run stats.
 */
router.post(
  "/real-analysis/:wallet/enrich",
  syncLimiter,
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const wallet = String(req.params.wallet ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    if (!(await ownerOrAdminGate(req, res, wallet))) return;

    await ensureRealTradingSchema();
    const trips = await loadClosedRoundTrips(wallet);
    const maxTrades = Math.min(40, Math.max(1, Number(req.query.max) || 20));
    const run = await enrichWalletTrades(wallet, trips, { maxTrades });
    return res.json({ enrichment: run });
  }),
);

/** GET /real-analysis/:wallet/timeline - intelligence milestones (public). */
router.get(
  "/real-analysis/:wallet/timeline",
  asyncHandler(async (req, res) => {
    if (!(await assertFeatureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }

    const wallet = String(req.params.wallet ?? "").trim();
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    await ensureRealTradingSchema();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const events = await getTimeline(wallet, limit);
    return res.json({ events });
  }),
);

export default router;
