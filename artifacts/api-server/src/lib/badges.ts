/**
 * Achievement & Badge System (V1).
 *
 * Badge definitions live in code as a typed catalogue. Unlock status is
 * derived from real platform activity each time it is requested, then
 * persisted via upsert so the first-earn timestamp is preserved.
 *
 * Trust Score formula (100-pt scale — change only the weights here to tune):
 *
 *   tradePerf  = clamp(roiPercent / 200, 0, 1) × 30   (0–30, needs ≥5 trades)
 *   tradesComp = min(closedTrades, 50) / 50 × 20        (0–20)
 *   pnlComp    = realizedPnlSol > 0 ? 20 : 0
 *   callerComp = min(callerScore, 100) / 100 × 20       (0–20, 0 if no calls)
 *   badgeComp  = min(earnedBadges, 5) / 5 × 10          (0–10)
 *
 *   Labels:  0–15 → New | 16–40 → Building |
 *            41–70 → Established | 71–100 → Proven
 */

import { dbAll, dbGet, dbRun } from "./database.js";

export type BadgeCategory = "trading" | "caller" | "thesis" | "community";
export type TrustLabel = "New" | "Building" | "Established" | "Proven";

export interface TrustScore {
  score: number;
  label: TrustLabel;
}

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  category: BadgeCategory;
  /** Lucide icon name hint for the frontend. */
  icon: string;
}

export interface BadgeEntry extends BadgeDefinition {
  earned: boolean;
  earnedAt: number | null;
}

/** Pre-computed stats the caller must supply before computing badges. */
export interface BadgeStatsInput {
  closedTrades: number;
  realizedPnlSol: number;
  roiPercent: number;
  traderRank: number | null;
  callsMade: number;
  bestMultiple: number | null;
  callerRank: number | null;
  hitRate: number;
  gradedCalls: number;
  callerScore: number;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Trading
  {
    key: "first_trade",
    name: "First Trade",
    description: "Opened and closed your first paper trade.",
    category: "trading",
    icon: "TrendingUp",
  },
  {
    key: "ten_trades",
    name: "10 Trades",
    description: "Completed 10 paper trades.",
    category: "trading",
    icon: "BarChart2",
  },
  {
    key: "hundred_trades",
    name: "100 Trades",
    description: "Completed 100 paper trades.",
    category: "trading",
    icon: "BarChart3",
  },
  {
    key: "first_profit",
    name: "First Profit",
    description: "Closed a trade with positive realized P&L.",
    category: "trading",
    icon: "DollarSign",
  },
  {
    key: "positive_roi",
    name: "Positive ROI",
    description: "Maintained a positive overall ROI across 5 or more trades.",
    category: "trading",
    icon: "TrendingUp",
  },
  {
    key: "top_100_trader",
    name: "Top 100 Trader",
    description: "Ranked in the top 100 on the all-time trader leaderboard.",
    category: "trading",
    icon: "Trophy",
  },
  // Caller
  {
    key: "first_call",
    name: "First Call",
    description: "Made your first on-the-record public token call.",
    category: "caller",
    icon: "Megaphone",
  },
  {
    key: "five_calls",
    name: "5 Calls",
    description: "Logged 5 public token calls.",
    category: "caller",
    icon: "Megaphone",
  },
  {
    key: "ten_x_caller",
    name: "10× Caller",
    description: "Had a token call reach 10× or more.",
    category: "caller",
    icon: "Flame",
  },
  {
    key: "top_caller",
    name: "Top Caller",
    description: "Ranked in the top 50 on the Top Callers board.",
    category: "caller",
    icon: "Star",
  },
  {
    key: "sharpshooter",
    name: "Sharpshooter",
    description: "Achieved a 60%+ hit rate across 5 or more graded calls.",
    category: "caller",
    icon: "Target",
  },
  // Thesis
  {
    key: "first_thesis",
    name: "First Thesis",
    description: "Published your first standalone research thesis.",
    category: "thesis",
    icon: "ScrollText",
  },
  {
    key: "researcher",
    name: "Researcher",
    description: "Published 5 or more research theses.",
    category: "thesis",
    icon: "BookOpen",
  },
  {
    key: "consistent_analyst",
    name: "Consistent Analyst",
    description: "Published 10 or more research theses.",
    category: "thesis",
    icon: "BookOpen",
  },
  // Community
  {
    key: "early_user",
    name: "Early User",
    description: "One of the first 500 users to join BlackPebble.",
    category: "community",
    icon: "Star",
  },
  {
    key: "profile_complete",
    name: "Profile Complete",
    description: "Set a bio on a connected X account.",
    category: "community",
    icon: "UserCheck",
  },
  {
    key: "watchlist_builder",
    name: "Watchlist Builder",
    description: "Added 3 or more tokens to your watchlist.",
    category: "community",
    icon: "Bookmark",
  },
];

// ── Schema ───────────────────────────────────────────────────────────────────

let badgeSchemaEnsured = false;

