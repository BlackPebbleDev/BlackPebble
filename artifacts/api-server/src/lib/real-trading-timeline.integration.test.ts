import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * DB-backed regression coverage for the duplicated Evolution milestones bug.
 *
 * Production showed "Consistency improved", "Timing improved" etc. twice, all
 * stamped "1m ago" - because check-then-insert raced across concurrent refresh
 * paths and each insert got a fresh timestamp. These tests prove:
 *   1. A repeated refresh is idempotent (no second row).
 *   2. Concurrent refreshes cannot both insert (DB unique index).
 *   3. A genuinely new threshold IS allowed exactly once.
 *   4. getTimeline collapses legacy duplicate rows to the EARLIEST timestamp.
 *
 * Runs when DATABASE_URL is present, SKIPS with a reason otherwise.
 */

const HAS_DB = !!process.env.DATABASE_URL;
const SKIP_REASON =
  "DATABASE_URL not set - timeline dedup integration requires a test database.";

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(`[real-trading-timeline.integration] SKIPPED: ${SKIP_REASON}`);
}

type DB = typeof import("./database.js");
type Schema = typeof import("./real-trading-schema.js");
type Timeline = typeof import("./real-trading-timeline.js");
type Dna = import("./real-trading-dna.js").TraderDna;

function fakeDna(over: Partial<Dna> = {}): Dna {
  return {
    vector: {},
    primaryArchetype: "sniper",
    primaryLabel: "Sniper",
    primaryDescription: "",
    secondaryArchetype: null,
    secondaryLabel: null,
    confidence: 0.8,
    evolvedTraits: [],
    archetypeChanged: false,
    version: 1,
    ...over,
  } as Dna;
}

describe.skipIf(!HAS_DB)("timeline milestone dedup (DB-backed)", () => {
  let db: DB;
  let schema: Schema;
  let timeline: Timeline;

  const rand = Math.random().toString(36).slice(2, 8);
  const wallet = `T${rand}`.padEnd(44, "9");

  async function countByType(type: string): Promise<number> {
    const rows = await db.dbAll<{ id: number }>(
      `SELECT id FROM real_timeline_events WHERE wallet = $1 AND event_type = $2`,
      [wallet, type],
    );
    return rows.length;
  }

  const baseCtx = () => ({
    wallet,
    userId: null,
    isFirstAnalysis: true,
    tradeCount: 120,
    previousTradeCount: 0,
    signals: [],
    dna: fakeDna(),
    walletHealthScore: 50,
    previousWalletHealthScore: null,
    largestGainSol: 0,
    previousLargestGainSol: null,
  });

  beforeAll(async () => {
    db = await import("./database.js");
    schema = await import("./real-trading-schema.js");
    timeline = await import("./real-trading-timeline.js");
    await schema.ensureRealTradingSchema();
    await db.dbRun(`DELETE FROM real_timeline_events WHERE wallet = $1`, [wallet]);
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    await db.dbRun(`DELETE FROM real_timeline_events WHERE wallet = $1`, [wallet]);
  });

  it("is idempotent across repeated refreshes", async () => {
    await timeline.emitTimelineEvents(baseCtx());
    await timeline.emitTimelineEvents({ ...baseCtx(), isFirstAnalysis: false });
    await timeline.emitTimelineEvents({ ...baseCtx(), isFirstAnalysis: false });
    expect(await countByType("verified_wallet_connected")).toBe(1);
    expect(await countByType("milestone_trades")).toBe(1);
  });

  it("cannot double-insert under concurrent refreshes", async () => {
    await db.dbRun(`DELETE FROM real_timeline_events WHERE wallet = $1`, [wallet]);
    await Promise.all([
      timeline.emitTimelineEvents(baseCtx()),
      timeline.emitTimelineEvents(baseCtx()),
      timeline.emitTimelineEvents(baseCtx()),
    ]);
    expect(await countByType("verified_wallet_connected")).toBe(1);
    expect(await countByType("milestone_trades")).toBe(1);
  });

  it("allows a genuinely new trade-count threshold exactly once", async () => {
    // Cross the 250 milestone on a later run; 100 already fired above.
    await timeline.emitTimelineEvents({
      ...baseCtx(),
      isFirstAnalysis: false,
      previousTradeCount: 120,
      tradeCount: 300,
    });
    expect(await countByType("milestone_trades")).toBe(2); // 100 + 250
  });

  it("collapses legacy duplicate rows to the earliest timestamp on read", async () => {
    await db.dbRun(`DELETE FROM real_timeline_events WHERE wallet = $1`, [wallet]);
    // Two legacy rows (dedup_key NULL), identical identity, different times.
    await db.dbRun(
      `INSERT INTO real_timeline_events
         (wallet, user_id, event_type, title, body, meta_json, visibility, created_at, dedup_key)
       VALUES ($1, NULL, 'signal_improved', 'Consistency improved', 'Up 10 points over the last month.', '{"signal":"consistency"}', 'public', $2, NULL),
              ($1, NULL, 'signal_improved', 'Consistency improved', 'Up 10 points over the last month.', '{"signal":"consistency"}', 'public', $3, NULL)`,
      [wallet, 1000, 5000],
    );
    const events = await timeline.getTimeline(wallet, 20);
    const consistency = events.filter((e) => e.title === "Consistency improved");
    expect(consistency).toHaveLength(1);
    expect(consistency[0]!.createdAt).toBe(1000); // earliest kept
  });
});
