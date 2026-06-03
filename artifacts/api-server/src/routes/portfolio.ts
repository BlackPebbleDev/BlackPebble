import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import db from "../lib/database.js";
import { getPortfolio, ensureAccount } from "../lib/trading.js";
import { getSolPriceUsd } from "../lib/prices.js";

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
    const rows = db
      .prepare(
        `SELECT equity, balance, realized_pnl, snapshot_at
         FROM portfolio_snapshots WHERE wallet = ?
         ORDER BY snapshot_at ASC LIMIT 1000`,
      )
      .all(wallet) as Array<{
      equity: number;
      balance: number;
      realized_pnl: number;
      snapshot_at: number;
    }>;

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
    const a = ensureAccount(wallet);
    const portfolio = await getPortfolio(wallet);
    const solUsd = await getSolPriceUsd();
    const winRate = a.total_trades > 0 ? (a.winning_trades / a.total_trades) * 100 : 0;
    const roi = ((portfolio.equitySol - 100) / 100) * 100;
    return res.json({
      wallet,
      balance: a.paper_balance,
      equitySol: portfolio.equitySol,
      equityUsd: portfolio.equitySol * solUsd,
      totalPnlSol: portfolio.totalPnlSol,
      realizedPnlSol: a.realized_pnl,
      unrealizedPnlSol: portfolio.unrealizedPnlSol,
      roiPercent: roi,
      totalTrades: a.total_trades,
      winningTrades: a.winning_trades,
      winRate,
      bestTrade: a.best_trade,
      worstTrade: a.worst_trade,
      currentStreak: a.current_streak,
      participationPoints: a.participation_points,
      graduationTier: a.graduation_tier,
      openPositions: portfolio.positions.length,
      solUsd,
    });
  }),
);

export default router;
