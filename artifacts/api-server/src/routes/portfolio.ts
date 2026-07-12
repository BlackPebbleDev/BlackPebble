import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { dbAll, dbGet } from "../lib/database.js";
import {
  getPortfolio,
  ensureAccount,
  getClosedTradeStats,
  getAvgHoldSeconds,
  STARTING_BALANCE,
} from "../lib/trading.js";
import { getSolPriceUsd } from "../lib/prices.js";
import { getLeveragePortfolio } from "../lib/leverage.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get(
  "/portfolio/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const portfolio = await getPortfolio(wallet);
    return res.json(portfolio);
  }),
);

router.get(
  "/portfolio/chart/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const rows = await dbAll<{
      equity: number;
      balance: number;
      realized_pnl: number;
      snapshot_at: number;
    }>(
      `SELECT equity, balance, realized_pnl, snapshot_at
       FROM portfolio_snapshots WHERE wallet = $1
       ORDER BY snapshot_at ASC LIMIT 1000`,
      [wallet],
    );

    // Always include a current live point so the chart isn't empty for new accounts.
    const portfolio = await getPortfolio(wallet);
    const now = Math.floor(Date.now() / 1000);
    const points = rows.map((r) => ({
      t: r.snapshot_at * 1000,
      equity: r.equity,
      balance: r.balance,
    }));
    points.push({ t: now * 1000, equity: portfolio.equitySol, balance: portfolio.balance });

    return res.json({ points, solUsd: portfolio.solUsd });
  }),
);

router.get(
  "/portfolio/stats/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });

    // Run all data fetches in parallel to minimise latency.
    const [a, portfolio, cs, solUsd, levPortfolio, levCounts, avgHoldSec] =
      await Promise.all([
        ensureAccount(wallet),
        getPortfolio(wallet),
        getClosedTradeStats(wallet),
        getSolPriceUsd(),
        getLeveragePortfolio(wallet),
        dbGet<{ total: number; closed: number }>(
          `SELECT COUNT(*)::int AS total,
                  COUNT(CASE WHEN action != 'open' THEN 1 END)::int AS closed
           FROM paper_leverage_trades WHERE wallet = $1`,
          [wallet],
        ),
        getAvgHoldSeconds(wallet),
      ]);

    // ── Leverage equity ──────────────────────────────────────────────────────
    // For each open leverage position use positionEquitySol (margin + unrealized
    // P&L) when the price is available, fall back to margin_sol when it is not
    // (price unavailable → treat position as worth at least its collateral).
    // Floor at 0: a position whose losses exceed margin is liquidated first.
    const openLeverageEquitySol = levPortfolio.positions.reduce(
      (s, p) => s + Math.max(0, p.positionEquitySol ?? p.margin_sol),
      0,
    );

    // ── Combined equity & P&L ────────────────────────────────────────────────
    //   totalEquitySol = cash + open spot value + open leverage equity
    //
    // This works because:
    //   • paper_balance already has margin deducted (done at open) and realized
    //     leverage P&L re-added (done at close) - so closed positions are
    //     automatically reflected through the cash balance.
    //   • openLeverageEquitySol adds back the current value of OPEN positions
    //     so equity doesn't crater just because margin moved into a position.
    //
    //   totalPnlSol  = totalEquitySol − STARTING_BALANCE
    //   roi%         = totalPnlSol / STARTING_BALANCE × 100
    const totalEquitySol = portfolio.equitySol + openLeverageEquitySol;
    const realizedPnlSol = cs.realizedPnl;
    const totalPnlSol = totalEquitySol - STARTING_BALANCE;
    const roi = (totalPnlSol / STARTING_BALANCE) * 100;

    // ── Combined trade counts ────────────────────────────────────────────────
    // executions: every buy/sell action (spot) + every leverage trade event
    // closedTrades: realized spot exits + realized leverage closures
    const totalExecutions = cs.executions + (levCounts?.total ?? 0);
    const totalClosedTrades = cs.closedTrades + (levCounts?.closed ?? 0);

    if (process.env.NODE_ENV !== "production") {
      logger.debug(
        {
          wallet,
          spotEquity: portfolio.equitySol,
          openLeverageEquitySol,
          totalEquitySol,
          closedTrades: cs.closedTrades,
          leverageClosedTrades: levCounts?.closed ?? 0,
          spotRealizedPnl: realizedPnlSol,
          spotUnrealizedPnl: portfolio.unrealizedPnlSol,
          leverageRealizedPnl: levPortfolio.realizedPnlSol,
          leverageUnrealizedPnl: levPortfolio.unrealizedPnlSol,
          totalPnlSol,
        },
        "[stats-debug] portfolio stats",
      );
    }

    return res.json({
      wallet,
      balance: a.paper_balance,
      equitySol: totalEquitySol,
      equityUsd: totalEquitySol * solUsd,
      totalPnlSol,
      realizedPnlSol,
      unrealizedPnlSol: portfolio.unrealizedPnlSol,
      roiPercent: roi,
      // Spot trade counts (post-reset window). Win rate is spot-only so it
      // remains a fair competitive metric independent of leverage activity.
      winningTrades: cs.winningTrades,
      winRate: cs.winRate,
      bestTrade: cs.bestTrade,
      worstTrade: cs.worstTrade,
      // Trade-quality metrics (spot closed trades) - real, never fabricated.
      avgWinSol: cs.avgWinSol,
      avgLossSol: cs.avgLossSol,
      profitFactor: cs.profitFactor,
      avgTradeSizeSol: cs.avgTradeSizeSol,
      avgHoldSec,
      // Combined counts for executions and closed-trades display.
      totalExecutions,
      closedTrades: totalClosedTrades,
      currentStreak: a.current_streak,
      participationPoints: a.participation_points,
      graduationTier: a.graduation_tier,
      openPositions: portfolio.positions.length,
      solUsd,
      // Leverage breakdown - used by the portfolio P&L breakdown section.
      openLeverageEquitySol,
      leverageRealizedPnlSol: levPortfolio.realizedPnlSol,
      leverageUnrealizedPnlSol: levPortfolio.unrealizedPnlSol,
      leverageOpenCount: levPortfolio.positions.length,
    });
  }),
);

export default router;
