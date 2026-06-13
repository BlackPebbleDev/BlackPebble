import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  getLeaderboard,
  getUserTiers,
  type LeaderboardPeriod,
  MIN_LEADERBOARD_TRADES,
} from "../lib/trading.js";
import { getSolPriceUsd } from "../lib/prices.js";
import { getTopCallers } from "../lib/callers.js";
import { dbAll } from "../lib/database.js";
import { ensureFollowsTable } from "../lib/profiles.js";
import { getOfficialBadgesForUsers } from "../lib/badges.js";

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

/**
 * Most Followed leaderboard: users ranked by how many BlackPebble peers
 * follow them. Returns an empty entries array (not 404) when no one has
 * followers yet — the frontend renders a polished empty state.
 */
router.get(
  "/leaderboard/most-followed",
  asyncHandler(async (_req, res) => {
    await ensureFollowsTable();
    const rows = await dbAll<{
      user_id: number;
      x_username: string;
      x_display_name: string | null;
      x_avatar_url: string | null;
      follower_count: number;
    }>(
      `SELECT u.id AS user_id,
              xi.x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url,
              COUNT(uf.follower_user_id)::int AS follower_count
         FROM users u
         JOIN user_identities xi ON xi.user_id = u.id AND xi.provider = 'x'
         LEFT JOIN user_follows uf ON uf.following_user_id = u.id
        GROUP BY u.id, xi.x_username, u.display_name, u.avatar_url
       HAVING COUNT(uf.follower_user_id) > 0
        ORDER BY follower_count DESC
        LIMIT 100`,
    );
    const userIds = rows.map((r) => r.user_id);
    const [badgeMap, tierMap] = await Promise.all([
      getOfficialBadgesForUsers(userIds),
      getUserTiers(userIds),
    ]);
    const entries = rows.map((r, i) => ({
      rank: i + 1,
      ...r,
      officialBadges: badgeMap.get(r.user_id) ?? [],
      graduation_tier: tierMap.get(r.user_id) ?? "Unranked",
    }));
    return res.json({ entries });
  }),
);

export default router;
