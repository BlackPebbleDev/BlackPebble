import { createRequire } from "node:module";
import { takeSnapshot, isPreLaunch } from "./helius.js";
import { logger } from "./logger.js";

const require = createRequire(import.meta.url);

export function startCron(): void {
  try {
    const cron = require("node-cron");

    // Snapshot every 4 hours
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

    logger.info("Cron scheduler started");
  } catch (err) {
    logger.warn({ err }, "Could not start cron scheduler — snapshots disabled");
  }
}
