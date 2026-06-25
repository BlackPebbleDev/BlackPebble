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
import { badgeTrustContribution } from "./progression.js";

export type BadgeCategory =
  | "trading"
  | "profit"
  | "caller"
  | "thesis"
  | "wallet"
  | "community"
  | "profile"
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
  /**
   * Hidden achievements stay invisible in the locked catalogue until earned,
   * then reveal with a celebration. Once earned they render like any other.
   */
  hidden?: boolean;
  /**
   * Whether earning this badge posts an activity-feed card. Defaults to true;
   * trivial setup badges (e.g. completing a profile) set this false so the feed
   * only carries meaningful unlocks.
   */
  feed?: boolean;
}

export interface BadgeEntry extends BadgeDefinition {
  earned: boolean;
  earnedAt: number | null;
  /**
   * Progress toward unlocking (current / target). Populated for count-based
   * achievements so the UI can render a progress bar; null for boolean ones.
   */
  progress?: { current: number; target: number } | null;
  /**
   * Share-card readiness: the percentage of registered users who hold this
   * badge (a rough rarity signal for future X / Telegram share cards). Null
   * when it cannot be computed.
   */
  globalEarnedPercent?: number | null;
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

/**
 * The achievement catalogue, organised into collections. Each collection is a
 * `BadgeDefinition[]` so adding a whole new collection (Legacy, Founder,
 * Seasonal, …) is a one-array change. The flattened `BADGE_DEFINITIONS` is the
 * single exported source the rest of the system consumes.
 *
 * Every unlock condition is derived from REAL platform activity in
 * `evaluateBadges` below — nothing here is fabricated. Count-based badges expose
 * a `target` there so the UI can render a progress bar.
 */

// Trading — paper-trade volume milestones.
const TRADING_BADGES: BadgeDefinition[] = [
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
    key: "fifty_trades",
    name: "50 Trades",
    description: "Completed 50 paper trades.",
    category: "trading",
    icon: "BarChart2",
    rarity: "rare",
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
    key: "top_100_trader",
    name: "Top 100 Trader",
    description: "Ranked in the top 100 on the all-time trader leaderboard.",
    category: "trading",
    icon: "Trophy",
    rarity: "legendary",
  },
];

// Profit — realized P&L and ROI milestones.
const PROFIT_BADGES: BadgeDefinition[] = [
  {
    key: "first_profit",
    name: "First Profit",
    description: "Closed a trade with positive realized P&L.",
    category: "profit",
    icon: "DollarSign",
    rarity: "common",
  },
  {
    key: "positive_roi",
    name: "Positive ROI",
    description: "Maintained a positive overall ROI across 5 or more trades.",
    category: "profit",
    icon: "TrendingUp",
    rarity: "rare",
  },
  {
    key: "profit_10_sol",
    name: "In the Green",
    description: "Reached 10 SOL of cumulative realized profit.",
    category: "profit",
    icon: "Coins",
    rarity: "rare",
  },
  {
    key: "profit_100_sol",
    name: "Profit Machine",
    description: "Reached 100 SOL of cumulative realized profit.",
    category: "profit",
    icon: "Coins",
    rarity: "epic",
  },
  {
    key: "whale_pnl",
    name: "Whale Status",
    description: "Reached 1,000 SOL of cumulative realized profit.",
    category: "profit",
    icon: "Trophy",
    rarity: "legendary",
  },
];

// Calls — on-the-record public token calls.
const CALL_BADGES: BadgeDefinition[] = [
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
    key: "twenty_calls",
    name: "20 Calls",
    description: "Logged 20 public token calls.",
    category: "caller",
    icon: "Megaphone",
    rarity: "rare",
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
    key: "sharpshooter",
    name: "Sharpshooter",
    description: "Achieved a 60%+ hit rate across 5 or more graded calls.",
    category: "caller",
    icon: "Target",
    rarity: "rare",
  },
  {
    key: "top_caller",
    name: "Top Caller",
    description: "Ranked in the top 50 on the Top Callers board.",
    category: "caller",
    icon: "Star",
    rarity: "legendary",
  },
];

// Research — standalone token theses.
const RESEARCH_BADGES: BadgeDefinition[] = [
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
];

/**
 * Wallet Utilities — the signature collection, derived entirely from REAL
 * verified on-chain recovery events (rent reclaimed by cleaning up empty token
 * accounts). Unverified telemetry never unlocks a badge. Thresholds mirror the
 * recovery-badges scaffold so the two stay consistent.
 */
