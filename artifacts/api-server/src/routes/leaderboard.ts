import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  getLeaderboard,
  type LeaderboardPeriod,
  MIN_LEADERBOARD_TRADES,
} from "../lib/trading.js";
import { getSolPriceUsd } from "../lib/prices.js";
import { getTopCallers } from "../lib/callers.js";

const router: IRouter = Router();

const PERIODS: LeaderboardPeriod[] = ["daily", "weekly", "all"];

router.get(
  "/leaderboard",
  asyncHandler(async (req, res) => {
    const raw = String(req.query.period || "all").trim() as LeaderboardPeriod;
    const period: LeaderboardPeriod = PERIODS.includes(raw) ? raw : "all";
    const [entries, solUsd] = await Promise.all([
      getLeaderboard(period),
      getSolPriceUsd(),
    ]);
    return res.json({
      period,
      minTrades: MIN_LEADERBOARD_TRADES,
      entries,
      solUsd,
    });
  }),
);

/**
 * Top Callers leaderboard: callers ranked by a weighted reputation score
 * derived live from the immutable callouts table. Read-only aggregation that
 * never touches trade/leaderboard accounting.
 */
router.get(
  "/leaderboard/callers",
  asyncHandler(async (_req, res) => {
    const entries = await getTopCallers(100);
    return res.json({ entries });
  }),
);

export default router;
