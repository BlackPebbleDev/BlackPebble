/**
 * Immediate badge minting.
 *
 * The achievement catalogue (badges.ts) derives every unlock from REAL platform
 * activity, but `getUserBadges` only persists ("mints") newly-earned rows when it
 * is called — historically that happened only on a profile/badges view. That made
 * the system PULL-based: a user could publish a thesis or build a watchlist and
 * the unlock would not exist in `user_achievements` (and therefore not appear in
 * the activity feed, which is a live union over that table) until someone opened
 * their profile.
 *
 * This module makes minting PUSH-based: each qualifying action fires a
 * non-blocking mint so the unlock is persisted immediately and surfaces in the
 * feed without a refresh. It is purely additive — it never changes trading,
 * portfolio or accounting state; it only evaluates + upserts achievement rows
 * (which is idempotent via ON CONFLICT DO NOTHING in getUserBadges).
 *
 * All entry points are best-effort: failures are logged and swallowed so a mint
 * can never break or delay the user-facing request that triggered it.
 */

import { dbGet } from "./database.js";
import { getProfile } from "./profiles.js";
import { getCallerStats } from "./callers.js";
import { getUserBadges, type BadgeStatsInput } from "./badges.js";
import { logger } from "./logger.js";

/**
 * Assemble the exact BadgeStatsInput the profile/badges route builds, so the
 * unlock thresholds evaluated here are identical to those shown on the profile.
 * Returns null for users without a public (X-authenticated) profile — those
 * users have no feed/profile surface to mint onto, matching the rest of the
 * system (the feed achievement union is X-identity gated).
 */
async function buildBadgeStats(
  idOrHandle: number | string,
): Promise<{ userId: number; stats: BadgeStatsInput } | null> {
  const profile = await getProfile(String(idOrHandle), null);
  if (!profile) return null;

  const callerEntry = await getCallerStats(profile.user_id);
  const stats: BadgeStatsInput = {
    closedTrades: profile.stats.closedTrades,
    realizedPnlSol: profile.stats.realizedPnlSol,
    roiPercent: profile.stats.roiPercent,
    traderRank: profile.rank,
    callsMade: callerEntry?.callsMade ?? 0,
    bestMultiple: callerEntry?.bestMultiple ?? null,
    callerRank: callerEntry?.rank ?? null,
    hitRate: callerEntry?.hitRate ?? 0,
    gradedCalls: callerEntry?.gradedCalls ?? 0,
    callerScore: callerEntry?.callerScore ?? 0,
  };
  return { userId: profile.user_id, stats };
}

/**
 * Evaluate + persist badges for a user (by internal id or X handle). Awaitable
 * for callers that want to be sure the row exists before responding; most call
 * sites should prefer the fire-and-forget variant below.
 */
export async function mintBadgesForUser(
  idOrHandle: number | string,
): Promise<void> {
  const built = await buildBadgeStats(idOrHandle);
  if (!built) return;
  await getUserBadges(built.userId, built.stats);
}

/**
 * Fire-and-forget mint. Never blocks the request and never throws — any error is
 * logged and swallowed. Use this at the end of action routes (thesis, callout,
 * trade, watchlist, follow, profile update, recovery).
 */
export function mintBadgesAsync(
  idOrHandle: number | string | null | undefined,
): void {
  if (idOrHandle == null || idOrHandle === "") return;
  void mintBadgesForUser(idOrHandle).catch((err) =>
    logger.warn({ err, idOrHandle }, "badge mint failed"),
  );
}

/**
 * Resolve the internal user id linked to a wallet key.
 * Handles two key formats the frontend can send:
 *   "x:<x_provider_user_id>"  — X-authenticated users (most common signed-in path)
 *   "<solana_address>"        — wallet-only users
 * The x: prefix is NEVER stored in wallet_address, so it must be looked up via
 * the X identity row's provider_user_id instead.
 */
async function resolveUserIdByWallet(wallet: string): Promise<number | null> {
  if (wallet.startsWith("x:")) {
    const xId = wallet.slice(2);
    const row = await dbGet<{ user_id: number }>(
      `SELECT user_id FROM user_identities
        WHERE provider = 'x' AND provider_user_id = $1
        LIMIT 1`,
      [xId],
    ).catch(() => null);
    return row?.user_id ?? null;
  }
  const row = await dbGet<{ user_id: number }>(
    `SELECT user_id FROM user_identities
      WHERE wallet_address = $1
      LIMIT 1`,
    [wallet],
  ).catch(() => null);
  return row?.user_id ?? null;
}

/**
 * Fire-and-forget mint keyed by wallet — for wallet-scoped actions (spot/leverage
 * trades, watchlist, recovery) where the route only has the wallet address. No-op
 * for wallets not linked to an account.
 */
export function mintBadgesForWalletAsync(
  wallet: string | null | undefined,
): void {
  const w = wallet?.trim();
  if (!w) return;
  void resolveUserIdByWallet(w)
    .then((userId) =>
      userId != null ? mintBadgesForUser(userId) : undefined,
    )
    .catch((err) =>
      logger.warn({ err, wallet: w }, "badge mint (wallet) failed"),
    );
}