const WALLET_BADGES: BadgeDefinition[] = [
  {
    key: "first_recovery",
    name: "First Recovery",
    description: "Completed your first successful wallet cleanup.",
    category: "wallet",
    icon: "Sparkles",
    rarity: "common",
  },
  {
    key: "ten_accounts_closed",
    name: "10 Accounts Closed",
    description: "Closed 10 rent-bearing token accounts.",
    category: "wallet",
    icon: "Eraser",
    rarity: "common",
  },
  {
    key: "hundred_accounts_closed",
    name: "100 Accounts Closed",
    description: "Closed 100 rent-bearing token accounts.",
    category: "wallet",
    icon: "Eraser",
    rarity: "epic",
  },
  {
    key: "one_sol_recovered",
    name: "1 SOL Recovered",
    description: "Recovered a cumulative 1 SOL of rent.",
    category: "wallet",
    icon: "Coins",
    rarity: "rare",
  },
  {
    key: "ten_sol_recovered",
    name: "10 SOL Recovered",
    description: "Recovered a cumulative 10 SOL of rent.",
    category: "wallet",
    icon: "Coins",
    rarity: "epic",
  },
  {
    key: "wallet_cleaner",
    name: "Wallet Cleaner",
    description: "Ran 5 or more successful wallet cleanups.",
    category: "wallet",
    icon: "Wand2",
    rarity: "rare",
  },
  {
    key: "token_burner",
    name: "Token Burner",
    description: "Burned 10 or more junk tokens while cleaning up.",
    category: "wallet",
    icon: "Flame",
    rarity: "rare",
  },
  {
    key: "elite_cleaner",
    name: "Elite Cleaner",
    description: "Closed 50+ accounts and recovered 5+ SOL of rent.",
    category: "wallet",
    icon: "Trophy",
    rarity: "legendary",
  },
];

// Community — membership and network.
const COMMUNITY_BADGES: BadgeDefinition[] = [
  {
    key: "early_user",
    name: "Early User",
    description: "One of the first 500 users to join BlackPebble.",
    category: "community",
    icon: "Star",
    rarity: "rare",
  },
  {
    key: "networked",
    name: "Networked",
    description: "Reached 10 followers on your BlackPebble profile.",
    category: "community",
    icon: "Users",
    rarity: "rare",
  },
];

// Profile — personalising your presence. Setup badges; not feed-worthy.
const PROFILE_BADGES: BadgeDefinition[] = [
  {
    key: "profile_complete",
    name: "Profile Complete",
    description: "Set a bio and avatar on a connected X account.",
    category: "profile",
    icon: "UserCheck",
    rarity: "common",
    feed: false,
  },
  {
    key: "watchlist_builder",
    name: "Watchlist Builder",
    description: "Added 3 or more tokens to your watchlist.",
    category: "profile",
    icon: "Bookmark",
    rarity: "common",
    feed: false,
  },
];

// Special — rare cross-cutting feats spanning multiple disciplines.
const SPECIAL_BADGES: BadgeDefinition[] = [
  {
    key: "triple_threat",
    name: "Triple Threat",
    description: "Traded, made a call, and published a thesis.",
    category: "special",
    icon: "Award",
    rarity: "epic",
  },
];

/**
 * Hidden — invisible in the locked catalogue until earned, then revealed with a
 * celebration. Still derived from real activity; never fabricated.
 */
const HIDDEN_BADGES: BadgeDefinition[] = [
  {
    key: "moonshot",
    name: "Moonshot",
    description: "Had a token call reach 50× or more.",
    category: "caller",
    icon: "Rocket",
    rarity: "legendary",
    hidden: true,
  },
  {
    key: "perfectionist",
    name: "Perfectionist",
    description: "Held a 90%+ hit rate across 10 or more graded calls.",
    category: "caller",
    icon: "Crosshair",
    rarity: "legendary",
    hidden: true,
  },
  {
    key: "rent_reaper",
    name: "Rent Reaper",
    description: "Recovered a cumulative 25 SOL of rent.",
    category: "wallet",
    icon: "Coins",
    rarity: "legendary",
    hidden: true,
  },
];

/**
 * Flattened catalogue — the single source the API, feed and trust score consume.
 * Collection order here is the display order on the profile.
 */
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  ...TRADING_BADGES,
  ...PROFIT_BADGES,
  ...CALL_BADGES,
  ...RESEARCH_BADGES,
  ...WALLET_BADGES,
  ...COMMUNITY_BADGES,
  ...PROFILE_BADGES,
  ...SPECIAL_BADGES,
  ...HIDDEN_BADGES,
];

