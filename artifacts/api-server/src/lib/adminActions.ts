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
