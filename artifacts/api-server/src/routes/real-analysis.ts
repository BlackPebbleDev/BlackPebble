import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isAdmin, ownsWallet, sessionFromRequest } from "../lib/auth.js";
import { dbGet } from "../lib/database.js";
import { getFeatureFlags } from "../lib/featureFlags.js";
import { getTokenMetadataBatch } from "../lib/helius.js";
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
      return res.json({ analysis });
    }

    const cached = await getCachedAnalysis(wallet);
    if (cached) {
      return res.json({ analysis: cached });
    }

    const analysis = await runAnalysis(wallet, { sync: true });
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
    const analysis = refresh
      ? await runAnalysis(wallet, { sync: true })
      : ((await getCachedAnalysis(wallet)) ?? (await runAnalysis(wallet, { sync: true })));

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

    return res.json({
      wallet,
      computedAt: analysis.computedAt,
      pricing: { solUsd, computedAt: analysis.computedAt },
      holdingsVerified: analysis.holdingsVerified,
      historyTruncated: analysis.historyTruncated,
      skippedTokenToToken: analysis.skippedTokenToToken,
      analysisConfidence: analysis.analysisConfidence,
      portfolioAvailable: p != null,
      summary,
      pnl: {
        realizedPnlSol: m.realizedPnlSol,
        unrealizedPnlSol: m.unrealizedPnlSol,
        totalPnlSol: m.totalPnlSol,
        largestGainSol: m.largestGainSol,
        largestLossSol: m.largestLossSol,
        openPositions: analysis.openPositions.length,
        closedRoundTrips: m.closedRoundTrips,
      },
      assets,
    });
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