/** Badge keys that should NOT generate an activity-feed card (setup badges). */
export const NON_FEED_BADGE_KEYS: string[] = BADGE_DEFINITIONS.filter(
  (d) => d.feed === false,
).map((d) => d.key);

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
  // Centralized in progression.ts so every scoring surface shares one source.
  const badgeComp = badgeTrustContribution(earnedBadgeCount);

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
/**
 * Everything an achievement can be derived from. All values come from REAL
 * platform activity; recovery values are from VERIFIED on-chain events only.
 */
export interface BadgeMetrics {
  userId: number;
  closedTrades: number;
  realizedPnlSol: number;
  roiPercent: number;
  traderRank: number | null;
  callsMade: number;
  bestMultiple: number | null;
  callerRank: number | null;
  hitRate: number;
  gradedCalls: number;
  thesisCount: number;
  watchlistCount: number;
  followers: number;
  hasBio: boolean;
  hasAvatar: boolean;
  recoveryAccountsClosed: number;
  recoverySolRecovered: number;
  recoveryCleanups: number;
  recoveryTokensBurned: number;
}

/** One badge's derived state: whether it is earned and (optionally) progress. */
export interface BadgeEvaluation {
  earned: boolean;
  progress: { current: number; target: number } | null;
}

/**
 * The single source of truth for every unlock threshold. Pure (no DB / IO) so it
 * is trivially testable and so progress + earned can never drift apart. For
 * count-based badges it returns `progress` (clamped to the target); boolean
 * badges return null progress.
 */
export function evaluateBadges(
  m: BadgeMetrics,
): Record<string, BadgeEvaluation> {
  const count = (current: number, target: number): BadgeEvaluation => ({
    earned: current >= target,
    progress: { current: Math.min(current, target), target },
  });
  const bool = (earned: boolean): BadgeEvaluation => ({
    earned,
    progress: null,
  });

  return {
    // Trading
    first_trade: count(m.closedTrades, 1),
    ten_trades: count(m.closedTrades, 10),
    fifty_trades: count(m.closedTrades, 50),
    hundred_trades: count(m.closedTrades, 100),
    top_100_trader: bool(m.traderRank != null && m.traderRank <= 100),
    // Profit
    first_profit: bool(m.realizedPnlSol > 0 && m.closedTrades >= 1),
    positive_roi: bool(m.roiPercent > 0 && m.closedTrades >= 5),
    profit_10_sol: count(Math.max(0, m.realizedPnlSol), 10),
    profit_100_sol: count(Math.max(0, m.realizedPnlSol), 100),
    whale_pnl: count(Math.max(0, m.realizedPnlSol), 1000),
    // Calls
    first_call: count(m.callsMade, 1),
    five_calls: count(m.callsMade, 5),
    twenty_calls: count(m.callsMade, 20),
    ten_x_caller: bool(m.bestMultiple != null && m.bestMultiple >= 10),
    sharpshooter: bool(m.hitRate >= 0.6 && m.gradedCalls >= 5),
    top_caller: bool(m.callerRank != null && m.callerRank <= 50),
    // Research
    first_thesis: count(m.thesisCount, 1),
    researcher: count(m.thesisCount, 5),
    consistent_analyst: count(m.thesisCount, 10),
    // Wallet Utilities (verified recovery only)
    first_recovery: count(m.recoveryCleanups, 1),
    ten_accounts_closed: count(m.recoveryAccountsClosed, 10),
    hundred_accounts_closed: count(m.recoveryAccountsClosed, 100),
    one_sol_recovered: count(m.recoverySolRecovered, 1),
    ten_sol_recovered: count(m.recoverySolRecovered, 10),
    wallet_cleaner: count(m.recoveryCleanups, 5),
    token_burner: count(m.recoveryTokensBurned, 10),
    elite_cleaner: bool(
      m.recoveryAccountsClosed >= 50 && m.recoverySolRecovered >= 5,
    ),
    // Community
    early_user: bool(m.userId <= 500),
    networked: count(m.followers, 10),
    // Profile
    profile_complete: bool(m.hasBio && m.hasAvatar),
    watchlist_builder: count(m.watchlistCount, 3),
    // Special
    triple_threat: bool(
      m.closedTrades >= 1 && m.callsMade >= 1 && m.thesisCount >= 1,
    ),
    // Hidden
    moonshot: bool(m.bestMultiple != null && m.bestMultiple >= 50),
    perfectionist: bool(m.hitRate >= 0.9 && m.gradedCalls >= 10),
    rent_reaper: count(m.recoverySolRecovered, 25),
  };
}

