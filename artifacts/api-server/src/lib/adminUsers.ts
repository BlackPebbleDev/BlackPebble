import { dbGet, dbAll } from "./database.js";
import {
  classifyIdentifier,
  type IdentifierKind,
  type ClassifiedIdentifier,
} from "./adminIdentifier.js";
import { getClosedTradeStats, getLeaderboard } from "./trading.js";
import { getProfileStats } from "./profiles.js";
import { getCallerStats } from "./callers.js";
import {
  computeTrustScore,
  getEarnedBadgeCount,
  getOfficialBadgesForUser,
  type BadgeStatsInput,
} from "./badges.js";
import { logger } from "./logger.js";

/**
 * Reusable admin user resolver.
 *
 * Admin tools historically matched the raw admin input directly against the
 * `wallet` column. That breaks for X-authenticated users because their paper
 * account is keyed by the synthetic `x:<x_id>` identity, not by a wallet or a
 * bare X id. This module normalises ANY admin identifier to the canonical
 * account key used across accounts/trades/positions/orders, and builds a rich
 * preview so a destructive action can be confirmed against the right person.
 *
 * Supported identifiers:
 *   - `@handle` / `handle`         (X username)
 *   - X numeric id                 (provider_user_id from X OAuth)
 *   - internal BlackPebble user id (users.id)
 *   - `x:<x_id>`                   (the synthetic account key itself)
 *   - a Solana wallet address      (guest/unlinked, or linked to an X user)
 */

export { classifyIdentifier };
export type { IdentifierKind, ClassifiedIdentifier };

export type MatchedBy =
  | "x-key"
  | "wallet"
  | "wallet-linked"
  | "handle"
  | "x-id"
  | "internal-id";

export interface ResolvedIdentity {
  userId: number;
  xId: string;
  xUsername: string;
  xDisplayName: string | null;
  xAvatarUrl: string | null;
  userCreatedAt: number | null;
}

export interface ResolvedAccount {
  found: boolean;
  /** Canonical value to use in `wallet = $1` operations, or null when unresolved. */
  accountKey: string | null;
  matchedBy: MatchedBy | null;
  /** True when the account is a bare wallet with no linked X identity. */
  isGuest: boolean;
  identity: ResolvedIdentity | null;
  /**
   * Set when the identifier is ambiguous (e.g. a wallet or handle linked to
   * more than one distinct user). The caller must surface this as an explicit
   * conflict rather than silently operating on one of them.
   */
  conflict?: string | null;
}

interface IdentityRow {
  user_id: number;
  x_id: string;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
  user_created_at: number | null;
}

const IDENTITY_SELECT = `
  SELECT u.id AS user_id,
         xi.provider_user_id AS x_id,
         xi.x_username AS x_username,
         u.display_name AS x_display_name,
         u.avatar_url AS x_avatar_url,
         u.created_at AS user_created_at
    FROM user_identities xi
    JOIN users u ON u.id = xi.user_id
   WHERE xi.provider = 'x'`;

function toIdentity(
  row: IdentityRow | null | undefined,
): ResolvedIdentity | null {
  if (!row) return null;
  return {
    userId: row.user_id,
    xId: row.x_id,
    xUsername: row.x_username,
    xDisplayName: row.x_display_name,
    xAvatarUrl: row.x_avatar_url,
    userCreatedAt: row.user_created_at,
  };
}

function xIdentityByXId(xId: string): Promise<IdentityRow | undefined> {
  return dbGet<IdentityRow>(
    `${IDENTITY_SELECT} AND xi.provider_user_id = $1 LIMIT 1`,
    [xId],
  );
}

function xIdentityByUserId(userId: number): Promise<IdentityRow | undefined> {
  return dbGet<IdentityRow>(`${IDENTITY_SELECT} AND xi.user_id = $1 LIMIT 1`, [
    userId,
  ]);
}

function xIdentityByHandle(handle: string): Promise<IdentityRow | undefined> {
  return dbGet<IdentityRow>(
    `${IDENTITY_SELECT} AND LOWER(xi.x_username) = LOWER($1) LIMIT 1`,
    [handle],
  );
}

const NOT_FOUND: ResolvedAccount = {
  found: false,
  accountKey: null,
  matchedBy: null,
  isGuest: false,
  identity: null,
};

function conflictResult(message: string): ResolvedAccount {
  return { ...NOT_FOUND, conflict: message };
}

