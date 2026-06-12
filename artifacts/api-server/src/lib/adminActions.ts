import type pg from "pg";
import { withTx } from "./database.js";
import { STARTING_BALANCE } from "./trading.js";
import { logger } from "./logger.js";

/**
 * Granular, admin-only paper-trading resets.
 *
 * Every destructive action snapshots the affected rows into a timestamped table
 * inside the `reset_backups` schema BEFORE deleting (the same recovery pattern
 * as the one-time pre-launch reset), and records an audit row. Identity tables
 * (users, user_identities) are never touched, and the watchlist is preserved
 * unless `clearWatchlist` is explicitly requested.
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
}

type Client = pg.PoolClient;

const RESET_LOCK_KEY = 908070606;

function stamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "_");
}

/** Make a wallet safe to embed in a backup table identifier. */
function walletTag(wallet: string): string {
  return wallet.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || "user";
}

async function ensureBackupSchema(c: Client): Promise<void> {
  await c.query(`CREATE SCHEMA IF NOT EXISTS "reset_backups"`);
  await c.query(`
    CREATE TABLE IF NOT EXISTS reset_audit (
      id serial PRIMARY KEY,
      performed_at timestamptz NOT NULL DEFAULT now(),
      summary jsonb NOT NULL
    )
  `);
}

/**
 * Back up the rows a query will affect, then run the destructive statement.
 * `where`/`params` scope both the backup copy and the delete to the same rows.
 */
async function backupAndDelete(
  c: Client,
  table: string,
  where: string,
  params: unknown[],
  s: string,
  tag: string,
  backups: Record<string, { table: string; rows: number }>,
  deleted: Record<string, number>,
): Promise<void> {
  const backupTable = `${table}_${tag}_${s}`;
  await c.query(
    `CREATE TABLE "reset_backups"."${backupTable}" AS SELECT * FROM "${table}" WHERE ${where}`,
    params,
  );
  const cnt = await c.query(
    `SELECT count(*)::int AS n FROM "reset_backups"."${backupTable}"`,
  );
  backups[table] = {
    table: `reset_backups.${backupTable}`,
    rows: cnt.rows[0]?.n ?? 0,
  };
  const del = await c.query(`DELETE FROM "${table}" WHERE ${where}`, params);
  deleted[table] = del.rowCount ?? 0;
}

export async function adminReset(
  scope: "user" | "all",
  wallet: string | null,
  options: ResetOptions,
): Promise<ResetResult> {
  if (scope === "user" && !wallet) {
    throw new Error("wallet is required for a single-user reset");
  }
  const s = stamp();
  const tag = scope === "user" ? walletTag(wallet!) : "all";
  const where = scope === "user" ? "wallet = $1" : "true";
  const params = scope === "user" ? [wallet] : [];

  const applied: string[] = [];
  const backups: Record<string, { table: string; rows: number }> = {};
  const deleted: Record<string, number> = {};

  const accountsReset = await withTx(async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock($1)`, [RESET_LOCK_KEY]);
    await ensureBackupSchema(c);

    if (options.clearOrders) {
      await backupAndDelete(c, "paper_orders", where, params, s, tag, backups, deleted);
      applied.push("clearOrders");
    }
    if (options.clearPositions) {
      await backupAndDelete(c, "positions", where, params, s, tag, backups, deleted);
      applied.push("clearPositions");
    }
    if (options.clearTrades) {
      await backupAndDelete(c, "trades", where, params, s, tag, backups, deleted);
      await backupAndDelete(c, "portfolio_snapshots", where, params, s, tag, backups, deleted);
      applied.push("clearTrades");
    }
    if (options.resetLeaderboard) {
      await backupAndDelete(c, "leaderboard_snapshots", where, params, s, tag, backups, deleted);
      await backupAndDelete(c, "participation_metrics", where, params, s, tag, backups, deleted);
      if (scope === "all") {
        await backupAndDelete(c, "competition_results", "true", [], s, tag, backups, deleted);
        await backupAndDelete(c, "competitions", "true", [], s, tag, backups, deleted);
      }
      applied.push("resetLeaderboard");
    }
    if (options.clearWatchlist) {
      await backupAndDelete(c, "watchlist", where, params, s, tag, backups, deleted);
      applied.push("clearWatchlist");
    }
    if (options.clearLeverage) {
      await backupAndDelete(c, "paper_leverage_positions", where, params, s, tag, backups, deleted);
      await backupAndDelete(c, "paper_leverage_trades", where, params, s, tag, backups, deleted);
      applied.push("clearLeverage");
    }

    let reset = 0;
    if (options.resetBalance) {
      // Snapshot accounts before the in-place reset so it can be recovered too.
      const backupTable = `accounts_${tag}_${s}`;
      await c.query(
        `CREATE TABLE "reset_backups"."${backupTable}" AS SELECT * FROM "accounts" WHERE ${where}`,
        params,
      );
      backups["accounts"] = {
        table: `reset_backups.${backupTable}`,
        rows: (
          await c.query(
            `SELECT count(*)::int AS n FROM "reset_backups"."${backupTable}"`,
          )
        ).rows[0]?.n ?? 0,
      };
      const upd = await c.query(
        `UPDATE accounts SET
           paper_balance = $1,
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
        scope === "user" ? [STARTING_BALANCE, wallet] : [STARTING_BALANCE],
      );
      reset = upd.rowCount ?? 0;
      applied.push("resetBalance");
    }

    await c.query(`INSERT INTO reset_audit (summary) VALUES ($1)`, [
      JSON.stringify({ scope, wallet, applied, backups, deleted, accountsReset: reset }),
    ]);
    return reset;
  });

  logger.info({ scope, wallet, applied }, "Admin reset completed");
  return {
    ok: true,
    scope,
    wallet: wallet ?? undefined,
    applied,
    backupSchema: "reset_backups",
    backups,
    deleted,
    accountsReset,
  };
}

