import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  integer,
  doublePrecision,
  boolean,
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
  // Season boundary: a reset bumps last_reset_at and current-season stats
  // (leaderboard / closed-trade stats) are windowed by it. `season` is a simple
  // display counter incremented on each new-season reset (starts at 1).
  last_reset_at: bigint("last_reset_at", { mode: "number" }),
  season: integer("season").default(1),
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
    // Slippage-free market cost basis (SOL): what the held tokens would have
    // cost at the RAW mid price at entry, summed across buys and reduced
    // proportionally on sells. Diverges from total_sol_spent only by the
    // slippage/impact paid, which lets the UI split unrealized P&L into pure
    // market movement vs. trading costs. Null on legacy rows (backfilled to
    // total_sol_spent by migration).
    cost_basis_market_sol: doublePrecision("cost_basis_market_sol"),
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
    // What produced this trade: null = manual, 'take_profit' / 'stop_loss' for
    // sells filled by an attached advanced order (used to label trade history).
    source: text("source"),
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

// ── Advanced orders (TP/SL) ─────────────────────────────────────────────────
// Take-profit / stop-loss sell orders attached to an existing paper position.
// Evaluated on positions-refresh against the current market cap / price already
// fetched by valuePositions() — no background workers, no extra price feeds.
export const paperOrders = pgTable(
  "paper_orders",
  {
    id: serial("id").primaryKey(),
    wallet: text("wallet").notNull(),
    token_mint: text("token_mint").notNull(),
    token_symbol: text("token_symbol"),
    token_name: text("token_name"),
    // 'take_profit' | 'stop_loss'
    order_type: text("order_type").notNull(),
    // Always 'sell' in phase 1 (TP/SL exits). Buy limits are out of scope.
    side: text("side").notNull().default("sell"),
    // 'market_cap' | 'price'
    trigger_type: text("trigger_type").notNull(),
    trigger_value: doublePrecision("trigger_value").notNull(),
    // 'gte' (take-profit) | 'lte' (stop-loss)
    trigger_direction: text("trigger_direction").notNull(),
    // 'percent_position' in phase 1.
    amount_type: text("amount_type").notNull().default("percent_position"),
    amount_value: doublePrecision("amount_value").notNull(),
    // 'pending' | 'filling' | 'filled' | 'canceled' | 'failed'
    status: text("status").notNull().default("pending"),
    // Reserved for future OCO grouping; null in phase 1.
    linked_group_id: text("linked_group_id"),
    // Reserved for future plan linkage (JSON); null in phase 1.
    linked_trade_plan: text("linked_trade_plan"),
    created_at: bigint("created_at", { mode: "number" }).default(epoch),
    updated_at: bigint("updated_at", { mode: "number" }).default(epoch),
    last_checked_at: bigint("last_checked_at", { mode: "number" }),
    filled_at: bigint("filled_at", { mode: "number" }),
    fill_market_cap: doublePrecision("fill_market_cap"),
    fill_price: doublePrecision("fill_price"),
    fill_reason: text("fill_reason"),
  },
  (t) => [
    index("idx_paper_orders_wallet").on(t.wallet),
    index("idx_paper_orders_mint_status").on(t.token_mint, t.status),
    index("idx_paper_orders_status").on(t.status),
  ],
);

// ── Paper leverage trading (Phase 1: longs only) ────────────────────────────
// Simulated leverage positions, fully isolated from the spot tables above. A
// position debits `margin_sol` from accounts.paper_balance on open and credits
// max(0, margin + realized_pnl) on close (0 on liquidation). Liquidation and the
// optional single TP/SL are evaluated on positions-refresh against the price /
// market cap already fetched by valuation — no background workers. Realized P&L
// here is intentionally NOT added to accounts.realized_pnl or the leaderboard.
export const paperLeveragePositions = pgTable(
  "paper_leverage_positions",
  {
    id: serial("id").primaryKey(),
    wallet: text("wallet").notNull(),
    token_mint: text("token_mint").notNull(),
    token_name: text("token_name"),
    token_symbol: text("token_symbol"),
    token_logo: text("token_logo"),
    // 'long' only in Phase 1.
    direction: text("direction").notNull().default("long"),
    // 2 | 5 | 10 | 20
    leverage: integer("leverage").notNull(),
    // User collateral (SOL) debited from paper_balance on open.
    margin_sol: doublePrecision("margin_sol").notNull(),
    // Position size in SOL = margin × leverage.
    notional_sol: doublePrecision("notional_sol").notNull(),
    // Tokens acquired at entry = notional / effective_entry_price.
    tokens: doublePrecision("tokens").notNull(),
    // Effective entry price (SOL) incl. slippage, and entry market cap (USD).
    entry_price_sol: doublePrecision("entry_price_sol").notNull(),
    entry_market_cap: doublePrecision("entry_market_cap"),
    // Liquidation level, derived at open from leverage + maintenance buffer.
    liq_price_sol: doublePrecision("liq_price_sol").notNull(),
    liq_market_cap: doublePrecision("liq_market_cap"),
    // Optional single take-profit / stop-loss triggers, by market cap (USD).
    tp_trigger_mc: doublePrecision("tp_trigger_mc"),
    sl_trigger_mc: doublePrecision("sl_trigger_mc"),
    // 'open' | 'closing' | 'closed' | 'liquidated'
    status: text("status").notNull().default("open"),
    // Set on close/liquidation.
    realized_pnl_sol: doublePrecision("realized_pnl_sol"),
    exit_price_sol: doublePrecision("exit_price_sol"),
    exit_market_cap: doublePrecision("exit_market_cap"),
    // 'manual' | 'take_profit' | 'stop_loss' | 'liquidated'
    close_reason: text("close_reason"),
    // Slippage / impact audit at entry (full notional), older rows may be null.
    entry_slippage_percent: doublePrecision("entry_slippage_percent"),
    entry_trade_impact_percent: doublePrecision("entry_trade_impact_percent"),
    opened_at: bigint("opened_at", { mode: "number" }).default(epoch),
    updated_at: bigint("updated_at", { mode: "number" }).default(epoch),
    closed_at: bigint("closed_at", { mode: "number" }),
  },
  (t) => [
    index("idx_lev_positions_wallet").on(t.wallet),
    index("idx_lev_positions_status").on(t.status),
    index("idx_lev_positions_mint_status").on(t.token_mint, t.status),
  ],
);

