/**
 * Reputation Network aggregation (Trader Discovery + Reputation board).
 *
 * Builds a single, cached reputation board over every active X-authenticated
 * user, reusing the EXISTING scoring primitives so a trader's numbers always
 * match what their profile shows:
 *
 *   - Trader stats come from getProfileStats() (the same source the profile
 *     and /portfolio/stats use) so the trust score here is byte-identical to
 *     the profile's trust score.
 *   - Caller stats come from computeCallers() (the immutable-callout grader).
 *   - Trust score is computeTrustScore() - the one and only formula. This file
 *     NEVER changes scoring logic; it only surfaces it across more places.
 *
 * Everything is strictly read-only over existing tables, except the additive,
 * best-effort daily snapshot write (reputation_snapshots) that powers the
 * "Top Rising Traders" growth metric. Snapshots accrue over time; until ~30
 * days of history exists, trust-growth degrades gracefully to 0.
 */

import { dbAll, dbGet, dbRun } from "./database.js";
import { ensureFollowsTable, ensureProfileSchema, getProfileStats } from "./profiles.js";
import { computeCallers, type CallerEntry } from "./callers.js";
import {
  computeTrustScore,
  ensureBadgesSchema,
  getOfficialBadgesForUsers,
  type OfficialBadgeType,
  type TrustLabel,
  type BadgeStatsInput,
} from "./badges.js";
import { getLeaderboard } from "./trading.js";
import { getExecutionPrice } from "./prices.js";

const CACHE_TTL_MS = 60_000;
const DAY = 86_400;
const PRICE_CONCURRENCY = 6;
const STATS_CONCURRENCY = 5;

/** A single trader's reputation row, shared by search / rising / trust board. */
export interface ReputationEntry {
  user_id: number;
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
  graduation_tier: string;
  officialBadges: OfficialBadgeType[];
  trustScore: number;
  trustLabel: TrustLabel;
  followers: number;
  following: number;
  followers30d: number;
  callsMade: number;
  calls30d: number;
  winRate: number;
  roiPercent: number;
  realizedPnlSol: number;
  closedTrades: number;
  traderRank: number | null;
  callerScore: number;
  /** Trust delta vs the closest snapshot ~30d ago (0 when no history yet). */
  trustGrowth30d: number;
  /** Composite freshness score used to rank Top Rising Traders. */
  risingScore: number;
}

interface PopRow {
  user_id: number;
  x_id: string;
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
  followers: number;
  following: number;
  followers30d: number;
  earned_badges: number;
  calls_total: number;
  calls30d: number;
  has_account: boolean;
}

let cache: { at: number; entries: ReputationEntry[] } | null = null;

async function pMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateStrDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY * 1000).toISOString().slice(0, 10);
}

let snapshotSchemaEnsured = false;
/**
 * Additive daily reputation snapshot table. Created idempotently at runtime
 * (CREATE TABLE IF NOT EXISTS), mirrored in lib/db schema for type-safety,
 * matching the analytics_events / user_follows convention.
 */
export async function ensureReputationSnapshotsSchema(): Promise<void> {
  if (snapshotSchemaEnsured) return;
  await dbRun(
    `CREATE TABLE IF NOT EXISTS reputation_snapshots (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL,
       snapshot_date TEXT NOT NULL,
       trust_score INTEGER NOT NULL,
       follower_count INTEGER NOT NULL,
       calls_made INTEGER NOT NULL,
       win_rate DOUBLE PRECISION NOT NULL,
       created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
     )`,
  );
  await dbRun(
    `CREATE UNIQUE INDEX IF NOT EXISTS reputation_snapshots_unique
       ON reputation_snapshots (user_id, snapshot_date)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_reputation_snapshots_date
       ON reputation_snapshots (snapshot_date)`,
  );
  snapshotSchemaEnsured = true;
}

/**
 * Persist today's snapshot for every board entry (idempotent - one row per
 * user per day). Best-effort: a snapshot failure never breaks the board.
 */
async function writeDailySnapshots(entries: ReputationEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const date = todayStr();
  try {
    const values: string[] = [];
    const params: unknown[] = [];
    entries.forEach((e, i) => {
      const b = i * 6;
      values.push(
        `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`,
      );
      params.push(
        e.user_id,
        date,
        e.trustScore,
        e.followers,
        e.callsMade,
        e.winRate,
      );
    });
    await dbRun(
      `INSERT INTO reputation_snapshots
         (user_id, snapshot_date, trust_score, follower_count, calls_made, win_rate)
       VALUES ${values.join(", ")}
       ON CONFLICT (user_id, snapshot_date) DO NOTHING`,
      params,
    );
  } catch {
    /* best-effort */
  }
}

