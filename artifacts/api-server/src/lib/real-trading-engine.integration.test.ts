import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * DB-backed regression coverage for the production ghost-position bug.
 *
 * The wallet no longer held ANSEM, yet "OPEN POSITIONS (1) ANSEM" rendered.
 * Root cause: a legacy snapshot (written before live-balance reconciliation)
 * had holdings_verified=true and stored raw FIFO leftovers as open positions,
 * and getCachedAnalysis replayed them. These tests prove getCachedAnalysis:
 *   1. NEVER serves a legacy snapshot (no reconciliation_json) - forces recompute.
 *   2. Only returns positions the per-mint reconciliation confirms are held.
 *   3. Keeps wallets isolated.
 *
 * Runs when DATABASE_URL is present, SKIPS with a reason otherwise.
 */

const HAS_DB = !!process.env.DATABASE_URL;
const SKIP_REASON =
  "DATABASE_URL not set - real-trading engine integration requires a test database.";

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(`[real-trading-engine.integration] SKIPPED: ${SKIP_REASON}`);
}

type DB = typeof import("./database.js");
type Schema = typeof import("./real-trading-schema.js");
type Engine = typeof import("./real-trading-engine.js");

const ANSEM = "ANSEMmintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const CASHDOG = "CASHDOGmintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

describe.skipIf(!HAS_DB)("getCachedAnalysis - ghost/legacy safety (DB-backed)", () => {
  let db: DB;
  let schema: Schema;
  let engine: Engine;

  const rand = Math.random().toString(36).slice(2, 8);
  const walletA = `A${rand}`.padEnd(44, "1");
  const walletB = `B${rand}`.padEnd(44, "2");

  const ansemPos = {
    tokenMint: ANSEM,
    symbol: "ANSEM",
    name: "Ansem",
    logo: null,
    tokenAmount: 2900,
    costBasisSol: 10.16,
    avgEntryPriceSol: 10.16 / 2900,
    firstAcquiredAt: 0,
    currentPriceSol: 10.14 / 2900,
    currentValueSol: 10.14,
    unrealizedPnlSol: -0.02,
    marketCapUsd: null,
  };

  async function upsertSnapshot(
    wallet: string,
    opts: {
      holdingsVerified: boolean;
      openPositions: unknown[];
      reconciliation: unknown[] | null;
    },
  ) {
    await db.dbRun(
      `INSERT INTO real_analysis_snapshots
         (wallet, computed_at, metrics_json, scores_json, open_positions_json,
          holdings_verified, reconciliation_json, sync_trade_count)
       VALUES ($1, $2, '{}', '{}', $3, $4, $5, 20)
       ON CONFLICT (wallet) DO UPDATE SET
         computed_at = EXCLUDED.computed_at,
         open_positions_json = EXCLUDED.open_positions_json,
         holdings_verified = EXCLUDED.holdings_verified,
         reconciliation_json = EXCLUDED.reconciliation_json`,
      [
        wallet,
        Math.floor(Date.now() / 1000),
        JSON.stringify(opts.openPositions),
        opts.holdingsVerified,
        opts.reconciliation == null
          ? null
          : JSON.stringify(opts.reconciliation),
      ],
    );
  }

  beforeAll(async () => {
    db = await import("./database.js");
    schema = await import("./real-trading-schema.js");
    engine = await import("./real-trading-engine.js");
    await schema.ensureRealTradingSchema();
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    await db.dbRun(`DELETE FROM real_analysis_snapshots WHERE wallet = ANY($1)`, [
      [walletA, walletB],
    ]);
  });

  it("refuses a LEGACY snapshot (no reconciliation_json) so it is recomputed", async () => {
    // Exactly the production shape: verified=true, ANSEM stored, no reconciliation.
    await upsertSnapshot(walletA, {
      holdingsVerified: true,
      openPositions: [ansemPos],
      reconciliation: null,
    });
    const cached = await engine.getCachedAnalysis(walletA);
    expect(cached).toBeNull();
  });

  it("drops a ghost position that reconciliation says is gone", async () => {
    await upsertSnapshot(walletA, {
      holdingsVerified: true,
      openPositions: [ansemPos],
      reconciliation: [
        {
          mint: ANSEM,
          historyQuantity: 2900,
          liveQuantity: 0,
          reconciledQuantity: 0,
          reason: "Live balance is zero",
          droppedAsGhost: true,
          includedInOpenPositions: false,
          includedInAnalyzed: false,
        },
      ],
    });
    const cached = await engine.getCachedAnalysis(walletA);
    expect(cached).not.toBeNull();
    expect(cached!.holdingsVerified).toBe(true);
    expect(cached!.openPositions).toHaveLength(0);
  });

  it("keeps a genuinely held position confirmed by reconciliation", async () => {
    await upsertSnapshot(walletA, {
      holdingsVerified: true,
      openPositions: [{ ...ansemPos, tokenMint: CASHDOG, symbol: "CashDog" }],
      reconciliation: [
        {
          mint: CASHDOG,
          historyQuantity: 2900,
          liveQuantity: 2900,
          reconciledQuantity: 2900,
          reason: "Fully held on-chain",
          droppedAsGhost: false,
          includedInOpenPositions: true,
          includedInAnalyzed: true,
        },
      ],
    });
    const cached = await engine.getCachedAnalysis(walletA);
    expect(cached!.openPositions.map((p) => p.tokenMint)).toEqual([CASHDOG]);
  });

  it("does not leak wallet A positions into wallet B", async () => {
    await upsertSnapshot(walletA, {
      holdingsVerified: true,
      openPositions: [{ ...ansemPos, tokenMint: CASHDOG, symbol: "CashDog" }],
      reconciliation: [
        {
          mint: CASHDOG,
          historyQuantity: 2900,
          liveQuantity: 2900,
          reconciledQuantity: 2900,
          reason: "Fully held on-chain",
          droppedAsGhost: false,
          includedInOpenPositions: true,
          includedInAnalyzed: true,
        },
      ],
    });
    // walletB has an empty verified snapshot.
    await upsertSnapshot(walletB, {
      holdingsVerified: true,
      openPositions: [],
      reconciliation: [],
    });
    const b = await engine.getCachedAnalysis(walletB);
    expect(b!.wallet).toBe(walletB);
    expect(b!.openPositions).toHaveLength(0);
  });
});
