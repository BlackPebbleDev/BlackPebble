import cron from "node-cron";
import { dbAll, dbRun } from "./database.js";
import { getPortfolio } from "./trading.js";
import { getSolPriceUsd } from "./prices.js";
import { refreshActiveCallPeaks } from "./peaks.js";
import { logger } from "./logger.js";

async function snapshotPortfolios(): Promise<void> {
  try {
    // Only snapshot accounts that have traded or hold positions.
    const wallets = await dbAll<{ wallet: string }>(
      `SELECT wallet FROM accounts WHERE total_trades > 0
       OR wallet IN (SELECT DISTINCT wallet FROM positions)`,
    );

    const now = Math.floor(Date.now() / 1000);

    for (const { wallet } of wallets) {
      try {
        const p = await getPortfolio(wallet);
        await dbRun(
          `INSERT INTO portfolio_snapshots (wallet, equity, balance, realized_pnl, snapshot_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [wallet, p.equitySol, p.balance, p.realizedPnlSol, now],
        );
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

  // Ratchet the ATH high-water mark for tokens with recent active calls so
  // callout performance keeps climbing even when nobody is viewing the token.
  cron.schedule("*/5 * * * *", () => {
    refreshActiveCallPeaks().catch(() => undefined);
  });
  // Seed peaks shortly after boot so a fresh process has data quickly.
  setTimeout(() => {
    refreshActiveCallPeaks().catch(() => undefined);
  }, 15 * 1000);

  logger.info("Cron jobs scheduled");
}
