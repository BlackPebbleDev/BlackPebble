import { dbRun } from "./database.js";

/**
 * Feed Intelligence schema — the persistent layer for the Activity
 * Intelligence Engine (see docs/FEED_INTELLIGENCE.md).
 *
 * Two tables plus one column:
 *
 *  - feed_events: published milestone events that have no source-of-truth
 *    table (tier promotions, follower milestones, future DNA changes / AI
 *    insights). Everything with a source table keeps deriving cards from it
 *    in the lib/feed.ts UNION.
 *  - feed_reactions: reactions keyed by the feed item's stable string id, so
 *    they attach to any feed item — derived or published — without foreign
 *    keys into seven source tables.
 *  - trades.market_cap_usd: market cap at execution, so aggregated trade
 *    cards can show real "accumulated at $1.2M MC" numbers going forward.
 */

let ensured: Promise<void> | null = null;

export function ensureFeedSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await dbRun(`
      CREATE TABLE IF NOT EXISTS feed_events (
        id             SERIAL PRIMARY KEY,
        actor_user_id  INTEGER NOT NULL,
        kind           TEXT NOT NULL,
        category       TEXT NOT NULL,
        title          TEXT NOT NULL,
        summary        TEXT,
        meta           JSONB,
        visibility     TEXT NOT NULL DEFAULT 'public',
        dedupe_key     TEXT UNIQUE,
        created_at     BIGINT NOT NULL
      )
    `);
    await dbRun(
      `CREATE INDEX IF NOT EXISTS idx_feed_events_created
         ON feed_events (created_at DESC)`,
    );
    await dbRun(
      `CREATE INDEX IF NOT EXISTS idx_feed_events_actor
         ON feed_events (actor_user_id, created_at DESC)`,
    );

    await dbRun(`
      CREATE TABLE IF NOT EXISTS feed_reactions (
        id         SERIAL PRIMARY KEY,
        event_id   TEXT NOT NULL,
        user_id    INTEGER NOT NULL,
        reaction   TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE (event_id, user_id)
      )
    `);
    await dbRun(
      `CREATE INDEX IF NOT EXISTS idx_feed_reactions_event
         ON feed_reactions (event_id)`,
    );

    // Market cap at execution for spot trades (null for pre-upgrade rows).
    await dbRun(
      `ALTER TABLE trades ADD COLUMN IF NOT EXISTS market_cap_usd DOUBLE PRECISION`,
    );
  })();
  return ensured;
}
