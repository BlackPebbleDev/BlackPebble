import { dbAll, dbRun } from "./database.js";
import { ensureFeedSchema } from "./feed-schema.js";
import { logger } from "./logger.js";

/**
 * Feed service — the single write path into the Activity Intelligence
 * Engine's published-event layer, plus the reaction system.
 *
 * Every major feature publishes milestone events through publishEvent();
 * nothing writes feed_events directly. Publishing is always best-effort and
 * never throws into the caller's flow — a failed feed post must never break
 * a trade, a follow, or a settlement.
 */

export type FeedVisibility = "public" | "followers" | "private";

export interface PublishEventInput {
  actorUserId: number;
  /** Machine kind, e.g. "tier_up", "follower_milestone". */
  kind: string;
  /** Category bucket, e.g. "reputation", "social", "trading". */
  category: string;
  /** Headline, e.g. "Reached Gold Trader". */
  title: string;
  /** One-line context, optional. */
  summary?: string | null;
  /** Structured payload for cards / share cards / future AI consumers. */
  meta?: Record<string, unknown> | null;
  visibility?: FeedVisibility;
  /**
   * Idempotency key — the same key can only ever publish once
   * (e.g. `tier:{userId}:{tier}`). Strongly recommended for milestones.
   */
  dedupeKey?: string | null;
}

/**
 * Publish a feed event. Fire-and-forget safe: swallows all errors (logged).
 * Returns true when a new event row was created.
 */
export async function publishEvent(input: PublishEventInput): Promise<boolean> {
  try {
    await ensureFeedSchema();
    const rows = await dbAll<{ id: number }>(
      `INSERT INTO feed_events
         (actor_user_id, kind, category, title, summary, meta, visibility,
          dedupe_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [
        input.actorUserId,
        input.kind,
        input.category,
        input.title,
        input.summary ?? null,
        input.meta ? JSON.stringify(input.meta) : null,
        input.visibility ?? "public",
        input.dedupeKey ?? null,
        Math.floor(Date.now() / 1000),
      ],
    );
    return rows.length > 0;
  } catch (err) {
    logger.warn({ err, kind: input.kind }, "feed publishEvent failed");
    return false;
  }
}

// ── Reactions ────────────────────────────────────────────────────────────────

/** The complete reaction vocabulary, in display order. */
export const REACTION_KEYS = [
  "rocket", // 🚀 Bullish / Moon
  "fire", // 🔥 Hot Trade
  "gem", // 💎 Conviction
  "brain", // 🧠 Smart / Great Analysis
  "clap", // 👏 Congrats
  "eyes", // 👀 Watching
  "moneybag", // 💰 Nice Profit
  "flag", // 🚩 Red Flag
  "poop", // 💩 Bad Call
  "target", // 🎯 Accurate Call
  "raise", // 🙌 Respect / Big Win
  "salute", // 🫡 Salute
  "thinking", // 🤔 Thinking / Not Sure
  "heart", // ❤️ Love
  "thumbs_up", // 👍 Agree
  "thumbs_down", // 👎 Disagree
] as const;

export type ReactionKey = (typeof REACTION_KEYS)[number];

export function isReactionKey(v: string): v is ReactionKey {
  return (REACTION_KEYS as readonly string[]).includes(v);
}

/**
 * Set or clear the viewer's reaction on a feed item. One reaction per user
 * per event — a new reaction replaces the previous one; null removes it.
 */
export async function setReaction(
  eventId: string,
  userId: number,
  reaction: ReactionKey | null,
): Promise<void> {
  await ensureFeedSchema();
  if (reaction === null) {
    await dbRun(
      `DELETE FROM feed_reactions WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId],
    );
    return;
  }
  await dbRun(
    `INSERT INTO feed_reactions (event_id, user_id, reaction, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (event_id, user_id)
     DO UPDATE SET reaction = EXCLUDED.reaction, created_at = EXCLUDED.created_at`,
    [eventId, userId, reaction, Math.floor(Date.now() / 1000)],
  );
}

export interface EventReactions {
  /** reaction key → count, only keys with count > 0. */
  counts: Record<string, number>;
  /** The viewer's own reaction, if any. */
  viewerReaction: string | null;
}

/**
 * Batch-load reaction summaries for a page of feed items. One query for
 * counts, one for the viewer's own reactions.
 */
export async function getReactionsForEvents(
  eventIds: string[],
  viewerUserId: number | null,
): Promise<Map<string, EventReactions>> {
  const out = new Map<string, EventReactions>();
  if (eventIds.length === 0) return out;
  await ensureFeedSchema();

  const countRows = await dbAll<{
    event_id: string;
    reaction: string;
    n: number;
  }>(
    `SELECT event_id, reaction, COUNT(*)::int AS n
       FROM feed_reactions
      WHERE event_id = ANY($1::text[])
      GROUP BY event_id, reaction`,
    [eventIds],
  );
  for (const r of countRows) {
    let entry = out.get(r.event_id);
    if (!entry) {
      entry = { counts: {}, viewerReaction: null };
      out.set(r.event_id, entry);
    }
    entry.counts[r.reaction] = r.n;
  }

  if (viewerUserId != null) {
    const mineRows = await dbAll<{ event_id: string; reaction: string }>(
      `SELECT event_id, reaction
         FROM feed_reactions
        WHERE event_id = ANY($1::text[]) AND user_id = $2`,
      [eventIds, viewerUserId],
    );
    for (const r of mineRows) {
      let entry = out.get(r.event_id);
      if (!entry) {
        entry = { counts: {}, viewerReaction: null };
        out.set(r.event_id, entry);
      }
      entry.viewerReaction = r.reaction;
    }
  }
  return out;
}

// Milestone publishers moved to lib/activity/publishers.ts (the Activity Layer
// router). Import { publishTierMilestone, publishFollowerMilestone,
// recordActivity } from "./activity/publishers.js".
