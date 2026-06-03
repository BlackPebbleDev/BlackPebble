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
  -- PHASE 1: Core paper trading
  CREATE TABLE IF NOT EXISTS accounts (
    wallet TEXT PRIMARY KEY,
    paper_balance REAL DEFAULT 100.0,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    total_pnl REAL DEFAULT 0.0,
    realized_pnl REAL DEFAULT 0.0,
    best_trade REAL DEFAULT 0.0,
    worst_trade REAL DEFAULT 0.0,
    current_streak INTEGER DEFAULT 0,
    participation_points INTEGER DEFAULT 0,
    graduation_tier TEXT DEFAULT 'none',
    created_at INTEGER DEFAULT (unixepoch()),
    last_active INTEGER DEFAULT (unixepoch()),
    last_reset_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_name TEXT,
    token_symbol TEXT,
    token_logo TEXT,
    total_tokens REAL NOT NULL,
    total_sol_spent REAL NOT NULL,
    avg_entry_price REAL NOT NULL,
    opened_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(wallet, token_mint)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_name TEXT,
    token_symbol TEXT,
    token_logo TEXT,
    side TEXT NOT NULL, -- 'buy' or 'sell'
    sol_amount REAL NOT NULL,
    token_amount REAL NOT NULL,
    price REAL NOT NULL,
    pnl REAL, -- only for sells
    executed_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    wallet TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_name TEXT,
    token_symbol TEXT,
    token_logo TEXT,
    added_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY(wallet, token_mint)
  );

  -- Portfolio performance history (for the portfolio chart)
  CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    equity REAL NOT NULL, -- balance + open position value (in SOL)
    balance REAL NOT NULL,
    realized_pnl REAL NOT NULL,
    snapshot_at INTEGER DEFAULT (unixepoch())
  );

  -- PHASE 1: Analytics (collect data now, build dashboards later)
  CREATE TABLE IF NOT EXISTS token_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT,
    token_mint TEXT NOT NULL,
    viewed_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS search_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT,
    query TEXT NOT NULL,
    results_count INTEGER,
    searched_at INTEGER DEFAULT (unixepoch())
  );

  -- PHASE 2: Leaderboard & Competitions (schema ready, not populated yet)
  CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    period TEXT NOT NULL, -- 'all', 'month', 'week'
    period_start INTEGER,
    total_pnl REAL,
    roi_percent REAL,
    win_rate REAL,
    trade_count INTEGER,
    rank INTEGER,
    snapshot_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_type TEXT NOT NULL, -- 'weekly', 'monthly'
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    status TEXT DEFAULT 'active', -- 'active', 'completed'
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS competition_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    wallet TEXT NOT NULL,
    pnl REAL,
    rank INTEGER,
    FOREIGN KEY(competition_id) REFERENCES competitions(id)
  );

  -- PHASE 3: Participation metrics (store now for future rewards)
  CREATE TABLE IF NOT EXISTS participation_metrics (
    wallet TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    trades_today INTEGER DEFAULT 0,
    points_today INTEGER DEFAULT 0,
    PRIMARY KEY(wallet, date)
  );

  CREATE TABLE IF NOT EXISTS utility_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    utility_type TEXT NOT NULL, -- 'cleanup', 'burn', 'close_account', etc.
    details TEXT, -- JSON blob
    executed_at INTEGER DEFAULT (unixepoch())
  );

  -- Generic key/value cache (prices, sol/usd, market lists)
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet);
  CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet);
  CREATE INDEX IF NOT EXISTS idx_trades_executed ON trades(executed_at);
  CREATE INDEX IF NOT EXISTS idx_watchlist_wallet ON watchlist(wallet);
  CREATE INDEX IF NOT EXISTS idx_token_views_mint ON token_views(token_mint);
  CREATE INDEX IF NOT EXISTS idx_portfolio_wallet ON portfolio_snapshots(wallet);
  CREATE INDEX IF NOT EXISTS idx_leaderboard_period ON leaderboard_snapshots(period, period_start);
  CREATE INDEX IF NOT EXISTS idx_comp_results_comp ON competition_results(competition_id);
`);

export default db;

export function getCacheValue(key: string): string | null {
  const row = db
    .prepare("SELECT value FROM cache WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setCacheValue(key: string, value: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO cache (key, value, updated_at) VALUES (?, ?, ?)",
  ).run(key, value, Math.floor(Date.now() / 1000));
}

export function isCacheFresh(key: string, maxAgeMs = 5 * 60 * 1000): boolean {
  const row = db
    .prepare("SELECT updated_at FROM cache WHERE key = ?")
    .get(key) as { updated_at: number } | undefined;
  if (!row) return false;
  return Date.now() - row.updated_at * 1000 < maxAgeMs;
}
