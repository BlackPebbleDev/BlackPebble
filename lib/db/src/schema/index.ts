import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  integer,
  doublePrecision,
  bigint,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

// Unix-second timestamp default, matching the legacy SQLite `unixepoch()`.
// Stored as bigint; a global pg int8 type parser (see api-server database.ts)
// returns these as JS numbers so the app keeps using plain numbers.
const epoch = sql`EXTRACT(EPOCH FROM NOW())::bigint`;

// ── Core paper trading ──────────────────────────────────────────────────────
export const accounts = pgTable("accounts", {
  wallet: text("wallet").primaryKey(),
  paper_balance: doublePrecision("paper_balance").default(100),
  total_trades: integer("total_trades").default(0),
  winning_trades: integer("winning_trades").default(0),
  total_pnl: doublePrecision("total_pnl").default(0),
  realized_pnl: doublePrecision("realized_pnl").default(0),
  best_trade: doublePrecision("best_trade").default(0),
  worst_trade: doublePrecision("worst_trade").default(0),
  current_streak: integer("current_streak").default(0),
  participation_points: integer("participation_points").default(0),
  graduation_tier: text("graduation_tier").default("none"),
  created_at: bigint("created_at", { mode: "number" }).default(epoch),
  last_active: bigint("last_active", { mode: "number" }).default(epoch),
  last_reset_at: bigint("last_reset_at", { mode: "number" }),
});

export const positions = pgTable(
  "positions",
  {
    id: serial("id").primaryKey(),
    wallet: text("wallet").notNull(),
    token_mint: text("token_mint").notNull(),
    token_name: text("token_name"),
    token_symbol: text("token_symbol"),
    token_logo: text("token_logo"),
    total_tokens: doublePrecision("total_tokens").notNull(),
    total_sol_spent: doublePrecision("total_sol_spent").notNull(),
    avg_entry_price: doublePrecision("avg_entry_price").notNull(),
    // SOL-weighted average market cap (USD) at entry; null when upstream data
    // had no market cap / FDV at the time the position was opened.
    entry_market_cap: doublePrecision("entry_market_cap"),
    opened_at: bigint("opened_at", { mode: "number" }).default(epoch),
  },
  (t) => [
    uniqueIndex("positions_wallet_mint_unique").on(t.wallet, t.token_mint),
    index("idx_positions_wallet").on(t.wallet),
  ],
);

export const trades = pgTable(
  "trades",
  {
    id: serial("id").primaryKey(),
    wallet: text("wallet").notNull(),
    token_mint: text("token_mint").notNull(),
    token_name: text("token_name"),
    token_symbol: text("token_symbol"),
    token_logo: text("token_logo"),
    side: text("side").notNull(), // 'buy' | 'sell'
    sol_amount: doublePrecision("sol_amount").notNull(),
    token_amount: doublePrecision("token_amount").notNull(),
    price: doublePrecision("price").notNull(),
    pnl: doublePrecision("pnl"), // only for sells
    executed_at: bigint("executed_at", { mode: "number" }).default(epoch),
    // Slippage / liquidity-impact audit trail (older rows may be null).
    raw_price_usd: doublePrecision("raw_price_usd"),
    effective_price_usd: doublePrecision("effective_price_usd"),
    slippage_percent: doublePrecision("slippage_percent"),
    trade_impact_percent: doublePrecision("trade_impact_percent"),
    liquidity_usd_at_execution: doublePrecision("liquidity_usd_at_execution"),
    sol_usd_price_at_execution: doublePrecision("sol_usd_price_at_execution"),
    trade_usd_value: doublePrecision("trade_usd_value"),
  },
  (t) => [
    index("idx_trades_wallet").on(t.wallet),
    index("idx_trades_executed").on(t.executed_at),
  ],
);

export const watchlist = pgTable(
  "watchlist",
  {
    wallet: text("wallet").notNull(),
    token_mint: text("token_mint").notNull(),
    token_name: text("token_name"),
    token_symbol: text("token_symbol"),
    token_logo: text("token_logo"),
    added_at: bigint("added_at", { mode: "number" }).default(epoch),
  },
  (t) => [
    primaryKey({ columns: [t.wallet, t.token_mint] }),
    index("idx_watchlist_wallet").on(t.wallet),
  ],
);