export async function ensureBadgesSchema(): Promise<void> {
  if (badgeSchemaEnsured) return;
  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_achievements (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_key TEXT NOT NULL,
      earned_at BIGINT NOT NULL
        DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
      UNIQUE(user_id, badge_key)
    )
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_user_achievements_user
      ON user_achievements (user_id)
  `);
  badgeSchemaEnsured = true;
}

// ── Trust score ───────────────────────────────────────────────────────────────

/**
 * Pure function — compute trust score from pre-fetched stats.
 * Tune by adjusting only the weights/thresholds here.
 */
export function computeTrustScore(
  stats: BadgeStatsInput,
  earnedBadgeCount: number,
): TrustScore {
  const tradePerf =
    stats.closedTrades >= 5
      ? Math.min(1, Math.max(0, stats.roiPercent / 200)) * 30
      : 0;
  const tradesComp = (Math.min(stats.closedTrades, 50) / 50) * 20;
  const pnlComp = stats.realizedPnlSol > 0 ? 20 : 0;
  const callerComp =
    stats.callsMade > 0
      ? (Math.min(stats.callerScore, 100) / 100) * 20
      : 0;
  const badgeComp = (Math.min(earnedBadgeCount, 5) / 5) * 10;

  const score = Math.min(
    100,
    Math.round(tradePerf + tradesComp + pnlComp + callerComp + badgeComp),
  );

  let label: TrustLabel;
  if (score <= 15) label = "New";
  else if (score <= 40) label = "Building";
  else if (score <= 70) label = "Established";
  else label = "Proven";

  return { score, label };
}

// ── Badge computation ─────────────────────────────────────────────────────────

/**
 * Compute and persist badges for a user.
 *
 * Trading/caller/rank stats that the caller already holds are passed in via
 * `stats` — this avoids re-fetching data that the route already gathered.
 * Community/content stats (bio, theses, watchlist) are queried here.
 *
 * Returns the full badge list (earned + locked) and the earned count so the
 * caller can immediately compute the trust score without a second DB round-trip.
 */
export async function getUserBadges(
  userId: number,
  stats: BadgeStatsInput,
): Promise<{ badges: BadgeEntry[]; earnedCount: number }> {
  await ensureBadgesSchema();

  const [userExtras, thesisRow, watchlistRow, existingAchievements] =
    await Promise.all([
      dbGet<{ bio: string | null; avatar: string | null }>(
        `SELECT bio, avatar_url AS avatar FROM users WHERE id = $1`,
        [userId],
      ),
      dbGet<{ count: number }>(
        `SELECT COUNT(*)::int AS count
           FROM token_theses
          WHERE user_id = $1 AND is_hidden_by_admin = FALSE`,
        [userId],
      ).catch(() => ({ count: 0 })),
      dbGet<{ count: number }>(
        `SELECT COUNT(DISTINCT w.token_mint)::int AS count
           FROM watchlist w
           JOIN user_identities ui
             ON ui.wallet_address = w.wallet AND ui.provider = 'wallet'
          WHERE ui.user_id = $1`,
        [userId],
      ).catch(() => ({ count: 0 })),
      dbAll<{ badge_key: string; earned_at: number }>(
        `SELECT badge_key, earned_at
           FROM user_achievements
          WHERE user_id = $1`,
        [userId],
      ),
    ]);

  const thesisCount = thesisRow?.count ?? 0;
  const watchlistCount = watchlistRow?.count ?? 0;
  const hasBio = !!(userExtras?.bio?.trim());
  const hasAvatar = !!(userExtras?.avatar);

  const conditions: Record<string, boolean> = {
    first_trade: stats.closedTrades >= 1,
    ten_trades: stats.closedTrades >= 10,
    hundred_trades: stats.closedTrades >= 100,
    first_profit: stats.realizedPnlSol > 0 && stats.closedTrades >= 1,
    positive_roi: stats.roiPercent > 0 && stats.closedTrades >= 5,
    top_100_trader: stats.traderRank != null && stats.traderRank <= 100,
    first_call: stats.callsMade >= 1,
    five_calls: stats.callsMade >= 5,
    ten_x_caller: stats.bestMultiple != null && stats.bestMultiple >= 10,
    top_caller: stats.callerRank != null && stats.callerRank <= 50,
    sharpshooter: stats.hitRate >= 0.6 && stats.gradedCalls >= 5,
    first_thesis: thesisCount >= 1,
    researcher: thesisCount >= 5,
    consistent_analyst: thesisCount >= 10,
    early_user: userId <= 500,
    profile_complete: hasBio && hasAvatar,
    watchlist_builder: watchlistCount >= 3,
  };

  // Persist newly earned badges (upsert-safe, idempotent)
  const prevEarnedMap = new Map<string, number>(
    existingAchievements.map((a) => [a.badge_key, a.earned_at]),
  );
  const now = Math.floor(Date.now() / 1000);

  for (const [key, earned] of Object.entries(conditions)) {
    if (earned && !prevEarnedMap.has(key)) {
      await dbRun(
        `INSERT INTO user_achievements (user_id, badge_key, earned_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, badge_key) DO NOTHING`,
        [userId, key, now],
      );
      prevEarnedMap.set(key, now);
    }
  }

  const earnedCount = Object.values(conditions).filter(Boolean).length;

  const badges: BadgeEntry[] = BADGE_DEFINITIONS.map((d) => ({
    ...d,
    earned: !!(conditions[d.key]),
    earnedAt: conditions[d.key]
      ? (prevEarnedMap.get(d.key) ?? now)
      : null,
  }));

  return { badges, earnedCount };
}

/** Quick count of stored earned badges — no recomputation, just a DB read. */
export async function getEarnedBadgeCount(userId: number): Promise<number> {
  await ensureBadgesSchema();
  const row = await dbGet<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM user_achievements WHERE user_id = $1`,
    [userId],
  ).catch(() => null);
  return row?.count ?? 0;
}
