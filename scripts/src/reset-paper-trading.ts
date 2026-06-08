/**
 * BlackPebble Paper Trading — Season Reset Utility
 *
 * Usage:
 *   pnpm --filter @workspace/scripts reset-paper-trading
 *   pnpm --filter @workspace/scripts reset-paper-trading -- --balance 50
 *   pnpm --filter @workspace/scripts reset-paper-trading -- --dry-run
 *
 * Options:
 *   --balance <SOL>   Starting balance to reset every account to (default: 100)
 *   --dry-run         Print counts and SQL without executing
 */

import pg from "pg";

pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const balanceIdx = args.indexOf("--balance");
const startingBalance =
  balanceIdx !== -1 && args[balanceIdx + 1]
    ? Number(args[balanceIdx + 1])
    : 100;

if (!Number.isFinite(startingBalance) || startingBalance <= 0) {
  console.error("--balance must be a positive number");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function getCounts(client: pg.PoolClient) {
  const res = await client.query<{ tbl: string; n: string }>(`
    SELECT 'accounts'             AS tbl, COUNT(*)::text AS n FROM accounts
    UNION ALL SELECT 'positions',             COUNT(*) FROM positions
    UNION ALL SELECT 'trades',                COUNT(*) FROM trades
    UNION ALL SELECT 'paper_orders',          COUNT(*) FROM paper_orders
    UNION ALL SELECT 'portfolio_snapshots',   COUNT(*) FROM portfolio_snapshots
    UNION ALL SELECT 'leaderboard_snapshots', COUNT(*) FROM leaderboard_snapshots
    UNION ALL SELECT 'participation_metrics', COUNT(*) FROM participation_metrics
    UNION ALL SELECT 'competitions',          COUNT(*) FROM competitions
    UNION ALL SELECT 'competition_results',   COUNT(*) FROM competition_results
    UNION ALL SELECT 'watchlist',             COUNT(*) FROM watchlist
    ORDER BY tbl
  `);
  return Object.fromEntries(res.rows.map((r) => [r.tbl, Number(r.n)]));
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("\n=== BlackPebble Paper Trading Season Reset ===");
    console.log(`Starting balance: ${startingBalance} SOL`);
    if (dryRun) console.log("*** DRY RUN — no changes will be made ***\n");

    const before = await getCounts(client);
    console.log("\nRecord counts BEFORE reset:");
    console.table(before);

    if (dryRun) {
      console.log("\nSQL that would be executed:");
      console.log(`
  DELETE FROM positions;
  DELETE FROM trades;
  DELETE FROM paper_orders;
  DELETE FROM portfolio_snapshots;
  DELETE FROM leaderboard_snapshots;
  DELETE FROM participation_metrics;
  DELETE FROM competition_results;
  DELETE FROM competitions;
  UPDATE accounts SET
    paper_balance = ${startingBalance},
    total_trades = 0, winning_trades = 0,
    total_pnl = 0, realized_pnl = 0,
    best_trade = 0, worst_trade = 0,
    current_streak = 0, participation_points = 0,
    graduation_tier = 'none',
    last_reset_at = EXTRACT(EPOCH FROM NOW())::bigint;
      `);
      console.log("Watchlist and account records would be preserved.");
      return;
    }

    await client.query("BEGIN");

    await client.query("DELETE FROM positions");
    await client.query("DELETE FROM trades");
    await client.query("DELETE FROM paper_orders");
    await client.query("DELETE FROM portfolio_snapshots");
    await client.query("DELETE FROM leaderboard_snapshots");
    await client.query("DELETE FROM participation_metrics");
    await client.query("DELETE FROM competition_results");
    await client.query("DELETE FROM competitions");
    await client.query(`
      UPDATE accounts SET
        paper_balance        = $1,
        total_trades         = 0,
        winning_trades       = 0,
        total_pnl            = 0,
        realized_pnl         = 0,
        best_trade           = 0,
        worst_trade          = 0,
        current_streak       = 0,
        participation_points = 0,
        graduation_tier      = 'none',
        last_reset_at        = EXTRACT(EPOCH FROM NOW())::bigint
    `, [startingBalance]);

    await client.query("COMMIT");

    const after = await getCounts(client);
    console.log("\nRecord counts AFTER reset:");
    console.table(after);

    const accountsRes = await client.query<{ wallet: string; paper_balance: number }>(
      "SELECT wallet, paper_balance FROM accounts ORDER BY wallet"
    );
    console.log(`\nAll ${accountsRes.rows.length} account(s) reset to ${startingBalance} SOL:`);
    for (const row of accountsRes.rows) {
      console.log(`  ${row.wallet}  →  ${row.paper_balance} SOL`);
    }

    console.log("\n✓ Season reset complete. Watchlists and wallet connections preserved.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("\nReset failed — rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