/** Distinct user ids owning an X identity for a handle (ambiguity guard). */
async function distinctUsersForHandle(handle: string): Promise<number[]> {
  const rows = await dbAll<{ user_id: number }>(
    `SELECT DISTINCT user_id FROM user_identities
      WHERE provider = 'x' AND LOWER(x_username) = LOWER($1)`,
    [handle],
  );
  return rows.map((r) => r.user_id);
}

/** Distinct user ids linked to a wallet address (ambiguity guard). */
async function distinctUsersForWallet(wallet: string): Promise<number[]> {
  const rows = await dbAll<{ user_id: number }>(
    `SELECT DISTINCT user_id FROM user_identities
      WHERE provider = 'wallet' AND provider_user_id = $1`,
    [wallet],
  );
  return rows.map((r) => r.user_id);
}

/**
 * Resolve any admin identifier to the canonical paper-trading account key.
 * Returns `found: false` when a handle / numeric id cannot be matched, so
 * callers can fail loudly instead of silently operating on zero rows.
 */
export async function resolveAdminAccount(
  raw: string,
): Promise<ResolvedAccount> {
  const c = classifyIdentifier(raw);
  if (c.kind === "empty") return NOT_FOUND;

  if (c.kind === "x-key") {
    // The synthetic key is itself valid even if the identity row is missing.
    const identity = await xIdentityByXId(c.value);
    return {
      found: true,
      accountKey: `x:${c.value}`,
      matchedBy: "x-key",
      isGuest: !identity,
      identity: toIdentity(identity),
    };
  }

  if (c.kind === "wallet") {
    const linkedUsers = await distinctUsersForWallet(c.value);
    if (linkedUsers.length > 1) {
      return conflictResult(
        `Wallet ${c.value} is linked to ${linkedUsers.length} different users. Resolve by X handle or id instead.`,
      );
    }
    if (linkedUsers.length === 1) {
      const identity = await xIdentityByUserId(linkedUsers[0]!);
      if (identity) {
        return {
          found: true,
          accountKey: `x:${identity.x_id}`,
          matchedBy: "wallet-linked",
          isGuest: false,
          identity: toIdentity(identity),
        };
      }
    }
    // Guest / unlinked wallet: the account key IS the wallet.
    return {
      found: true,
      accountKey: c.value,
      matchedBy: "wallet",
      isGuest: true,
      identity: null,
    };
  }

  if (c.kind === "handle") {
    const users = await distinctUsersForHandle(c.value);
    if (users.length > 1) {
      return conflictResult(
        `Handle @${c.value} matches ${users.length} users. Resolve by X id or internal id instead.`,
      );
    }
    const identity = await xIdentityByHandle(c.value);
    if (!identity) return NOT_FOUND;
    return {
      found: true,
      accountKey: `x:${identity.x_id}`,
      matchedBy: "handle",
      isGuest: false,
      identity: toIdentity(identity),
    };
  }

  // numeric: could be an X provider_user_id OR an internal users.id. Prefer the
  // X id (what admins usually paste), then fall back to the internal id.
  const byX = await xIdentityByXId(c.value);
  if (byX) {
    return {
      found: true,
      accountKey: `x:${byX.x_id}`,
      matchedBy: "x-id",
      isGuest: false,
      identity: toIdentity(byX),
    };
  }
  const byInternal = await xIdentityByUserId(Number(c.value));
  if (byInternal) {
    return {
      found: true,
      accountKey: `x:${byInternal.x_id}`,
      matchedBy: "internal-id",
      isGuest: false,
      identity: toIdentity(byInternal),
    };
  }
  return NOT_FOUND;
}

export interface AdminUserPreview {
  found: boolean;
  /** Explicit ambiguity message when the identifier matched multiple users. */
  conflict: string | null;
  accountKey: string | null;
  matchedBy: MatchedBy | null;
  registered: boolean;
  isGuest: boolean;
  identity: ResolvedIdentity | null;
  connectedWallet: string | null;
  hasAccount: boolean;
  createdAt: number | null;
  balance: number | null;
  season: number | null;
  tier: string | null;
  openSpotPositions: number;
  openPerpsPositions: number;
  activeOrders: number;
  closedTrades: number;
  executions: number;
  watchlistCount: number;
  rank: number | null;
  trustScore: number | null;
  officialBadges: string[];
}

async function countRows(sql: string, params: unknown[]): Promise<number> {
  const row = await dbGet<{ n: number }>(sql, params);
  return row?.n ?? 0;
}

/**
 * Full admin preview for a resolved user: identity + live account state +
 * reputation. Read-only; never materialises an account row. Reputation fields
 * are best-effort (null on failure) so a preview never breaks.
 */