export const paperLeverageTrades = pgTable(
  "paper_leverage_trades",
  {
    id: serial("id").primaryKey(),
    position_id: integer("position_id").notNull(),
    wallet: text("wallet").notNull(),
    token_mint: text("token_mint").notNull(),
    token_name: text("token_name"),
    token_symbol: text("token_symbol"),
    token_logo: text("token_logo"),
    // 'open' | 'close' | 'liquidated'
    action: text("action").notNull(),
    direction: text("direction").notNull().default("long"),
    leverage: integer("leverage").notNull(),
    margin_sol: doublePrecision("margin_sol").notNull(),
    notional_sol: doublePrecision("notional_sol").notNull(),
    tokens: doublePrecision("tokens").notNull(),
    // Entry price on 'open', exit price on 'close'/'liquidated' (SOL).
    price_sol: doublePrecision("price_sol").notNull(),
    market_cap: doublePrecision("market_cap"),
    // Realized P&L (SOL) on close / liquidation; null on open.
    pnl_sol: doublePrecision("pnl_sol"),
    executed_at: bigint("executed_at", { mode: "number" }).default(epoch),
  },
  (t) => [
    index("idx_lev_trades_wallet").on(t.wallet),
    index("idx_lev_trades_executed").on(t.executed_at),
    index("idx_lev_trades_position").on(t.position_id),
  ],
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

// SOL Recovery (wallet cleaner) usage analytics. One row per completed scan
// and per cleanup attempt from the foreground recovery tool. We only ever
// store public, non-sensitive data: the public wallet address, the linked X
// identity (if any), counts, and the SOL amounts. NO private keys or signing
// material ever touch this table — closing happens entirely client-side.
export const recoveryEvents = pgTable(
  "recovery_events",
  {
    id: serial("id").primaryKey(),
    // 'scan' (a completed scan) | 'cleanup' (a close-accounts attempt)
    event_type: text("event_type").notNull(),
    wallet: text("wallet").notNull(),
    // Linked X identity resolved from the session server-side, when present.
    x_user_id: text("x_user_id"),
    x_username: text("x_username"),
    accounts_found: integer("accounts_found").default(0),
    accounts_closed: integer("accounts_closed").default(0),
    recoverable_sol: doublePrecision("recoverable_sol").default(0),
    recovered_sol: doublePrecision("recovered_sol").default(0),
    // scan: 'completed'; cleanup: 'success' | 'failed'
    status: text("status").notNull(),
    error_message: text("error_message"),
    created_at: bigint("created_at", { mode: "number" }).default(epoch),
  },
  (t) => [
    index("idx_recovery_events_type").on(t.event_type),
    index("idx_recovery_events_created").on(t.created_at),
    index("idx_recovery_events_wallet").on(t.wallet),
  ],
);

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

// ── Feature flags ───────────────────────────────────────────────────────────
// Simple persisted on/off switches read by the trading UI and toggled from the
// admin dashboard. Absent rows fall back to a hardcoded default (all enabled),
// so the table only ever stores explicit admin overrides.
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  updated_at: bigint("updated_at", { mode: "number" }).default(epoch),
});

// ── Lightweight funnel / activity analytics ─────────────────────────────────
// Append-only event log used purely for admin visibility (guest funnel + page
// views). Guests live entirely client-side, so these beacons are the only way
// to count "guests created / traded / converted". No PII — anon_id is a random
// per-device id. Created idempotently at runtime (CREATE TABLE IF NOT EXISTS),
// so this definition is mirror-only for type-safety.
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    // e.g. guest_created | guest_first_trade | guest_converted |
    // portfolio_view | leaderboard_view
    event_type: text("event_type").notNull(),
    // Anonymous per-device id (random); null for non-guest server-side events.
    anon_id: text("anon_id"),
    created_at: bigint("created_at", { mode: "number" }).default(epoch),
  },
  (t) => [
    index("idx_analytics_events_type").on(t.event_type),
    index("idx_analytics_events_created").on(t.created_at),
  ],
);
