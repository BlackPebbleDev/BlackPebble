import {
  publishEvent,
  type FeedVisibility,
} from "../feed-service.js";
import {
  categoryOf,
  surfacesFor,
  type ActivityType,
} from "./taxonomy.js";

/**
 * Activity Layer — the single publish entry point (Phase 2 foundation).
 *
 * `recordActivity()` is the one clean way to publish a milestone-type activity
 * that has no source-of-truth table (tier promotions, follower milestones, and
 * — in Phase 4 — best-trade/PnL milestones, rank/score changes, win streaks,
 * campaign goal-progress, etc.). Derived events (raw trades, calls, theses,
 * recovery, campaign events) are NOT published here; they keep deriving from
 * their tables in the read model.
 *
 * recordActivity() normalizes every published event onto the canonical
 * taxonomy: it derives the `feed_events.category` from the type, stamps the
 * canonical `activityType` into `meta` (self-describing rows for future toast /
 * notification fan-out), and delegates durable storage + idempotency to
 * `feedService.publishEvent()`. Fire-and-forget safe — it never throws into
 * the caller's flow.
 */

export interface RecordActivityInput {
  actorUserId: number;
  /** Canonical taxonomy type — drives category + surface routing. */
  type: ActivityType;
  /**
   * Machine kind stored in `feed_events.kind`; the read model surfaces this as
   * the item `action` and re-classifies from it (e.g. "tier_up").
   */
  kind: string;
  title: string;
  summary?: string | null;
  meta?: Record<string, unknown> | null;
  visibility?: FeedVisibility;
  /** Idempotency key — the same key publishes at most once, ever. */
  dedupeKey?: string | null;
}

/**
 * Publish a normalized activity event. Returns true when a new row was
 * created (false on dedupe hit or swallowed error).
 */
export async function recordActivity(
  input: RecordActivityInput,
): Promise<boolean> {
  return publishEvent({
    actorUserId: input.actorUserId,
    kind: input.kind,
    category: categoryOf(input.type),
    title: input.title,
    summary: input.summary ?? null,
    meta: { ...(input.meta ?? {}), activityType: input.type },
    visibility: input.visibility,
    dedupeKey: input.dedupeKey ?? null,
  });
}

// ── Wired milestone publishers ────────────────────────────────────────────────

/** Follower counts that publish a milestone (fixed thresholds — no spam). */
export const FOLLOWER_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 5000];

/** Graduation tiers that deserve a feed milestone, in ascending order. */
export const TIER_MILESTONES = ["Bronze", "Silver", "Gold", "Diamond", "Legend"];

/**
 * Publish a tier-promotion milestone. Dedupe key ensures each user posts a
 * given tier at most once, ever.
 */
export async function publishTierMilestone(
  userId: number,
  tier: string,
  realizedPnlSol: number,
): Promise<void> {
  if (!TIER_MILESTONES.includes(tier)) return;
  await recordActivity({
    actorUserId: userId,
    type: "progression.tier_upgraded",
    kind: "tier_up",
    title: `Reached ${tier} Trader`,
    summary: null,
    meta: { tier, realizedPnlSol: Number(realizedPnlSol.toFixed(4)) },
    dedupeKey: `tier:${userId}:${tier}`,
  });
}

/**
 * Publish a follower-count milestone for the user who was just followed.
 * Called with the post-follow count; publishes only on exact thresholds.
 */
export async function publishFollowerMilestone(
  userId: number,
  followerCount: number,
): Promise<void> {
  if (!FOLLOWER_MILESTONES.includes(followerCount)) return;
  await recordActivity({
    actorUserId: userId,
    type: "social.follower_milestone",
    kind: "follower_milestone",
    title: `Reached ${followerCount.toLocaleString("en-US")} followers`,
    summary: null,
    meta: { followers: followerCount },
    dedupeKey: `followers:${userId}:${followerCount}`,
  });
}

export { surfacesFor };