/** Map of user_id -> trust score from the closest snapshot at/older than ~30d. */
async function getTrustBaseline30d(): Promise<Map<number, number>> {
  try {
    const cutoff = dateStrDaysAgo(30);
    const rows = await dbAll<{ user_id: number; trust_score: number }>(
      `SELECT DISTINCT ON (user_id) user_id, trust_score
         FROM reputation_snapshots
        WHERE snapshot_date <= $1
        ORDER BY user_id, snapshot_date DESC`,
      [cutoff],
    );
    return new Map(rows.map((r) => [r.user_id, r.trust_score]));
  } catch {
    return new Map();
  }
}

/**
 * Compute (and cache) the full reputation board. Reuses the exact same trader +
 * caller + badge primitives as the profile route, so trust scores are identical
 * across every surface. Cached for 60s like the caller board.
 */
export async function computeReputationBoard(): Promise<ReputationEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.entries;

  await Promise.all([
    ensureFollowsTable(),
    ensureProfileSchema(),
    ensureBadgesSchema(),
    ensureReputationSnapshotsSchema(),
  ]);

  const since30d = Math.floor(Date.now() / 1000) - 30 * DAY;

  // One batched query gathers the cheap per-user aggregates. The expensive,
  // parity-critical trader/caller stats are merged in afterward.
  const pop = await dbAll<PopRow>(
    `SELECT u.id AS user_id,
            xi.provider_user_id AS x_id,
            xi.x_username AS x_username,
            u.display_name AS x_display_name,
            u.avatar_url AS x_avatar_url,
            (SELECT COUNT(*) FROM user_follows f
              WHERE f.following_user_id = u.id)::int AS followers,
            (SELECT COUNT(*) FROM user_follows f
              WHERE f.follower_user_id = u.id)::int AS following,
            (SELECT COUNT(*) FROM user_follows f
              WHERE f.following_user_id = u.id AND f.created_at >= $1)::int AS followers30d,
            (SELECT COUNT(*) FROM user_achievements ua
              WHERE ua.user_id = u.id)::int AS earned_badges,
            (SELECT COUNT(*) FROM callouts c
              WHERE c.user_id = u.id AND c.is_hidden_by_admin = FALSE
                AND c.is_test = FALSE)::int AS calls_total,
            (SELECT COUNT(*) FROM callouts c
              WHERE c.user_id = u.id AND c.is_hidden_by_admin = FALSE
                AND c.is_test = FALSE AND c.created_at >= $1)::int AS calls30d,
            EXISTS(SELECT 1 FROM accounts a
              WHERE a.wallet = 'x:' || xi.provider_user_id) AS has_account
       FROM user_identities xi
       JOIN users u ON u.id = xi.user_id
      WHERE xi.provider = 'x' AND xi.x_username IS NOT NULL`,
    [since30d],
  );

  // Bound the parity-critical work to users with any reputation footprint.
  const active = pop.filter(
    (p) => p.has_account || p.calls_total > 0 || p.followers > 0,
  );

  const [callers, board, baseline] = await Promise.all([
    computeCallers(),
    getLeaderboard("all"),
    getTrustBaseline30d(),
  ]);

  const callerByUser = new Map<number, CallerEntry>(
    callers.map((c) => [c.user_id, c]),
  );
  const rankByWallet = new Map<string, number>(
    board.map((e) => [e.wallet, e.rank]),
  );

  const entries = await pMap(active, STATS_CONCURRENCY, async (p) => {
    const accountKey = `x:${p.x_id}`;
    const stats = await getProfileStats(accountKey);
    const caller = callerByUser.get(p.user_id);
    const traderRank = rankByWallet.get(accountKey) ?? null;

    // Trust reads spot-only stats - simulated perps P&L never inflates trust.
    const badgeStats: BadgeStatsInput = {
      closedTrades: stats.spotClosedTrades,
      realizedPnlSol: stats.realizedPnlSol,
      roiPercent: stats.spotRoiPercent,
      traderRank,
      callsMade: caller?.callsMade ?? 0,
      bestMultiple: caller?.bestMultiple ?? null,
      callerRank: caller?.rank ?? null,
      hitRate: caller?.hitRate ?? 0,
      gradedCalls: caller?.gradedCalls ?? 0,
      callerScore: caller?.callerScore ?? 0,
    };
    const trust = computeTrustScore(badgeStats, p.earned_badges);

    const old = baseline.get(p.user_id);
    const trustGrowth30d = old != null ? trust.score - old : 0;
    const risingScore =
      p.followers30d * 3 + p.calls30d * 1 + Math.max(0, trustGrowth30d) * 2;

    const entry: ReputationEntry = {
      user_id: p.user_id,
      x_username: p.x_username,
      x_display_name: p.x_display_name,
      x_avatar_url: p.x_avatar_url,
      graduation_tier: stats.graduationTier,
      officialBadges: [],
      trustScore: trust.score,
      trustLabel: trust.label,
      followers: p.followers,
      following: p.following,
      followers30d: p.followers30d,
      callsMade: p.calls_total,
      calls30d: p.calls30d,
      winRate: stats.winRate,
      roiPercent: stats.roiPercent,
      realizedPnlSol: stats.realizedPnlSol,
      closedTrades: stats.closedTrades,
      traderRank,
      callerScore: caller?.callerScore ?? 0,
      trustGrowth30d,
      risingScore,
    };
    return entry;
  });

  // Decorate official badges in one batched read.
  const badgeMap = await getOfficialBadgesForUsers(entries.map((e) => e.user_id));
  for (const e of entries) e.officialBadges = badgeMap.get(e.user_id) ?? [];

  // Accrue history for growth metrics (additive, best-effort, once per day).
  await writeDailySnapshots(entries);

  cache = { at: Date.now(), entries };
  return entries;
}