export async function getUserBadges(
  userId: number,
  stats: BadgeStatsInput,
): Promise<{ badges: BadgeEntry[]; earnedCount: number }> {
  await ensureBadgesSchema();

  const [
    userExtras,
    thesisRow,
    watchlistRow,
    followerRow,
    recoveryRow,
    holderRows,
    totalUsersRow,
    existingAchievements,
  ] = await Promise.all([
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
    dbGet<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM user_follows WHERE following_user_id = $1`,
      [userId],
    ).catch(() => ({ count: 0 })),
    // Wallet Utilities: aggregate VERIFIED recovery across this user's linked
    // wallets only. Read-only; guarded so a missing table never breaks badges.
    dbGet<{
      accounts_closed: number;
      sol_recovered: number;
      cleanups: number;
      tokens_burned: number;
    }>(
      `SELECT
         COALESCE(SUM(accounts_closed), 0)::int AS accounts_closed,
         COALESCE(SUM(recovered_sol), 0) AS sol_recovered,
         COUNT(*)::int AS cleanups,
         COALESCE(SUM(tokens_burned), 0)::int AS tokens_burned
       FROM recovery_events
       WHERE event_type = 'cleanup' AND status = 'success' AND verified = true
         AND wallet IN (
           SELECT wallet_address FROM user_identities
            WHERE user_id = $1 AND provider = 'wallet'
         )`,
      [userId],
    ).catch(() => null),
    // Share-card rarity: how many distinct users hold each badge.
    dbAll<{ badge_key: string; holders: number }>(
      `SELECT badge_key, COUNT(DISTINCT user_id)::int AS holders
         FROM user_achievements GROUP BY badge_key`,
    ).catch(() => []),
    dbGet<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM users`,
    ).catch(() => ({ count: 0 })),
    dbAll<{ badge_key: string; earned_at: number }>(
      `SELECT badge_key, earned_at
         FROM user_achievements
        WHERE user_id = $1`,
      [userId],
    ),
  ]);

  const metrics: BadgeMetrics = {
    userId,
    closedTrades: stats.closedTrades,
    realizedPnlSol: stats.realizedPnlSol,
    roiPercent: stats.roiPercent,
    traderRank: stats.traderRank,
    callsMade: stats.callsMade,
    bestMultiple: stats.bestMultiple,
    callerRank: stats.callerRank,
    hitRate: stats.hitRate,
    gradedCalls: stats.gradedCalls,
    thesisCount: thesisRow?.count ?? 0,
    watchlistCount: watchlistRow?.count ?? 0,
    followers: followerRow?.count ?? 0,
    hasBio: !!userExtras?.bio?.trim(),
    hasAvatar: !!userExtras?.avatar,
    recoveryAccountsClosed: Number(recoveryRow?.accounts_closed ?? 0),
    recoverySolRecovered: Number(recoveryRow?.sol_recovered ?? 0),
    recoveryCleanups: Number(recoveryRow?.cleanups ?? 0),
    recoveryTokensBurned: Number(recoveryRow?.tokens_burned ?? 0),
  };

  const evals = evaluateBadges(metrics);

  // Persist newly earned badges (upsert-safe, idempotent).
  const prevEarnedMap = new Map<string, number>(
    existingAchievements.map((a) => [a.badge_key, a.earned_at]),
  );
  const now = Math.floor(Date.now() / 1000);

  for (const d of BADGE_DEFINITIONS) {
    if (evals[d.key]?.earned && !prevEarnedMap.has(d.key)) {
      await dbRun(
        `INSERT INTO user_achievements (user_id, badge_key, earned_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, badge_key) DO NOTHING`,
        [userId, d.key, now],
      );
      prevEarnedMap.set(d.key, now);
    }
  }

  const totalUsers = totalUsersRow?.count ?? 0;
  const holderMap = new Map<string, number>(
    holderRows.map((r) => [r.badge_key, r.holders]),
  );

  let earnedCount = 0;
  const badges: BadgeEntry[] = BADGE_DEFINITIONS.map((d) => {
    const ev = evals[d.key] ?? { earned: false, progress: null };
    if (ev.earned) earnedCount += 1;
    const holders = holderMap.get(d.key) ?? 0;
    return {
      ...d,
      earned: ev.earned,
      earnedAt: ev.earned ? (prevEarnedMap.get(d.key) ?? now) : null,
      progress: ev.progress,
      globalEarnedPercent:
        totalUsers > 0
          ? Math.round((holders / totalUsers) * 1000) / 10
          : null,
    };
  });

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
