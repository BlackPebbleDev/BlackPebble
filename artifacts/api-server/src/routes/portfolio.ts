import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { dbAll } from "../lib/database.js";
import {
  getPortfolio,
  ensureAccount,
  getClosedTradeStats,
  STARTING_BALANCE,
} from "../lib/trading.js";
import { getSolPriceUsd } from "../lib/prices.js";
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
    const a = await ensureAccount(wallet);
    const portfolio = await getPortfolio(wallet);
    const solUsd = await getSolPriceUsd();

    // Closed-trade stats come from the trades table (source of truth) rather
    // than the account counter columns: total_trades used to include buys, and
    // best_trade could go stale. Deriving keeps Best Trade / Win Rate accurate
    // and consistent across refreshes, reconnects and redeploys.
    const cs = await getClosedTradeStats(wallet);
    const realizedPnlSol = cs.realizedPnl;
    const totalPnlSol = realizedPnlSol + portfolio.unrealizedPnlSol;
    const roi =
      ((portfolio.equitySol - STARTING_BALANCE) / STARTING_BALANCE) * 100;

    if (process.env.NODE_ENV !== "production") {
      logger.debug(
        {
          wallet,
          closedTrades: cs.closedTrades,
          winningTrades: cs.winningTrades,
          bestTradeSource: "MAX(pnl) over closed sell trades",
          bestTrade: cs.bestTrade,
          realizedPnl: realizedPnlSol,
          unrealizedPnl: portfolio.unrealizedPnlSol,
          currentEquity: portfolio.equitySol,
        },
        "[stats-debug] portfolio stats",
      );
    }

    return res.json({
      wallet,
      balance: a.paper_balance,
      equitySol: portfolio.equitySol,
      equityUsd: portfolio.equitySol * solUsd,
      totalPnlSol,
      realizedPnlSol,
      unrealizedPnlSol: portfolio.unrealizedPnlSol,
      roiPercent: roi,
      // Two distinct counts so the UI can be unambiguous:
      // executions = every buy/sell action; closedTrades = realized exits.
      totalExecutions: cs.executions,
      closedTrades: cs.closedTrades,
      winningTrades: cs.winningTrades,
      winRate: cs.winRate,
      bestTrade: cs.bestTrade,
      worstTrade: cs.worstTrade,
      currentStreak: a.current_streak,
      participationPoints: a.participation_points,
      graduationTier: a.graduation_tier,
      openPositions: portfolio.positions.length,
      solUsd,
    });
  }),
);

export default router;