export interface TraderSearchFilters {
  q?: string;
  tier?: string;
  minTrust?: number;
  minFollowers?: number;
  sort?: "trust" | "followers" | "rising" | "calls";
  limit?: number;
}

/** Trader discovery: filter + sort the reputation board. Read-only. */
export async function searchTraders(
  f: TraderSearchFilters,
): Promise<ReputationEntry[]> {
  const all = await computeReputationBoard();
  const q = (f.q ?? "").trim().replace(/^@+/, "").toLowerCase();
  const tier = (f.tier ?? "").trim().toLowerCase();
  const minTrust = f.minTrust ?? 0;
  const minFollowers = f.minFollowers ?? 0;

  let rows = all.filter((e) => {
    if (e.trustScore < minTrust) return false;
    if (e.followers < minFollowers) return false;
    if (tier && (e.graduation_tier ?? "").toLowerCase() !== tier) return false;
    if (q) {
      const handle = (e.x_username ?? "").toLowerCase();
      const name = (e.x_display_name ?? "").toLowerCase();
      if (!handle.includes(q) && !name.includes(q)) return false;
    }
    return true;
  });

  const sort = f.sort ?? "trust";
  rows = [...rows].sort((a, b) => {
    if (sort === "followers") return b.followers - a.followers;
    if (sort === "rising") return b.risingScore - a.risingScore;
    if (sort === "calls") return b.callsMade - a.callsMade;
    return b.trustScore - a.trustScore;
  });

  const limit = Math.min(Math.max(f.limit ?? 50, 1), 100);
  return rows.slice(0, limit);
}

/** Top Rising Traders - ranked by recent growth, not lifetime totals. */
export async function getTopRising(limit = 50): Promise<ReputationEntry[]> {
  const all = await computeReputationBoard();
  const rising = all
    .filter(
      (e) => e.followers30d > 0 || e.calls30d > 0 || e.trustGrowth30d > 0,
    )
    .sort(
      (a, b) =>
        b.risingScore - a.risingScore || b.trustScore - a.trustScore,
    );
  return rising.slice(0, Math.min(Math.max(limit, 1), 100));
}

/** Highest Trust Score board - reputation leaderboard. */
export async function getHighestTrust(limit = 100): Promise<ReputationEntry[]> {
  const all = await computeReputationBoard();
  const ranked = all
    .filter((e) => e.trustScore > 0)
    .sort(
      (a, b) =>
        b.trustScore - a.trustScore ||
        b.followers - a.followers ||
        b.callerScore - a.callerScore,
    );
  return ranked.slice(0, Math.min(Math.max(limit, 1), 200));
}

// ── Period-filtered performance (30d / 90d / all) ───────────────────────────

