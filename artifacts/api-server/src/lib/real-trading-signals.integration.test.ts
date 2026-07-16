import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * DB-backed regression coverage for change-badge integrity.
 *
 * A "↗ 63" badge must only appear when a trustworthy prior baseline exists.
 * These tests prove persistSignalsWithDeltas:
 *   1. Reports "new" (no delta) when there is no prior snapshot.
 *   2. Reports "insufficient_prior" (no delta) when the prior reading was thin.
 *   3. Reports "comparable" with an exact delta when the prior is trustworthy.
 *
 * Runs when DATABASE_URL is present, SKIPS with a reason otherwise.
 */

const HAS_DB = !!process.env.DATABASE_URL;
const SKIP_REASON =
  "DATABASE_URL not set - signal comparison integration requires a test database.";

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(`[real-trading-signals.integration] SKIPPED: ${SKIP_REASON}`);
}

type DB = typeof import("./database.js");
type Schema = typeof import("./real-trading-schema.js");
type Signals = typeof import("./real-trading-signals.js");
type SignalResult = import("./real-trading-signals.js").SignalResult;

function sig(over: Partial<SignalResult> = {}): SignalResult {
  return {
    key: "consistency",
    value: 70,
    confidence: 0.8,
    sampleSize: 20,
    tier: "high",
    evidence: [],
    ...over,
  } as SignalResult;
}

describe.skipIf(!HAS_DB)("persistSignalsWithDeltas - change-badge integrity (DB-backed)", () => {
  let db: DB;
  let schema: Schema;
  let signals: Signals;

  const rand = Math.random().toString(36).slice(2, 8);
  const wallet = `S${rand}`.padEnd(44, "7");
  const DAY = 86400;

  beforeAll(async () => {
    db = await import("./database.js");
    schema = await import("./real-trading-schema.js");
    signals = await import("./real-trading-signals.js");
    await schema.ensureRealTradingSchema();
    await db.dbRun(`DELETE FROM real_signal_values WHERE wallet = $1`, [wallet]);
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    await db.dbRun(`DELETE FROM real_signal_values WHERE wallet = $1`, [wallet]);
  });

  it("reports 'new' on the very first reading (no baseline, no delta)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const [out] = await signals.persistSignalsWithDeltas(
      wallet,
      null,
      [sig({ value: 70 })],
      now,
    );
    expect(out!.comparison.status).toBe("new");
    expect(out!.delta30d).toBeNull();
    expect(out!.direction).toBe("higher_better");
  });

  it("refuses a thin prior baseline (insufficient_prior, no delta)", async () => {
    await db.dbRun(`DELETE FROM real_signal_values WHERE wallet = $1`, [wallet]);
    const now = Math.floor(Date.now() / 1000);
    // Seed a prior reading 30d ago with only 2 samples (below the score minimum).
    await db.dbRun(
      `INSERT INTO real_signal_values (wallet, user_id, signal_key, value, confidence, sample_size, computed_at)
       VALUES ($1, NULL, 'consistency', 5, 0.3, 2, $2)`,
      [wallet, now - 30 * DAY],
    );
    const [out] = await signals.persistSignalsWithDeltas(
      wallet,
      null,
      [sig({ value: 70, sampleSize: 20, tier: "high" })],
      now,
    );
    expect(out!.comparison.status).toBe("insufficient_prior");
    expect(out!.delta30d).toBeNull();
  });

  it("computes an exact delta when the prior baseline is trustworthy", async () => {
    await db.dbRun(`DELETE FROM real_signal_values WHERE wallet = $1`, [wallet]);
    const now = Math.floor(Date.now() / 1000);
    await db.dbRun(
      `INSERT INTO real_signal_values (wallet, user_id, signal_key, value, confidence, sample_size, computed_at)
       VALUES ($1, NULL, 'consistency', 40, 0.8, 25, $2)`,
      [wallet, now - 30 * DAY],
    );
    const [out] = await signals.persistSignalsWithDeltas(
      wallet,
      null,
      [sig({ value: 70, sampleSize: 25, tier: "high" })],
      now,
    );
    expect(out!.comparison.status).toBe("comparable");
    expect(out!.delta30d).toBe(30);
    expect(out!.previousValue).toBe(40);
  });
});
