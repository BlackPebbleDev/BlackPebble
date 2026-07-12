import type pg from "pg";
import { randomUUID } from "node:crypto";
import { dbRun, withTx } from "./database.js";
import { STARTING_BALANCE } from "./trading.js";
import { logger } from "./logger.js";

/**
 * Granular, admin-only paper-trading resets.
 *
 * Every destructive action snapshots the affected rows BEFORE deleting, and
 * records an audit row. Identity tables (users, user_identities) are never
 * touched, and the watchlist is preserved unless `clearWatchlist` is requested.
 *
 * Backups are stored as JSONB row snapshots in one committed table
 * (`reset_backup_snapshots`) via a parameterized `INSERT ... SELECT to_jsonb`.
 * This deliberately avoids the previous design's runtime DDL (CREATE SCHEMA /
 * CREATE TABLE AS) and dynamic table identifiers derived from the account key -
 * an X account key like `x:1969109385461858304` contains a colon and must never
 * be interpolated into a SQL identifier. No DDL runs inside the reset
 * transaction; the backup table is ensured once, up front.
 */
export interface ResetOptions {
  /** Reset cash to 100 SOL + clear streak, bump season, set last_reset_at. */
  resetBalance?: boolean;
  clearPositions?: boolean;
  clearOrders?: boolean;
  clearTrades?: boolean;
  /** Clear leaderboard snapshots, competition results and participation. */
  resetLeaderboard?: boolean;
  /** Only when explicitly opted in. */
  clearWatchlist?: boolean;
  /** Clear paper leverage positions + trades (separate from spot). */
  clearLeverage?: boolean;
}

export interface ResetResult {
  ok: boolean;
  scope: "user" | "all";
  wallet?: string;
  applied: string[];
  backupSchema: string;
  backups: Record<string, { table: string; rows: number }>;
  deleted: Record<string, number>;
  accountsReset: number;
  /** Correlation id shared across logs + the API response. */
  correlationId: string;
  /** Unique id for this reset operation (ties backup snapshots together). */
  resetOpId: string;
}

type Client = pg.PoolClient;

const RESET_LOCK_KEY = 908070606;

/** Error that carries the pipeline stage at which a reset failed. */
export class ResetStageError extends Error {
  stage: string;
  constructor(stage: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "ResetStageError";
    this.stage = stage;
    if (cause instanceof Error && cause.stack) this.stack = cause.stack;
  }
}

interface ResetContext {
  correlationId?: string;
}

/**
 * Ensure the committed backup + audit tables exist. Plain `CREATE TABLE IF NOT
 * EXISTS` in the public schema - the exact idempotent pattern every other table
 * in the app uses successfully in production. Runs OUTSIDE the reset
 * transaction so the transaction itself performs zero DDL.
 */
