/**
 * Recovery Achievements — scaffold / hooks ONLY (Phase F).
 *
 * This re-uses the EXISTING achievement architecture (the `BadgeDefinition`
 * shape and the derive-from-real-activity pattern from `badges.ts`). It is a
 * deliberately ISOLATED catalogue, not a second achievement system:
 *
 *   • The definitions follow the same `BadgeDefinition` contract so they can
 *     later flow through the same UI / `user_achievements` persistence.
 *   • The unlock conditions are derived from REAL `recovery_events` only —
 *     nothing is fabricated.
 *   • It is intentionally NOT wired into `computeTrustScore`, the live
 *     `/profiles` badge endpoint, or `user_achievements` persistence. Recovery
 *     activity therefore does NOT change anyone's reputation / trust score and
 *     does NOT alter the existing badge catalogue. Enabling display/persistence
 *     is a later phase decision.
 *
 * Thresholds are product config (see each entry). They were chosen to mirror
 * the cadence of the trading badges (first → 10 → 100 milestones) plus two
 * "cleaner" tiers that reward sustained, high-volume recovery.
 */

import type { BadgeDefinition } from "./badges.js";
import { dbGet } from "./database.js";

export type RecoveryBadgeKey =
  | "first_recovery"
  | "ten_accounts_closed"
  | "hundred_accounts_closed"
  | "one_sol_recovered"
  | "ten_sol_recovered"
  | "wallet_cleaner"
  | "elite_cleaner";

/** Recovery badge catalogue — same shape as the core BADGE_DEFINITIONS. */
export const RECOVERY_BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    key: "first_recovery",
    name: "First Recovery",
    description: "Completed your first successful wallet cleanup.",
    category: "community",
    icon: "Sparkles",
  },
  {
    key: "ten_accounts_closed",
    name: "10 Accounts Closed",
    description: "Closed 10 rent-bearing token accounts.",
    category: "community",
    icon: "Eraser",
  },
  {
    key: "hundred_accounts_closed",
    name: "100 Accounts Closed",
    description: "Closed 100 rent-bearing token accounts.",
    category: "community",
    icon: "Eraser",
  },
  {
    key: "one_sol_recovered",
    name: "1 SOL Recovered",
    description: "Recovered a cumulative 1 SOL of rent.",
    category: "community",
    icon: "Coins",
  },
  {
    key: "ten_sol_recovered",
    name: "10 SOL Recovered",
    description: "Recovered a cumulative 10 SOL of rent.",
    category: "community",
    icon: "Coins",
  },
  {
    key: "wallet_cleaner",
    name: "Wallet Cleaner",
    description: "Ran 5 or more successful wallet cleanups.",
    category: "community",
    icon: "Wand2",
  },
  {
    key: "elite_cleaner",
    name: "Elite Cleaner",
    description: "Closed 50+ accounts and recovered 5+ SOL of rent.",
    category: "community",
    icon: "Trophy",
  },
];

/**
 * Lifetime recovery stats needed to derive recovery achievements. All values
 * are sourced from real successful `recovery_events` for one identity.
 */
export interface RecoveryBadgeStats {
  /** Total rent-bearing accounts closed across all successful cleanups. */
  accountsClosed: number;
  /** Total SOL recovered across all successful cleanups. */
  solRecovered: number;
  /** Number of successful cleanup events. */
  successfulCleanups: number;
}

/** Earned-state for a single recovery badge. */
export interface RecoveryBadgeEntry extends BadgeDefinition {
  earned: boolean;
}

/**
 * Pure hook: given lifetime recovery stats, return each recovery badge with its
 * earned flag. No DB access, no persistence, no reputation side effects — this
 * is the single place the unlock thresholds live.
 */
export function deriveRecoveryBadges(
  stats: RecoveryBadgeStats,
): RecoveryBadgeEntry[] {
  const conditions: Record<RecoveryBadgeKey, boolean> = {
    first_recovery: stats.successfulCleanups >= 1,
    ten_accounts_closed: stats.accountsClosed >= 10,
    hundred_accounts_closed: stats.accountsClosed >= 100,
    one_sol_recovered: stats.solRecovered >= 1,
    ten_sol_recovered: stats.solRecovered >= 10,
    wallet_cleaner: stats.successfulCleanups >= 5,
    elite_cleaner: stats.accountsClosed >= 50 && stats.solRecovered >= 5,
  };
  return RECOVERY_BADGE_DEFINITIONS.map((d) => ({
    ...d,
    earned: !!conditions[d.key as RecoveryBadgeKey],
  }));
}

/**
 * Read-only hook: aggregate a wallet's real recovery totals from
 * `recovery_events` and derive its recovery badges. Read-only by design — it
 * never writes to `user_achievements`, so it cannot affect the feed achievement
 * stream or any trust/reputation calculation. Returns all badges (earned +
 * locked) so a future UI can render the full set.
 */
export async function getRecoveryBadgesForWallet(
  wallet: string,
): Promise<{ badges: RecoveryBadgeEntry[]; stats: RecoveryBadgeStats }> {
  const row = await dbGet<Record<string, number>>(
    `SELECT
       COALESCE(SUM(accounts_closed), 0)::int AS accounts_closed,
       COALESCE(SUM(recovered_sol), 0) AS sol_recovered,
       count(*)::int AS successful_cleanups
     FROM recovery_events
     WHERE event_type = 'cleanup' AND status = 'success' AND wallet = $1`,
    [wallet],
  ).catch(() => null);

  const stats: RecoveryBadgeStats = {
    accountsClosed: Number(row?.accounts_closed ?? 0),
    solRecovered: Number(row?.sol_recovered ?? 0),
    successfulCleanups: Number(row?.successful_cleanups ?? 0),
  };
  return { badges: deriveRecoveryBadges(stats), stats };
}
