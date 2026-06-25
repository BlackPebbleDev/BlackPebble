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

export type BadgeCategory =
  | "trading"
  | "caller"
  | "thesis"
  | "community"
  | "milestone"
  | "special";

/**
 * Achievement rarity — additive scaffolding for the collectible badge UI and the
 * expanded catalog (Task #54). Existing badges are annotated below; new catalog
 * entries supply their own. Defaults to "common" when absent.
 */
export type BadgeRarity = "common" | "rare" | "epic" | "legendary";

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
  /** Collectible rarity tier. Optional for forward-compat; defaults to common. */
  rarity?: BadgeRarity;
}

export interface BadgeEntry extends BadgeDefinition {
  earned: boolean;
  earnedAt: number | null;
  /**
   * Optional progress toward unlocking (current / target). Additive scaffolding
   * — populated by the expanded catalog in Task #54; null/absent until then.
   */
  progress?: { current: number; target: number } | null;
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
    rarity: "common",
  },
  {
    key: "ten_trades",
    name: "10 Trades",
    description: "Completed 10 paper trades.",
    category: "trading",
    icon: "BarChart2",
    rarity: "common",
  },
  {
    key: "hundred_trades",
    name: "100 Trades",
    description: "Completed 100 paper trades.",
    category: "trading",
    icon: "BarChart3",
    rarity: "epic",
  },
  {
    key: "first_profit",
    name: "First Profit",
    description: "Closed a trade with positive realized P&L.",
    category: "trading",
    icon: "DollarSign",
    rarity: "common",
  },
  {
    key: "positive_roi",
    name: "Positive ROI",
    description: "Maintained a positive overall ROI across 5 or more trades.",
    category: "trading",
    icon: "TrendingUp",
    rarity: "rare",
  },
  {
    key: "top_100_trader",
    name: "Top 100 Trader",
    description: "Ranked in the top 100 on the all-time trader leaderboard.",
    category: "trading",
    icon: "Trophy",
    rarity: "legendary",
  },
  // Caller
  {
    key: "first_call",
    name: "First Call",
    description: "Made your first on-the-record public token call.",
    category: "caller",
    icon: "Megaphone",
    rarity: "common",
  },
  {
    key: "five_calls",
    name: "5 Calls",
    description: "Logged 5 public token calls.",
    category: "caller",
    icon: "Megaphone",
    rarity: "common",
  },
  {
    key: "ten_x_caller",
    name: "10× Caller",
    description: "Had a token call reach 10× or more.",
    category: "caller",
    icon: "Flame",
    rarity: "epic",
  },
  {
    key: "top_caller",
    name: "Top Caller",
    description: "Ranked in the top 50 on the Top Callers board.",
    category: "caller",
    icon: "Star",
    rarity: "legendary",
  },
  {
    key: "sharpshooter",
    name: "Sharpshooter",
    description: "Achieved a 60%+ hit rate across 5 or more graded calls.",
    category: "caller",
    icon: "Target",
    rarity: "rare",
  },
  // Thesis
  {
    key: "first_thesis",
    name: "First Thesis",
    description: "Published your first standalone research thesis.",
    category: "thesis",
    icon: "ScrollText",
    rarity: "common",
  },
  {
    key: "researcher",
    name: "Researcher",
    description: "Published 5 or more research theses.",
    category: "thesis",
    icon: "BookOpen",
    rarity: "rare",
  },
  {
    key: "consistent_analyst",
    name: "Consistent Analyst",
    description: "Published 10 or more research theses.",
    category: "thesis",
    icon: "BookOpen",
    rarity: "epic",
  },
  // Community
  {
    key: "early_user",
    name: "Early User",
    description: "One of the first 500 users to join BlackPebble.",
    category: "community",
    icon: "Star",
    rarity: "rare",
  },
  {
    key: "profile_complete",
    name: "Profile Complete",
    description: "Set a bio on a connected X account.",
    category: "community",
    icon: "UserCheck",
    rarity: "common",
  },
  {
    key: "watchlist_builder",
    name: "Watchlist Builder",
    description: "Added 3 or more tokens to your watchlist.",
    category: "community",
    icon: "Bookmark",
    rarity: "common",
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

// ── Official Badges ───────────────────────────────────────────────────────────

/**
 * Role badges — an independent identity axis. A user may hold ANY number of
 * these simultaneously; they are admin-assigned and curated, never earned by
 * activity (that is the achievement system). The set is extensible: adding a new
 * role is just another entry here plus its display meta on the client. These
 * names are deliberately distinct from progression tiers and account status.
 */
export type OfficialBadgeType =
  | "founder"
  | "bp_team"
  | "early_user"
  | "verified_trader"
  | "ambassador";

export const OFFICIAL_BADGE_TYPES: OfficialBadgeType[] = [
  "founder",
  "bp_team",
  "early_user",
  "verified_trader",
  "ambassador",
];

export const OFFICIAL_BADGE_META: Record<
  OfficialBadgeType,
  { name: string; description: string }
> = {
  founder: {
    name: "Founder",
    description: "BlackPebble founder. Assigned by admin.",
  },
  bp_team: {
    name: "BlackPebble Team",
    description: "Official BlackPebble team member.",
  },
  early_user: {
    name: "Early User",
    description: "Recognized early supporter of BlackPebble.",
  },
  verified_trader: {
    name: "Verified Trader",
    description: "Identity-verified trader.",
  },
  ambassador: {
    name: "Ambassador",
    description: "Official BlackPebble community ambassador.",
  },
};

let officialBadgeSchemaEnsured = false;

export async function ensureOfficialBadgesSchema(): Promise<void> {
  if (officialBadgeSchemaEnsured) return;
  await dbRun(`
    CREATE TABLE IF NOT EXISTS official_badges (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_type TEXT NOT NULL,
      assigned_by TEXT,
      assigned_at BIGINT NOT NULL
        DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
      UNIQUE(user_id, badge_type)
    )
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_official_badges_user
      ON official_badges (user_id)
  `);
  officialBadgeSchemaEnsured = true;
}

export async function assignOfficialBadge(
  userId: number,
  badgeType: OfficialBadgeType,
  assignedBy: string | null,
): Promise<void> {
  await ensureOfficialBadgesSchema();
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    `INSERT INTO official_badges (user_id, badge_type, assigned_by, assigned_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, badge_type) DO NOTHING`,
    [userId, badgeType, assignedBy, now],
  );
}

