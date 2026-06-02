import { createRequire } from "node:module";
import axios from "axios";
import { takeSnapshot, isPreLaunch } from "./helius.js";
import { logger } from "./logger.js";
import db from "./database.js";

const require = createRequire(import.meta.url);

async function getSolPriceForCron(): Promise<number> {
  try {
    const r = await axios.get(
      "https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112",
      { timeout: 5000 }
    );
    return r.data?.data?.["So11111111111111111111111111111111111111112"]?.price || 150;
  } catch {
    return 150;
  }
}

async function getTokenPriceForCron(mint: string): Promise<number | null> {
  try {
    const r = await axios.get(`https://price.jup.ag/v6/price?ids=${mint}`, { timeout: 5000 });
    if (r.data?.data?.[mint]?.price) return r.data.data[mint].price;
  } catch {}
  try {
    const r = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 8000 });
    if (r.data?.pairs?.length > 0) return parseFloat(r.data.pairs[0].priceUsd) || null;
  } catch {}
  return null;
}

async function updateOpenPositionPrices(): Promise<void> {
  try {
    const positions = db.prepare(
      "SELECT id, token_mint FROM paper_positions WHERE status='open'"
    ).all() as Array<{ id: number; token_mint: string }>;

    if (positions.length === 0) return;

    const solPrice = await getSolPriceForCron();
    const uniqueMints = [...new Set(positions.map((p) => p.token_mint))];

    const priceMap = new Map<string, number | null>();
    await Promise.all(
      uniqueMints.map(async (mint) => {
        const usd = await getTokenPriceForCron(mint);
        priceMap.set(mint, usd !== null ? usd / solPrice : null);
      })
    );

    const now = new Date().toISOString();
    for (const pos of positions) {
      const price = priceMap.get(pos.token_mint);
      if (price !== null && price !== undefined) {
        db.prepare(
          "UPDATE paper_positions SET last_price_sol=?, last_price_updated=? WHERE id=?"
        ).run(price, now, pos.id);
      }
    }

    logger.info({ updated: positions.length }, "Updated open position prices");
  } catch (err) {
    logger.error({ err }, "updateOpenPositionPrices failed");
  }
}

function resetWeeklyCompetition(): void {
  try {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    const lastMonday = new Date(now);
    lastMonday.setUTCDate(now.getUTCDate() - diff - 7);
    lastMonday.setUTCHours(0, 0, 0, 0);
    const lastWeekStart = lastMonday.toISOString().split("T")[0];

    const top = db.prepare(
      "SELECT wallet, week_pnl FROM weekly_competitions WHERE week_start=? ORDER BY week_pnl DESC LIMIT 10"
    ).all(lastWeekStart) as Array<{ wallet: string; week_pnl: number }>;

    for (let i = 0; i < top.length; i++) {
      const multiplier = i === 0 ? 2.0 : i < 3 ? 1.5 : 1.25;
      db.prepare(
        "UPDATE weekly_competitions SET rank=?, multiplier_earned=? WHERE wallet=? AND week_start=?"
      ).run(i + 1, multiplier, top[i].wallet, lastWeekStart);
    }

    logger.info({ week: lastWeekStart, participants: top.length }, "Weekly competition finalised");
  } catch (err) {
    logger.error({ err }, "resetWeeklyCompetition failed");
  }
}

function checkGraduationMilestones(): void {
  try {
    const accounts = db.prepare(
      "SELECT wallet, realized_pnl FROM paper_accounts"
    ).all() as Array<{ wallet: string; realized_pnl: number }>;

    for (const acc of accounts) {
      let tier = "none";
      if (acc.realized_pnl >= 500) tier = "fund-manager";
      else if (acc.realized_pnl >= 200) tier = "senior-analyst";
      else if (acc.realized_pnl >= 50) tier = "analyst";
      db.prepare("UPDATE paper_accounts SET graduation_tier=? WHERE wallet=?").run(tier, acc.wallet);
    }
  } catch (err) {
    logger.error({ err }, "checkGraduationMilestones failed");
  }
}

export function startCron(): void {
  try {
    const cron = require("node-cron");

    cron.schedule("0 */4 * * *", async () => {
      try {
        if (isPreLaunch()) {
          logger.info("Pre-launch mode — skipping scheduled snapshot");
          return;
        }
        await takeSnapshot();
      } catch (err) {
        logger.error({ err }, "Scheduled snapshot failed");
      }
    });

    cron.schedule("*/2 * * * *", async () => {
      await updateOpenPositionPrices();
    });

    cron.schedule("0 0 * * 1", () => {
      resetWeeklyCompetition();
    });

    cron.schedule("0 * * * *", () => {
      checkGraduationMilestones();
    });

    logger.info("Cron scheduler started");
  } catch (err) {
    logger.warn({ err }, "Could not start cron scheduler — snapshots disabled");
  }
}
