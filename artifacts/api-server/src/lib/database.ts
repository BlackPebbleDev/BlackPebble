import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const BetterSQLite3 = require("better-sqlite3");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "blackpebble.db");
const db = new BetterSQLite3(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id TEXT UNIQUE NOT NULL,
    timestamp TEXT NOT NULL,
    total_holders INTEGER,
    eligible_holders INTEGER,
    total_supply REAL
  );

  CREATE TABLE IF NOT EXISTS holder_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    balance REAL NOT NULL,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
  );

  CREATE TABLE IF NOT EXISTS distributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT UNIQUE NOT NULL,
    token_name TEXT,
    token_mint TEXT,
    total_distributed REAL,
    total_recipients INTEGER,
    timestamp TEXT,
    tx_signatures TEXT,
    status TEXT DEFAULT 'completed'
  );

  CREATE TABLE IF NOT EXISTS stats_cache (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_holder_wallet ON holder_records(wallet);
  CREATE INDEX IF NOT EXISTS idx_holder_snapshot ON holder_records(snapshot_id);

  CREATE TABLE IF NOT EXISTS paper_accounts (
    wallet TEXT PRIMARY KEY,
    paper_balance REAL DEFAULT 100.0,
    total_pnl REAL DEFAULT 0.0,
    realized_pnl REAL DEFAULT 0.0,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    participation_points INTEGER DEFAULT 0,
    graduation_tier TEXT DEFAULT 'none',
    created_at TEXT,
    last_trade_at TEXT
  );

  CREATE TABLE IF NOT EXISTS paper_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_name TEXT,
    token_symbol TEXT,
    token_logo TEXT,
    total_tokens REAL NOT NULL,
    total_sol_spent REAL NOT NULL,
    avg_entry_price REAL NOT NULL,
    last_price_sol REAL,
    last_price_updated TEXT,
    opened_at TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    FOREIGN KEY (wallet) REFERENCES paper_accounts(wallet)
  );

  CREATE TABLE IF NOT EXISTS paper_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_name TEXT,
    token_symbol TEXT,
    side TEXT NOT NULL,
    sol_amount REAL NOT NULL,
    token_amount REAL NOT NULL,
    price_per_token REAL NOT NULL,
    pnl_sol REAL DEFAULT 0,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (wallet) REFERENCES paper_accounts(wallet)
  );

  CREATE TABLE IF NOT EXISTS weekly_competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    week_start TEXT NOT NULL,
    week_pnl REAL DEFAULT 0.0,
    week_trades INTEGER DEFAULT 0,
    rank INTEGER,
    multiplier_earned REAL DEFAULT 1.0,
    UNIQUE(wallet, week_start)
  );

  CREATE INDEX IF NOT EXISTS idx_paper_positions_wallet ON paper_positions(wallet);
  CREATE INDEX IF NOT EXISTS idx_paper_trades_wallet ON paper_trades(wallet);
  CREATE INDEX IF NOT EXISTS idx_weekly_wallet ON weekly_competitions(wallet);
`);

export default db;

export function getCacheValue(key: string): string | null {
  const row = db.prepare("SELECT value, updated_at FROM stats_cache WHERE key = ?").get(key) as
    | { value: string; updated_at: string }
    | undefined;
  return row ? row.value : null;
}

export function setCacheValue(key: string, value: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO stats_cache (key, value, updated_at) VALUES (?, ?, ?)"
  ).run(key, value, new Date().toISOString());
}

export function isCacheFresh(key: string, maxAgeMs = 5 * 60 * 60 * 1000): boolean {
  const row = db.prepare("SELECT updated_at FROM stats_cache WHERE key = ?").get(key) as
    | { updated_at: string }
    | undefined;
  if (!row) return false;
  return Date.now() - new Date(row.updated_at).getTime() < maxAgeMs;
}
