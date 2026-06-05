import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  getLeaderboard,
  type LeaderboardPeriod,
  MIN_LEADERBOARD_TRADES,
} from "../lib/trading.js";

const router: IRouter = Router();

const PERIODS: LeaderboardPeriod[] = ["daily", "weekly", "all"];

router.get(
  "/leaderboard",
  asyncHandler((req, res) => {
    const raw = String(req.query.period || "all").trim() as LeaderboardPeriod;
    const period: LeaderboardPeriod = PERIODS.includes(raw) ? raw : "all";
    const entries = getLeaderboard(period);
    return res.json({
      period,
      minTrades: MIN_LEADERBOARD_TRADES,
      entries,
    });
  }),
);

export default router;