export interface PeriodPerformance {
  totalCalls: number;
  gradedCalls: number;
  /** % of graded calls that reached >= 2x (caller "hit" definition). */
  winRate: number;
  /** Average % return across graded calls, or null when none graded. */
  avgReturnPercent: number | null;
  bestCall: { token_symbol: string | null; token_mint: string; returnPercent: number } | null;
  worstCall: { token_symbol: string | null; token_mint: string; returnPercent: number } | null;
}

export interface PerformanceResponse {
  window30d: PeriodPerformance;
  window90d: PeriodPerformance;
  all: PeriodPerformance;
}

interface PerfCalloutRow {
  token_mint: string;
  token_symbol: string | null;
  call_price_usd: number | null;
  created_at: number;
}

const HIT_MULTIPLE = 2;

function emptyPerf(): PeriodPerformance {
  return {
    totalCalls: 0,
    gradedCalls: 0,
    winRate: 0,
    avgReturnPercent: null,
    bestCall: null,
    worstCall: null,
  };
}

function bucketPerf(rows: GradedCall[]): PeriodPerformance {
  if (rows.length === 0) return emptyPerf();
  const graded = rows.filter((r) => r.returnPercent != null);
  let best: GradedCall | null = null;
  let worst: GradedCall | null = null;
  let sum = 0;
  let hits = 0;
  for (const r of graded) {
    const rp = r.returnPercent as number;
    sum += rp;
    if (rp >= (HIT_MULTIPLE - 1) * 100) hits += 1;
    if (!best || rp > (best.returnPercent as number)) best = r;
    if (!worst || rp < (worst.returnPercent as number)) worst = r;
  }
  return {
    totalCalls: rows.length,
    gradedCalls: graded.length,
    winRate: graded.length > 0 ? (hits / graded.length) * 100 : 0,
    avgReturnPercent: graded.length > 0 ? sum / graded.length : null,
    bestCall: best
      ? {
          token_symbol: best.token_symbol,
          token_mint: best.token_mint,
          returnPercent: best.returnPercent as number,
        }
      : null,
    worstCall: worst
      ? {
          token_symbol: worst.token_symbol,
          token_mint: worst.token_mint,
          returnPercent: worst.returnPercent as number,
        }
      : null,
  };
}

interface GradedCall {
  token_mint: string;
  token_symbol: string | null;
  created_at: number;
  returnPercent: number | null;
}

/**
 * Per-period call performance for a single user, graded live against current
 * prices (current ÷ call price). Read-only over the immutable callouts table;
 * never mutates a call. Mirrors the caller grader's "hit at 2x" definition.
 */
export async function getPeriodPerformance(
  userId: number,
): Promise<PerformanceResponse> {
  await ensureProfileSchema();
  const rows = await dbAll<PerfCalloutRow>(
    `SELECT token_mint, token_symbol, call_price_usd, created_at
       FROM callouts
      WHERE user_id = $1 AND is_hidden_by_admin = FALSE AND is_test = FALSE
      ORDER BY created_at DESC`,
    [userId],
  );
  if (rows.length === 0) {
    return { window30d: emptyPerf(), window90d: emptyPerf(), all: emptyPerf() };
  }

  const mints = Array.from(new Set(rows.map((r) => r.token_mint)));
  const priceList = await pMap(mints, PRICE_CONCURRENCY, async (mint) => {
    const px = await getExecutionPrice(mint).catch(() => null);
    return [mint, px?.priceUsd ?? null] as const;
  });
  const priceByMint = new Map<string, number | null>(priceList);

  const graded: GradedCall[] = rows.map((r) => {
    const cur = priceByMint.get(r.token_mint);
    const hasCall = r.call_price_usd != null && r.call_price_usd > 0;
    const returnPercent =
      cur != null && cur > 0 && hasCall
        ? (cur / (r.call_price_usd as number) - 1) * 100
        : null;
    return {
      token_mint: r.token_mint,
      token_symbol: r.token_symbol,
      created_at: r.created_at,
      returnPercent,
    };
  });

  const now = Math.floor(Date.now() / 1000);
  const cut30 = now - 30 * DAY;
  const cut90 = now - 90 * DAY;

  return {
    window30d: bucketPerf(graded.filter((g) => g.created_at >= cut30)),
    window90d: bucketPerf(graded.filter((g) => g.created_at >= cut90)),
    all: bucketPerf(graded),
  };
}
