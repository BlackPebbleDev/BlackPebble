import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";

// Local dev: fall back to the repo-root .env file when DATABASE_URL is not
// already in the environment (Replit injects it; local machines use .env).
if (!process.env.DATABASE_URL) {
  const rootEnv = path.join(__dirname, "..", "..", ".env");
  if (fs.existsSync(rootEnv)) {
    process.loadEnvFile(rootEnv);
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // drizzle-kit treats this as a glob; Windows backslashes from path.join
  // don't match, so normalize to forward slashes.
  schema: path.join(__dirname, "./src/schema/index.ts").replace(/\\/g, "/"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