export async function ensureResetInfra(): Promise<void> {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS reset_backup_snapshots (
      id serial PRIMARY KEY,
      reset_op_id text NOT NULL,
      correlation_id text,
      scope text NOT NULL,
      target_account_key text,
      source_table text NOT NULL,
      row_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_reset_backup_op ON reset_backup_snapshots (reset_op_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_reset_backup_account ON reset_backup_snapshots (target_account_key)`,
  );
  await dbRun(`
    CREATE TABLE IF NOT EXISTS reset_audit (
      id serial PRIMARY KEY,
      performed_at timestamptz NOT NULL DEFAULT now(),
      summary jsonb NOT NULL
    )
  `);
}

interface BackupCtx {
  opId: string;
  correlationId: string;
  scope: "user" | "all";
  accountKey: string | null;
}

/**
 * Snapshot the rows a query will affect into `reset_backup_snapshots`, then run
 * the destructive delete. `where`/`params` scope both to the same rows. The
 * source table name is a static string from our own code (never user input) so
 * quoting it is safe; the account key is only ever passed as a bound value.
 */
async function backupAndDelete(
  c: Client,
  table: string,
  where: string,
  params: unknown[],
  ctx: BackupCtx,
  backups: Record<string, { table: string; rows: number }>,
  deleted: Record<string, number>,
): Promise<void> {
  // Append the fixed metadata AFTER the where params so the caller-supplied
  // placeholders ($1..$N inside `where`) never need renumbering.
  const n = params.length;
  const meta = [
    ctx.opId,
    ctx.correlationId,
    ctx.scope,
    ctx.accountKey,
    table,
  ];
  const ins = await c.query(
    `INSERT INTO reset_backup_snapshots
       (reset_op_id, correlation_id, scope, target_account_key, source_table, row_json)
     SELECT $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, to_jsonb(t.*)
       FROM "${table}" t
      WHERE ${where}`,
    [...params, ...meta],
  );
  backups[table] = {
    table: "reset_backup_snapshots",
    rows: ins.rowCount ?? 0,
  };
  const del = await c.query(`DELETE FROM "${table}" WHERE ${where}`, params);
  deleted[table] = del.rowCount ?? 0;
}

export async function adminReset(
  scope: "user" | "all",
  wallet: string | null,
  options: ResetOptions,
  ctx: ResetContext = {},
): Promise<ResetResult> {
  if (scope === "user" && !wallet) {
    throw new Error("wallet is required for a single-user reset");
  }
  const correlationId = ctx.correlationId ?? randomUUID();
  const opId = randomUUID();
  const where = scope === "user" ? "wallet = $1" : "true";
  const params = scope === "user" ? [wallet] : [];
  const bctx: BackupCtx = { opId, correlationId, scope, accountKey: wallet };

  const applied: string[] = [];
  const backups: Record<string, { table: string; rows: number }> = {};
  const deleted: Record<string, number> = {};

  let stage = "request_received";
  const enter = (s: string, extra: Record<string, unknown> = {}) => {
    stage = s;
    logger.info(
      { correlationId, opId, stage: s, scope, accountKey: wallet, ...extra },
      "admin reset stage",
    );
  };

  try {
    enter("payload_validated");
    // No DDL inside the transaction: ensure the committed backup table first.
    await ensureResetInfra();
    enter("backup_infra_ready");

    const accountsReset = await withTx(async (c) => {
      enter("transaction_started");
      await c.query(`SELECT pg_advisory_xact_lock($1)`, [RESET_LOCK_KEY]);
      enter("advisory_lock_acquired");

      if (options.clearOrders) {
        enter("orders_backup");
        await backupAndDelete(c, "paper_orders", where, params, bctx, backups, deleted);
        applied.push("clearOrders");
        enter("orders_cleared", { rows: deleted["paper_orders"] });
      }
      if (options.clearPositions) {
        enter("positions_backup");
        await backupAndDelete(c, "positions", where, params, bctx, backups, deleted);
        applied.push("clearPositions");
        enter("positions_cleared", { rows: deleted["positions"] });
      }
      if (options.clearTrades) {
        enter("trades_backup");
        await backupAndDelete(c, "trades", where, params, bctx, backups, deleted);
        await backupAndDelete(c, "portfolio_snapshots", where, params, bctx, backups, deleted);
        applied.push("clearTrades");
        enter("trades_cleared", { rows: deleted["trades"] });
      }
      if (options.resetLeaderboard) {
        enter("leaderboard_backup");
        await backupAndDelete(c, "leaderboard_snapshots", where, params, bctx, backups, deleted);
        await backupAndDelete(c, "participation_metrics", where, params, bctx, backups, deleted);
        if (scope === "all") {
          await backupAndDelete(c, "competition_results", "true", [], bctx, backups, deleted);
          await backupAndDelete(c, "competitions", "true", [], bctx, backups, deleted);
        }
        applied.push("resetLeaderboard");
        enter("leaderboard_cleared");
      }
      if (options.clearWatchlist) {
        enter("watchlist_backup");
        await backupAndDelete(c, "watchlist", where, params, bctx, backups, deleted);
        applied.push("clearWatchlist");
        enter("watchlist_cleared", { rows: deleted["watchlist"] });
      }
      if (options.clearLeverage) {
        enter("leverage_backup");
        await backupAndDelete(c, "paper_leverage_positions", where, params, bctx, backups, deleted);
        await backupAndDelete(c, "paper_leverage_trades", where, params, bctx, backups, deleted);
        applied.push("clearLeverage");
        enter("leverage_cleared");
      }

      let reset = 0;
      if (options.resetBalance) {
        enter("balance_backup");
        // accounts is UPDATEd (not deleted), so snapshot it explicitly, then
        // update in place. Same parameterized JSONB-snapshot approach.
        const n = params.length;
        const accSnap = await c.query(
          `INSERT INTO reset_backup_snapshots
             (reset_op_id, correlation_id, scope, target_account_key, source_table, row_json)
           SELECT $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, 'accounts', to_jsonb(a.*)
             FROM "accounts" a WHERE ${where}`,
          [...params, opId, correlationId, scope, wallet],
        );
        backups["accounts"] = {
          table: "reset_backup_snapshots",
          rows: accSnap.rowCount ?? 0,
        };
        const upd = await c.query(
          `UPDATE accounts SET
             paper_balance = $${scope === "user" ? 2 : 1},
             total_trades = 0,
             winning_trades = 0,
             total_pnl = 0,
             realized_pnl = 0,
             best_trade = 0,
             worst_trade = 0,
             current_streak = 0,
             participation_points = 0,
             season = COALESCE(season, 1) + 1,
             last_reset_at = EXTRACT(EPOCH FROM NOW())::bigint
           WHERE ${where}`,
          scope === "user" ? [wallet, STARTING_BALANCE] : [STARTING_BALANCE],
        );
        reset = upd.rowCount ?? 0;
        applied.push("resetBalance");
        enter("balance_reset", { accountsReset: reset });
      }

      enter("audit_ledger_write");
      await c.query(`INSERT INTO reset_audit (summary) VALUES ($1)`, [
        JSON.stringify({
          scope,
          wallet,
          opId,
          correlationId,
          applied,
          backups,
          deleted,
          accountsReset: reset,
        }),
      ]);
      return reset;
    });

    enter("transaction_committed", { accountsReset });
    logger.info(
      { correlationId, opId, scope, wallet, applied },
      "Admin reset completed",
    );
    return {
      ok: true,
      scope,
      wallet: wallet ?? undefined,
      applied,
      backupSchema: "reset_backup_snapshots",
      backups,
      deleted,
      accountsReset,
      correlationId,
      resetOpId: opId,
    };
  } catch (err) {
    logger.error(
      { correlationId, opId, stage, scope, accountKey: wallet, err },
      "Admin reset failed",
    );
    throw new ResetStageError(stage, err);
  }
}

export interface SocialResetResult {
  ok: boolean;
  kind: "social" | "journal" | "test-data" | "full";
  backupSchema: string;
  backups: Record<string, { table: string; rows: number }>;
  deleted: Record<string, number>;
  correlationId: string;
  resetOpId: string;
}

/**
 * Run a sequence of backup-then-delete steps inside a single transaction with an
 * advisory lock + audit row. Each step is `[table, where, params]`; the order is
 * respected so child rows (FKs) can be deleted before their parents.
 */
async function runBackupDeletes(
  kind: SocialResetResult["kind"],
  steps: Array<[string, string, unknown[]]>,
): Promise<SocialResetResult> {
  const correlationId = randomUUID();
  const opId = randomUUID();
  const bctx: BackupCtx = { opId, correlationId, scope: "all", accountKey: null };
  const backups: Record<string, { table: string; rows: number }> = {};
  const deleted: Record<string, number> = {};
  let stage = "request_received";
  try {
    await ensureResetInfra();
    await withTx(async (c) => {
      await c.query(`SELECT pg_advisory_xact_lock($1)`, [RESET_LOCK_KEY]);
      for (const [table, where, params] of steps) {
        stage = `backup_${table}`;
        await backupAndDelete(c, table, where, params, bctx, backups, deleted);
      }
      stage = "audit_ledger_write";
      await c.query(`INSERT INTO reset_audit (summary) VALUES ($1)`, [
        JSON.stringify({ kind, opId, correlationId, backups, deleted }),
      ]);
    });
    logger.info({ kind, opId, correlationId, deleted }, "Admin social reset completed");
    return {
      ok: true,
      kind,
      backupSchema: "reset_backup_snapshots",
      backups,
      deleted,
      correlationId,
      resetOpId: opId,
    };
  } catch (err) {
    logger.error({ kind, opId, correlationId, stage, err }, "Admin social reset failed");
    throw new ResetStageError(stage, err);
  }
}

/**
 * Wipe ALL social content (callouts + their update trail + standalone theses +
 * the follow graph). Trading/leverage/portfolio/leaderboard data and identities
 * are untouched.
 */
export function resetSocial(): Promise<SocialResetResult> {
  return runBackupDeletes("social", [
    ["callout_updates", "true", []],
    ["callouts", "true", []],
    ["token_theses", "true", []],
    ["user_follows", "true", []],
  ]);
}

/** Admin-only hard delete of a single callout (+ its update trail), with
 * backup. Normal users can never delete a callout; this is an admin override for
 * spam/test cleanup only. */
export function deleteCalloutAdmin(id: number): Promise<SocialResetResult> {
  return runBackupDeletes("social", [
    ["callout_updates", "callout_id = $1", [id]],
    ["callouts", "id = $1", [id]],
  ]);
}

/** Admin-only hard delete of a single thesis, with backup. */
export function deleteThesisAdmin(id: number): Promise<SocialResetResult> {
  return runBackupDeletes("social", [["token_theses", "id = $1", [id]]]);
}

/** Wipe ALL journal entries (private trade reflections). */
export function resetJournal(): Promise<SocialResetResult> {
  return runBackupDeletes("journal", [["journal_entries", "true", []]]);
}

/**
 * Purge only rows tagged is_test across social + journal. callout_updates for a
 * test callout are removed first to respect the FK.
 */
export function resetTestData(): Promise<SocialResetResult> {
  return runBackupDeletes("test-data", [
    [
      "callout_updates",
      "callout_id IN (SELECT id FROM callouts WHERE is_test = TRUE)",
      [],
    ],
    ["callouts", "is_test = TRUE", []],
    ["token_theses", "is_test = TRUE", []],
    ["journal_entries", "is_test = TRUE", []],
  ]);
}

/**
 * Nuclear reset: trading + social + journal + analytics. Identity tables (users,
 * user_identities), feature flags and other config are deliberately preserved so
 * the app stays usable and admins keep their access. Each layer is backed up.
 */
export async function fullReset(): Promise<{
  ok: boolean;
  trading: ResetResult;
  social: SocialResetResult;
  journal: SocialResetResult;
  analytics: SocialResetResult;
}> {
  const trading = await adminReset("all", null, {
    resetBalance: true,
    clearPositions: true,
    clearOrders: true,
    clearTrades: true,
    resetLeaderboard: true,
    clearWatchlist: true,
    clearLeverage: true,
  });
  const social = await resetSocial();
  const journal = await resetJournal();
  const analytics = await runBackupDeletes("full", [
    ["analytics_events", "true", []],
  ]);
  return { ok: true, trading, social, journal, analytics };
}