export interface SocialResetResult {
  ok: boolean;
  kind: "social" | "journal" | "test-data" | "full";
  backupSchema: string;
  backups: Record<string, { table: string; rows: number }>;
  deleted: Record<string, number>;
}

/**
 * Run a sequence of backup-then-delete steps inside a single transaction with an
 * advisory lock + audit row. Each step is `[table, where, params]`; the order is
 * respected so child rows (FKs) can be deleted before their parents.
 */
async function runBackupDeletes(
  kind: SocialResetResult["kind"],
  tag: string,
  steps: Array<[string, string, unknown[]]>,
): Promise<SocialResetResult> {
  const s = stamp();
  const backups: Record<string, { table: string; rows: number }> = {};
  const deleted: Record<string, number> = {};
  await withTx(async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock($1)`, [RESET_LOCK_KEY]);
    await ensureBackupSchema(c);
    for (const [table, where, params] of steps) {
      await backupAndDelete(c, table, where, params, s, tag, backups, deleted);
    }
    await c.query(`INSERT INTO reset_audit (summary) VALUES ($1)`, [
      JSON.stringify({ kind, backups, deleted }),
    ]);
  });
  logger.info({ kind, deleted }, "Admin social reset completed");
  return { ok: true, kind, backupSchema: "reset_backups", backups, deleted };
}

/**
 * Wipe ALL social content (callouts + their update trail + standalone theses +
 * the follow graph). Trading/leverage/portfolio/leaderboard data and identities
 * are untouched.
 */
export function resetSocial(): Promise<SocialResetResult> {
  return runBackupDeletes("social", "social", [
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
  return runBackupDeletes("social", `callout${id}`, [
    ["callout_updates", "callout_id = $1", [id]],
    ["callouts", "id = $1", [id]],
  ]);
}

/** Admin-only hard delete of a single thesis, with backup. */
export function deleteThesisAdmin(id: number): Promise<SocialResetResult> {
  return runBackupDeletes("social", `thesis${id}`, [
    ["token_theses", "id = $1", [id]],
  ]);
}

/** Wipe ALL journal entries (private trade reflections). */
export function resetJournal(): Promise<SocialResetResult> {
  return runBackupDeletes("journal", "journal", [
    ["journal_entries", "true", []],
  ]);
}

/**
 * Purge only rows tagged is_test across social + journal. callout_updates for a
 * test callout are removed first to respect the FK.
 */
export function resetTestData(): Promise<SocialResetResult> {
  return runBackupDeletes("test-data", "test", [
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
  const analytics = await runBackupDeletes("full", "analytics", [
    ["analytics_events", "true", []],
  ]);
  return { ok: true, trading, social, journal, analytics };
}
