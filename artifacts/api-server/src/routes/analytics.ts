import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { dbRun } from "../lib/database.js";

const router: IRouter = Router();

/**
 * Lightweight funnel / activity beacon.
 *
 * Guests live entirely client-side, so a tiny append-only event log is the only
 * way to give the admin dashboard visibility into the guest funnel (created →
 * traded → converted) and page activity. No PII is stored - `anonId` is a
 * random per-device id. The table is created idempotently here so it works in
 * dev and prod without a migration step.
 */
const ALLOWED_EVENTS = new Set([
  "guest_created",
  "guest_first_trade",
  "guest_converted",
  "portfolio_view",
  "leaderboard_view",
  // Guest funnel expansion - first-touch-per-device beacons for the full
  // journey: session → search → token view → first/second trade → X → convert.
  "wallet_search",
  "token_view",
  "guest_second_trade",
  "x_connect",
  // Social layer (Phase 1) - server-side beacons, no PII.
  "feed_view",
  "profile_view",
  "follow_created",
  "follow_removed",
  "feed_tab_changed",
  "x_profile_link_clicked",
  // Theses + admin moderation/reset beacons (no PII).
  "thesis_published",
  "thesis_viewed",
  "thesis_hidden_by_admin",
  "callout_published",
  "callout_hidden_by_admin",
  "test_data_purged",
  "full_reset_executed",
  "social_reset_executed",
  "journal_reset_executed",
]);

let ensured = false;
export async function ensureAnalyticsTable(): Promise<void> {
  if (ensured) return;
  await dbRun(
    `CREATE TABLE IF NOT EXISTS analytics_events (
       id SERIAL PRIMARY KEY,
       event_type TEXT NOT NULL,
       anon_id TEXT,
       created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
     )`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events (event_type)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events (created_at)`,
  );
  ensured = true;
}

router.post(
  "/analytics/event",
  asyncHandler(async (req, res) => {
    const type = String(req.body?.type ?? "");
    const anonId =
      typeof req.body?.anonId === "string"
        ? req.body.anonId.slice(0, 64)
        : null;
    if (!ALLOWED_EVENTS.has(type)) {
      return res.status(400).json({ ok: false, error: "Unknown event type" });
    }
    await ensureAnalyticsTable();
    await dbRun(
      `INSERT INTO analytics_events (event_type, anon_id) VALUES ($1, $2)`,
      [type, anonId],
    );
    return res.json({ ok: true });
  }),
);

export default router;