// Portfolio performance history (for the portfolio chart).
export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: serial("id").primaryKey(),
    wallet: text("wallet").notNull(),
    equity: doublePrecision("equity").notNull(),
    balance: doublePrecision("balance").notNull(),
    realized_pnl: doublePrecision("realized_pnl").notNull(),
    snapshot_at: bigint("snapshot_at", { mode: "number" }).default(epoch),
  },
  (t) => [index("idx_portfolio_wallet").on(t.wallet)],
);

// ── Analytics ───────────────────────────────────────────────────────────────
export const tokenViews = pgTable(
  "token_views",
  {
    id: serial("id").primaryKey(),
    wallet: text("wallet"),
    token_mint: text("token_mint").notNull(),
    viewed_at: bigint("viewed_at", { mode: "number" }).default(epoch),
  },
  (t) => [index("idx_token_views_mint").on(t.token_mint)],
);

export const searchActivity = pgTable("search_activity", {
  id: serial("id").primaryKey(),
  wallet: text("wallet"),
  query: text("query").notNull(),
  results_count: integer("results_count"),
  searched_at: bigint("searched_at", { mode: "number" }).default(epoch),
});

// ── Leaderboard & competitions (schema ready) ───────────────────────────────
export const leaderboardSnapshots = pgTable(
  "leaderboard_snapshots",
  {
    id: serial("id").primaryKey(),
    wallet: text("wallet").notNull(),
    period: text("period").notNull(),
    period_start: bigint("period_start", { mode: "number" }),
    total_pnl: doublePrecision("total_pnl"),
    roi_percent: doublePrecision("roi_percent"),
    win_rate: doublePrecision("win_rate"),
    trade_count: integer("trade_count"),
    rank: integer("rank"),
    snapshot_at: bigint("snapshot_at", { mode: "number" }).default(epoch),
  },
  (t) => [index("idx_leaderboard_period").on(t.period, t.period_start)],
);

export const competitions = pgTable("competitions", {
  id: serial("id").primaryKey(),
  period_type: text("period_type").notNull(),
  start_at: bigint("start_at", { mode: "number" }).notNull(),
  end_at: bigint("end_at", { mode: "number" }).notNull(),
  status: text("status").default("active"),
  created_at: bigint("created_at", { mode: "number" }).default(epoch),
});

export const competitionResults = pgTable(
  "competition_results",
  {
    id: serial("id").primaryKey(),
    competition_id: integer("competition_id")
      .notNull()
      .references(() => competitions.id),
    wallet: text("wallet").notNull(),
    pnl: doublePrecision("pnl"),
    rank: integer("rank"),
  },
  (t) => [index("idx_comp_results_comp").on(t.competition_id)],
);

// ── Participation metrics ───────────────────────────────────────────────────
export const participationMetrics = pgTable(
  "participation_metrics",
  {
    wallet: text("wallet").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    trades_today: integer("trades_today").default(0),
    points_today: integer("points_today").default(0),
  },
  (t) => [primaryKey({ columns: [t.wallet, t.date] })],
);

export const utilityUsage = pgTable("utility_usage", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull(),
  utility_type: text("utility_type").notNull(),
  details: text("details"),
  executed_at: bigint("executed_at", { mode: "number" }).default(epoch),
});

export const walletChallenges = pgTable(
  "wallet_challenges",
  {
    id: serial("id").primaryKey(),
    wallet: text("wallet").notNull(),
    nonce: text("nonce").notNull(),
    created_at: bigint("created_at", { mode: "number" }).default(epoch),
  },
  (t) => [
    index("idx_wallet_challenges_wallet").on(t.wallet),
    index("idx_wallet_challenges_created").on(t.created_at),
  ],
);

// ── Identity scaffold (future) ──────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  display_name: text("display_name"),
  avatar_url: text("avatar_url"),
  created_at: bigint("created_at", { mode: "number" }).default(epoch),
  last_active: bigint("last_active", { mode: "number" }).default(epoch),
});

export const userIdentities = pgTable(
  "user_identities",
  {
    id: serial("id").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(), // 'wallet' | 'x'
    provider_user_id: text("provider_user_id").notNull(),
    wallet_address: text("wallet_address"),
    x_username: text("x_username"),
    created_at: bigint("created_at", { mode: "number" }).default(epoch),
  },
  (t) => [
    uniqueIndex("user_identities_provider_unique").on(
      t.provider,
      t.provider_user_id,
    ),
    index("idx_user_identities_user").on(t.user_id),
  ],
);
