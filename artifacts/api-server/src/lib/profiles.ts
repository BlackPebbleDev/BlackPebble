import { dbAll, dbGet, dbRun } from "./database.js";
import {
  getAccount,
  getClosedTradeStats,
  getLeaderboard,
  getPortfolio,
  STARTING_BALANCE,
} from "./trading.js";
import { getLeveragePortfolio } from "./leverage.js";

/**
 * Social profiles + follow graph (Phase 1 groundwork).
 *
 * The social layer is X-authenticated ONLY: a user has a public profile and can
 * follow / be followed only if they have a `provider = 'x'` identity. Wallet-only
 * and guest users can still trade, but `resolveUser` returns null for them, so
 * they have no profile and the routes reject any follow action.
 *
 * The follow table is created idempotently at runtime (CREATE TABLE IF NOT
 * EXISTS), mirroring the analytics_events pattern — drizzle-kit push needs a TTY
 * that isn't available here. The schema is mirrored in lib/db for type-safety.
 */

export interface ResolvedUser {
  user_id: number;
  x_id: string;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

export interface ProfileStats {
  roiPercent: number;
  totalPnlSol: number;
  realizedPnlSol: number;
  winRate: number;
  totalExecutions: number;
  closedTrades: number;
  bestTrade: number | null;
  graduationTier: string;
}

export interface ProfileResponse extends ResolvedUser {
  /** All-time leaderboard rank, or null when unranked (below min trades). */
  rank: number | null;
  graduationTier: string;
  followers: number;
  following: number;
  /** True when the requesting (X) user already follows this profile. */
  isFollowing: boolean;
  /** True when the requesting user is viewing their own profile. */
  isSelf: boolean;
  stats: ProfileStats;
}

export interface FollowUser {
  user_id: number;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

let ensured = false;
export async function ensureFollowsTable(): Promise<void> {
  if (ensured) return;
  await dbRun(
    `CREATE TABLE IF NOT EXISTS user_follows (
       id SERIAL PRIMARY KEY,
       follower_user_id INTEGER NOT NULL,
       following_user_id INTEGER NOT NULL,
       created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
     )`,
  );
  await dbRun(
    `CREATE UNIQUE INDEX IF NOT EXISTS user_follows_unique
       ON user_follows (follower_user_id, following_user_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_user_follows_following
       ON user_follows (following_user_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_user_follows_follower
       ON user_follows (follower_user_id)`,
  );
  ensured = true;
}

/**
 * Resolve a profile target by either a numeric internal user id or an X handle
 * (case-insensitive, leading @ tolerated). Returns null for anything that is not
 * an X-authenticated user, which is what gates the whole social layer.
 */
export async function resolveUser(
  idOrHandle: string,
): Promise<ResolvedUser | null> {
  const raw = String(idOrHandle || "").trim();
  if (!raw) return null;
  const numeric = /^\d+$/.test(raw);
  const handle = raw.replace(/^@+/, "");
  const row = await dbGet<{
    user_id: number;
    x_id: string;
    x_username: string;
    x_display_name: string | null;
    x_avatar_url: string | null;
  }>(
    `SELECT u.id AS user_id,
            xi.provider_user_id AS x_id,
            xi.x_username AS x_username,
            u.display_name AS x_display_name,
            u.avatar_url AS x_avatar_url
       FROM user_identities xi
       JOIN users u ON u.id = xi.user_id
      WHERE xi.provider = 'x'
        AND ${numeric ? "u.id = $1" : "lower(xi.x_username) = lower($1)"}
      LIMIT 1`,
    [numeric ? Number(raw) : handle],
  );
  if (!row || !row.x_username) return null;
  return {
    user_id: row.user_id,
    x_id: row.x_id,
    x_username: row.x_username,
    x_display_name: row.x_display_name,
    x_avatar_url: row.x_avatar_url,
  };
}

const EMPTY_STATS: ProfileStats = {
  roiPercent: 0,
  totalPnlSol: 0,
  realizedPnlSol: 0,
  winRate: 0,
  totalExecutions: 0,
  closedTrades: 0,
  bestTrade: null,
  graduationTier: "Unranked",
};

/**
 * Trader stats for a profile, reusing the SAME primitives as the
 * /portfolio/stats endpoint so the numbers always match. This is strictly
 * read-only: it must NOT alter any trading/portfolio/leverage accounting.
 *
 * Because getPortfolio() (and ensureAccount) would lazily INSERT an accounts
 * row, we first fetch the account read-only. An X user who has never traded has
 * no account yet — we return zeroed defaults instead of materializing one, so a
 * profile GET never creates trading state. When the account already exists,
 * getPortfolio's INSERT ... ON CONFLICT DO NOTHING is a no-op.
 */
export async function getProfileStats(wallet: string): Promise<ProfileStats> {
  const account = await getAccount(wallet);
  if (!account) return { ...EMPTY_STATS };

  const [portfolio, cs, levPortfolio, levCounts] = await Promise.all([
    getPortfolio(wallet),
    getClosedTradeStats(wallet),
    getLeveragePortfolio(wallet),
    dbGet<{ total: number; closed: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(CASE WHEN action != 'open' THEN 1 END)::int AS closed
         FROM paper_leverage_trades WHERE wallet = $1`,
      [wallet],
    ),
  ]);

  const openLeverageEquitySol = levPortfolio.positions.reduce(
    (s, p) => s + Math.max(0, p.positionEquitySol ?? p.margin_sol),
    0,
  );
  const totalEquitySol = portfolio.equitySol + openLeverageEquitySol;
  const totalPnlSol = totalEquitySol - STARTING_BALANCE;
  const roiPercent = (totalPnlSol / STARTING_BALANCE) * 100;
  const totalExecutions = cs.executions + (levCounts?.total ?? 0);
  const closedTrades = cs.closedTrades + (levCounts?.closed ?? 0);

  return {
    roiPercent,
    totalPnlSol,
    realizedPnlSol: cs.realizedPnl,
    winRate: cs.winRate,
    totalExecutions,
    closedTrades,
    bestTrade: cs.bestTrade,
    graduationTier: account.graduation_tier,
  };
}

export async function getProfile(
  idOrHandle: string,
  viewerUserId?: number | null,
): Promise<ProfileResponse | null> {
  const u = await resolveUser(idOrHandle);
  if (!u) return null;
  await ensureFollowsTable();

  const accountKey = `x:${u.x_id}`;
  const [stats, board, counts, follows] = await Promise.all([
    getProfileStats(accountKey),
    getLeaderboard("all"),
    dbGet<{ followers: number; following: number }>(
      `SELECT
         (SELECT COUNT(*) FROM user_follows WHERE following_user_id = $1)::int AS followers,
         (SELECT COUNT(*) FROM user_follows WHERE follower_user_id = $1)::int AS following`,
      [u.user_id],
    ),
    viewerUserId
      ? dbGet<{ ok: number }>(
          `SELECT 1 AS ok FROM user_follows
            WHERE follower_user_id = $1 AND following_user_id = $2`,
          [viewerUserId, u.user_id],
        )
      : Promise.resolve(null),
  ]);

  const entry = board.find((e) => e.wallet === accountKey);

  return {
    ...u,
    rank: entry?.rank ?? null,
    graduationTier: stats.graduationTier,
    followers: counts?.followers ?? 0,
    following: counts?.following ?? 0,
    isFollowing: !!follows,
    isSelf: viewerUserId != null && viewerUserId === u.user_id,
    stats,
  };
}

export type FollowResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function followUser(
  viewerUserId: number,
  idOrHandle: string,
): Promise<FollowResult> {
  await ensureFollowsTable();
  const target = await resolveUser(idOrHandle);
  if (!target) return { ok: false, status: 404, error: "Profile not found" };
  if (target.user_id === viewerUserId) {
    return { ok: false, status: 400, error: "You cannot follow yourself" };
  }
  await dbRun(
    `INSERT INTO user_follows (follower_user_id, following_user_id)
     VALUES ($1, $2)
     ON CONFLICT (follower_user_id, following_user_id) DO NOTHING`,
    [viewerUserId, target.user_id],
  );
  return { ok: true };
}

export async function unfollowUser(
  viewerUserId: number,
  idOrHandle: string,
): Promise<FollowResult> {
  await ensureFollowsTable();
  const target = await resolveUser(idOrHandle);
  if (!target) return { ok: false, status: 404, error: "Profile not found" };
  await dbRun(
    `DELETE FROM user_follows
      WHERE follower_user_id = $1 AND following_user_id = $2`,
    [viewerUserId, target.user_id],
  );
  return { ok: true };
}

async function listRelations(
  idOrHandle: string,
  direction: "followers" | "following",
): Promise<FollowUser[] | null> {
  await ensureFollowsTable();
  const target = await resolveUser(idOrHandle);
  if (!target) return null;
  // followers: people who follow target → join on follower_user_id
  // following: people target follows → join on following_user_id
  const joinCol =
    direction === "followers" ? "f.follower_user_id" : "f.following_user_id";
  const whereCol =
    direction === "followers" ? "f.following_user_id" : "f.follower_user_id";
  const rows = await dbAll<{
    user_id: number;
    x_username: string;
    x_display_name: string | null;
    x_avatar_url: string | null;
  }>(
    `SELECT u.id AS user_id,
            xi.x_username AS x_username,
            u.display_name AS x_display_name,
            u.avatar_url AS x_avatar_url
       FROM user_follows f
       JOIN users u ON u.id = ${joinCol}
       JOIN user_identities xi ON xi.user_id = u.id AND xi.provider = 'x'
      WHERE ${whereCol} = $1
      ORDER BY f.created_at DESC
      LIMIT 200`,
    [target.user_id],
  );
  return rows.map((r) => ({
    user_id: r.user_id,
    x_username: r.x_username,
    x_display_name: r.x_display_name,
    x_avatar_url: r.x_avatar_url,
  }));
}

export function listFollowers(idOrHandle: string): Promise<FollowUser[] | null> {
  return listRelations(idOrHandle, "followers");
}

export function listFollowing(idOrHandle: string): Promise<FollowUser[] | null> {
  return listRelations(idOrHandle, "following");
}

export async function getFollowedUserIds(
  viewerUserId: number,
): Promise<number[]> {
  await ensureFollowsTable();
  const rows = await dbAll<{ following_user_id: number }>(
    `SELECT following_user_id FROM user_follows WHERE follower_user_id = $1`,
    [viewerUserId],
  );
  return rows.map((r) => r.following_user_id);
}