export async function removeOfficialBadge(
  userId: number,
  badgeType: OfficialBadgeType,
): Promise<void> {
  await ensureOfficialBadgesSchema();
  await dbRun(
    `DELETE FROM official_badges WHERE user_id = $1 AND badge_type = $2`,
    [userId, badgeType],
  );
}

export async function getOfficialBadgesForUser(
  userId: number,
): Promise<OfficialBadgeType[]> {
  await ensureOfficialBadgesSchema();
  const rows = await dbAll<{ badge_type: string }>(
    `SELECT badge_type FROM official_badges WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.badge_type as OfficialBadgeType);
}

export async function getOfficialBadgesForUsers(
  userIds: number[],
): Promise<Map<number, OfficialBadgeType[]>> {
  if (userIds.length === 0) return new Map();
  await ensureOfficialBadgesSchema();
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await dbAll<{ user_id: number; badge_type: string }>(
    `SELECT user_id, badge_type FROM official_badges WHERE user_id IN (${placeholders})`,
    userIds as unknown[],
  );
  const map = new Map<number, OfficialBadgeType[]>();
  for (const r of rows) {
    const list = map.get(r.user_id) ?? [];
    list.push(r.badge_type as OfficialBadgeType);
    map.set(r.user_id, list);
  }
  return map;
}
