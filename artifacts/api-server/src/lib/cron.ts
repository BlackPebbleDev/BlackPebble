import cron from "node-cron";
import db from "./database.js";
import { getPortfolio } from "./trading.js";
import { getSolPriceUsd } from "./prices.js";
import { logger } from "./logger.js";

async function snapshotPortfolios(): Promise<void> {
  try {
    // Only snapshot accounts that have traded or hold positions.
    const wallets = db
      .prepare(
        `SELECT wallet FROM accounts WHERE total_trades > 0
         OR wallet IN (SELECT DISTINCT wallet FROM positions)`,
      )
      .all() as { wallet: string }[];

    const now = Math.floor(Date.now() / 1000);
    const insert = db.prepare(
      `INSERT INTO portfolio_snapshots (wallet, equity, balance, realized_pnl, snapshot_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    for (const { wallet } of wallets) {
      try {
        const p = await getPortfolio(wallet);
        insert.run(wallet, p.equitySol, p.balance, p.realizedPnlSol, now);
      } catch (e) {
        logger.warn({ err: e, wallet }, "Portfolio snapshot failed for wallet");
      }
    }
    if (wallets.length > 0) {
      logger.info({ count: wallets.length }, "Portfolio snapshots taken");
    }
  } catch (e) {
    logger.error({ err: e }, "snapshotPortfolios failed");
  }
}

export function startCron(): void {
  // Warm the SOL/USD cache immediately.
  getSolPriceUsd().catch(() => undefined);

  // Snapshot portfolios every 30 minutes for the performance chart.
  cron.schedule("*/30 * * * *", snapshotPortfolios);

  // Refresh SOL/USD cache every minute.
  cron.schedule("* * * * *", () => {
    getSolPriceUsd().catch(() => undefined);
  });

  logger.info("Cron jobs scheduled");
}
