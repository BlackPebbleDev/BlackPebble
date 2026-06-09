import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { pool, withTx } from "../lib/database.js";
import { STARTING_BALANCE } from "../lib/trading.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// Tables whose every row is paper-trading / performance data and is deleted in
// full by the reset. Order matters:
//   - paper_leverage_trades must come before paper_leverage_positions (child first)
//   - competition_results references competitions, so it is listed first
const TABLES_TO_CLEAR = [
  "paper_leverage_trades",
  "paper_leverage_positions",
  "paper_orders",
  "positions",
  "trades",
  "portfolio_snapshots",
  "leaderboard_snapshots",
  "competition_results",
  "competitions",
  "participation_metrics",
] as const;

// Tables that are snapshotted before the reset runs. Includes accounts because
// its trading columns are reset in place (rows are kept, not deleted).
const TABLES_TO_BACKUP = ["accounts", ...TABLES_TO_CLEAR] as const;

// Tables that are intentionally left untouched (identities, settings, analytics).
const TABLES_PRESERVED = [
  "accounts",
  "users",
  "user_identities",
  "watchlist",
  "token_views",
  "search_activity",
  "utility_usage",
] as const;

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function countRows(
  client: Parameters<Parameters<typeof withTx>[0]>[0],
  table: string,
): Promise<number> {
  const res = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
  return res.rows[0]?.n ?? 0;
}

/**
 * One-time, password-protected pre-launch reset of all paper-trading data.
 *
 * - Requires the `x-admin-token` header to match the ADMIN_RESET_TOKEN secret.
 * - If ADMIN_RESET_TOKEN is unset the route is disabled (503) — deleting the
 *   secret after use turns the endpoint off without a redeploy.
 * - Backs up every affected table into a timestamped `reset_backups` schema
 *   inside the same transaction, then clears trading data and resets account
 *   trading columns to defaults while preserving wallet + graduation_tier.
 * - Pass `{ "dryRun": true }` to get the row counts without modifying anything.
 * - Refuses to run twice unless `{ "force": true }` is passed.
 */
router.post("/admin/reset-paper-trading", async (req: Request, res: Response) => {
  const expected = process.env["ADMIN_RESET_TOKEN"];
  if (!expected) {
    return res
      .status(503)
      .json({ ok: false, error: "Reset endpoint is disabled." });
  }

  const provided = req.header("x-admin-token") ?? "";
  if (!tokenMatches(provided, expected)) {
    return res.status(401).json({ ok: false, error: "Unauthorized." });
  }

  const dryRun = req.body?.dryRun === true;
  const force = req.body?.force === true;

  try {
    const result = await withTx(async (client) => {
      // Serialize concurrent reset attempts so the double-run guard below is
      // race-free: the lock is held until this transaction commits/rolls back.
      await client.query(`SELECT pg_advisory_xact_lock(908070605)`);

      // Guard against accidental double-runs.
      await client.query(`
        CREATE TABLE IF NOT EXISTS reset_audit (
          id serial PRIMARY KEY,
          performed_at timestamptz NOT NULL DEFAULT now(),
          summary jsonb NOT NULL
        )
      `);
      const prior = await client.query(
        `SELECT count(*)::int AS n FROM reset_audit`,
      );
      const alreadyRun = (prior.rows[0]?.n ?? 0) > 0;
      if (alreadyRun && !force && !dryRun) {
        return {
          ok: false as const,
          alreadyRun: true,
          message:
            "A reset has already been recorded. Pass { force: true } to run again.",
        };
      }

      // Snapshot row counts before any changes.
      const before: Record<string, number> = {};
      for (const t of TABLES_PRESERVED) before[t] = await countRows(client, t);
      for (const t of TABLES_TO_CLEAR) before[t] = await countRows(client, t);

      if (dryRun) {
        return {
          ok: true as const,
          dryRun: true,
          startingBalance: STARTING_BALANCE,
          counts: before,
          wouldClear: TABLES_TO_CLEAR,
          wouldBackup: TABLES_TO_BACKUP,
          preserved: TABLES_PRESERVED,
        };
      }

      // 1. Back up every affected table into a timestamped schema.
      const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+$/, "")
        .replace("T", "_");
      const backupSchema = `reset_backups`;
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${backupSchema}"`);
      const backup: Record<string, { table: string; rows: number }> = {};
      for (const t of TABLES_TO_BACKUP) {
        const backupTable = `${t}_${stamp}`;
        await client.query(
          `CREATE TABLE "${backupSchema}"."${backupTable}" AS SELECT * FROM "${t}"`,
        );
        const n = await client.query(
          `SELECT count(*)::int AS n FROM "${backupSchema}"."${backupTable}"`,
        );
        backup[t] = { table: `${backupSchema}.${backupTable}`, rows: n.rows[0]?.n ?? 0 };
      }

      // Verify backups captured every source row before deleting anything.
      for (const t of TABLES_TO_BACKUP) {
        if (backup[t]!.rows !== before[t]) {
          throw new Error(
            `Backup verification failed for ${t}: source ${before[t]} vs backup ${backup[t]!.rows}`,
          );
        }
      }

      // 2. Clear all paper-trading / performance data.
      const deleted: Record<string, number> = {};
      for (const t of TABLES_TO_CLEAR) {
        const r = await client.query(`DELETE FROM "${t}"`);
        deleted[t] = r.rowCount ?? 0;
      }

      // 3. Reset account trading columns in place; keep wallet + graduation_tier.
      const acct = await client.query(
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
           last_reset_at = EXTRACT(EPOCH FROM NOW())::bigint`,
        [STARTING_BALANCE],
      );
      const accountsReset = acct.rowCount ?? 0;

      const after: Record<string, number> = {};
      for (const t of TABLES_PRESERVED) after[t] = await countRows(client, t);

      const summary = {
        backupSchema,
        backup,
        deleted,
        accountsReset,
        startingBalance: STARTING_BALANCE,
        before,
        preservedAfter: after,
      };

      await client.query(
        `INSERT INTO reset_audit (summary) VALUES ($1)`,
        [JSON.stringify(summary)],
      );

      return { ok: true as const, dryRun: false, ...summary };
    });

    if (!result.ok) {
      return res.status(409).json(result);
    }
    logger.info({ reset: true }, "Paper-trading reset completed");
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "Paper-trading reset failed");
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Reset failed.",
    });
  }
});

export default router;
