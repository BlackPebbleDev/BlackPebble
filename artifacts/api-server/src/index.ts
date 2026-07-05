import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startCron } from "./lib/cron.js";
import { pumpportal } from "./lib/pumpportal.js";

// ---------------------------------------------------------------------------
// Required-secret validation - run before anything else so misconfigured
// deployments fail loudly at boot instead of silently misbehaving at runtime.
// ---------------------------------------------------------------------------
const isProduction =
  process.env["NODE_ENV"] === "production" ||
  process.env["IS_PROD"] === "true";

if (!process.env["JWT_SECRET"]) {
  if (isProduction) {
    // Hard fail: without JWT_SECRET X authentication cannot work at all.
    // Continuing would silently treat every session cookie as invalid.
    console.error(
      "[FATAL] JWT_SECRET is required in production but is not set. Refusing to start.",
    );
    process.exit(1);
  } else {
    logger.warn(
      "JWT_SECRET is not set - X authentication is disabled for this session.",
    );
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startCron();
  pumpportal.start();
});