export async function getAdminUserPreview(
  raw: string,
): Promise<AdminUserPreview> {
  const resolved = await resolveAdminAccount(raw);
  if (!resolved.found || !resolved.accountKey) {
    return {
      found: false,
      conflict: resolved.conflict ?? null,
      accountKey: null,
      matchedBy: null,
      registered: false,
      isGuest: false,
      identity: null,
      connectedWallet: null,
      hasAccount: false,
      createdAt: null,
      balance: null,
      season: null,
      tier: null,
      openSpotPositions: 0,
      openPerpsPositions: 0,
      activeOrders: 0,
      closedTrades: 0,
      executions: 0,
      watchlistCount: 0,
      rank: null,
      trustScore: null,
      officialBadges: [],
    };
  }

  const key = resolved.accountKey;
  const uid = resolved.identity?.userId ?? null;

  const [account, spot, perps, orders, watch, cs] = await Promise.all([
    dbGet<{
      paper_balance: number;
      season: number;
      graduation_tier: string;
      created_at: number | null;
    }>(
      `SELECT paper_balance, season, graduation_tier, created_at
         FROM accounts WHERE wallet = $1`,
      [key],
    ),
    countRows(
      `SELECT COUNT(*)::int AS n FROM positions WHERE wallet = $1`,
      [key],
    ),
    countRows(
      `SELECT COUNT(*)::int AS n FROM paper_leverage_positions
        WHERE wallet = $1 AND status IN ('open','closing')`,
      [key],
    ),
    countRows(
      `SELECT COUNT(*)::int AS n FROM paper_orders
        WHERE wallet = $1 AND status IN ('pending','filling')`,
      [key],
    ),
    countRows(
      `SELECT COUNT(*)::int AS n FROM watchlist WHERE wallet = $1`,
      [key],
    ),
    getClosedTradeStats(key).catch(() => null),
  ]);

  let connectedWallet: string | null = null;
  let officialBadges: string[] = [];
  let trustScore: number | null = null;
  if (uid != null) {
    try {
      const [walletRow, badges] = await Promise.all([
        dbGet<{ w: string }>(
          `SELECT provider_user_id AS w FROM user_identities
            WHERE user_id = $1 AND provider = 'wallet'
            ORDER BY created_at ASC LIMIT 1`,
          [uid],
        ),
        getOfficialBadgesForUser(uid),
      ]);
      connectedWallet = walletRow?.w ?? null;
      officialBadges = badges;
    } catch (err) {
      logger.warn({ err, uid }, "admin preview: identity extras failed");
    }
  }

  // Rank comes from the top-of-board snapshot (same source the public profile
  // uses); users outside the ranked window resolve to null (Unranked).
  let rank: number | null = null;
  try {
    const board = await getLeaderboard("all");
    rank = board.find((e) => e.wallet === key)?.rank ?? null;
  } catch (err) {
    logger.warn({ err, key }, "admin preview: leaderboard lookup failed");
  }

  if (uid != null) {
    try {
      const [pstats, caller, earned] = await Promise.all([
        getProfileStats(key),
        getCallerStats(uid),
        getEarnedBadgeCount(uid),
      ]);
      const badgeStats: BadgeStatsInput = {
        closedTrades: pstats.spotClosedTrades,
        realizedPnlSol: pstats.realizedPnlSol,
        roiPercent: pstats.spotRoiPercent,
        traderRank: rank,
        callsMade: caller?.callsMade ?? 0,
        bestMultiple: caller?.bestMultiple ?? null,
        callerRank: caller?.rank ?? null,
        hitRate: caller?.hitRate ?? 0,
        gradedCalls: caller?.gradedCalls ?? 0,
        callerScore: caller?.callerScore ?? 0,
      };
      trustScore = computeTrustScore(badgeStats, earned).score;
    } catch (err) {
      logger.warn({ err, uid }, "admin preview: trust score failed");
    }
  }

  return {
    found: true,
    conflict: null,
    accountKey: key,
    matchedBy: resolved.matchedBy,
    registered: resolved.identity != null,
    isGuest: resolved.isGuest,
    identity: resolved.identity,
    connectedWallet,
    hasAccount: account != null,
    createdAt: account?.created_at ?? resolved.identity?.userCreatedAt ?? null,
    balance: account?.paper_balance ?? null,
    season: account?.season ?? null,
    tier: account?.graduation_tier ?? null,
    openSpotPositions: spot,
    openPerpsPositions: perps,
    activeOrders: orders,
    closedTrades: cs?.closedTrades ?? 0,
    executions: cs?.executions ?? 0,
    watchlistCount: watch,
    rank,
    trustScore,
    officialBadges,
  };
}
