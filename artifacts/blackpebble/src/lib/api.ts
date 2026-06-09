const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : null) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

// ---- Types ----
export interface Account {
  wallet: string;
  paper_balance: number;
  total_trades: number;
  winning_trades: number;
  total_pnl: number;
  realized_pnl: number;
  best_trade: number;
  worst_trade: number;
  current_streak: number;
  participation_points: number;
  graduation_tier: string;
  created_at: number;
  last_active: number;
  last_reset_at: number | null;
  win_rate: number;
  season?: number;
}

// ---- Admin / feature flags ----
export type FeatureFlagKey =
  | "buy_limits"
  | "tp_sl"
  | "multi_target_tp"
  | "experimental_utilities";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export interface AdminMe {
  admin: boolean;
  x_username: string | null;
}

export interface AdminStats {
  accounts: number;
  dau: number;
  users: number;
  wallet_links: number;
  x_links: number;
  trades: number;
  buys: number;
  sells: number;
  volume_sol: number;
  positions: number;
  traders_with_positions: number;
  active_orders: number;
  leaderboard_users: number;
}

export interface AdminHealth {
  api: { ok: boolean; uptimeSeconds: number; node: string };
  db: { ok: boolean; latencyMs: number | null };
  market: {
    lastUpdated: number | null;
    tokenCount: number;
    pumpportalConnected: boolean;
    cacheAge: number | null;
  };
  memory: { rssMb: number; heapUsedMb: number };
}

export interface ResetOptions {
  resetBalance?: boolean;
  clearPositions?: boolean;
  clearOrders?: boolean;
  clearTrades?: boolean;
  resetLeaderboard?: boolean;
  clearWatchlist?: boolean;
}

export interface ResetResult {
  ok: boolean;
  scope: "user" | "all";
  wallet?: string;
  applied: string[];
  deleted: Record<string, number>;
  accountsReset: number;
}

export interface TokenInfo {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  priceUsd: number | null;
  priceSol: number | null;
  priceChange24h: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  source: string;
  isMigrated: boolean;
  pairAddress: string | null;
}

export interface SearchResult {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  priceUsd?: number | null;
  marketCapUsd?: number | null;
}

export interface Position {
  id: number;
  wallet: string;
  token_mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  total_tokens: number;
  total_sol_spent: number;
  avg_entry_price: number;
  entry_market_cap: number | null;
  opened_at: number;
  currentPriceSol: number | null;
  currentValueSol: number;
  unrealizedPnlSol: number;
  unrealizedPnlPercent: number;
  // P&L split (#8): slippage-free cost basis, pure market movement, the entry
  // trading costs paid (≤ 0), and the net result (= unrealizedPnlSol).
  costBasisMarketSol: number;
  unrealizedPnlMarketSol: number;
  tradingCostsSol: number;
  netResultSol: number;
  currentMarketCapUsd: number | null;
  marketCapChangePercent: number | null;
}

export interface Trade {
  id: number;
  token_mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  side: "buy" | "sell";
  sol_amount: number;
  token_amount: number;
  price: number;
  pnl: number | null;
  source?: string | null;
  executed_at: number;
  raw_price_usd?: number | null;
  effective_price_usd?: number | null;
  slippage_percent?: number | null;
  trade_impact_percent?: number | null;
  liquidity_usd_at_execution?: number | null;
  sol_usd_price_at_execution?: number | null;
  trade_usd_value?: number | null;
}

export type OrderType = "take_profit" | "stop_loss" | "buy_limit";
export type TriggerType = "market_cap" | "price";
export type TriggerDirection = "gte" | "lte";

export interface PaperOrder {
  id: number;
  wallet: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  order_type: OrderType;
  side: string;
  trigger_type: TriggerType;
  trigger_value: number;
  trigger_direction: TriggerDirection;
  amount_type: string;
  amount_value: number;
  status: string;
  linked_group_id: string | null;
  linked_trade_plan: string | null;
  created_at: number;
  updated_at: number;
  last_checked_at: number | null;
  filled_at: number | null;
  fill_market_cap: number | null;
  fill_price: number | null;
  fill_reason: string | null;
}

export interface OrderFill {
  orderId: number;
  orderType: OrderType;
  tokenMint: string;
  tokenSymbol: string | null;
  percent: number;
  /** Populated for buy_limit fills; null for TP/SL. */
  solAmount?: number | null;
  triggerType: TriggerType;
  triggerValue: number;
  fillMarketCap: number | null;
  fillPrice: number | null;
  pnl: number | null;
}

export type WarningLevel = "none" | "high" | "extreme";

export interface TradeQuote {
  ok: boolean;
  error?: string;
  blocked?: boolean;
  lowData?: boolean;
  side: "buy" | "sell";
  rawPriceUsd: number;
  effectivePriceUsd: number;
  slippagePercent: number;
  tradeImpactPercent: number;
  liquidityUsd: number;
  solUsd: number;
  tradeUsdValue: number;
  warningLevel: WarningLevel;
  estimatedTokens: number | null;
  estimatedSol: number | null;
}

export interface Portfolio {
  wallet: string;
  balance: number;
  positionsValueSol: number;
  equitySol: number;
  unrealizedPnlSol: number;
  realizedPnlSol: number;
  totalPnlSol: number;
  solUsd: number;
  positions: Position[];
}

export interface PortfolioStats {
  wallet: string;
  balance: number;
  equitySol: number;
  equityUsd: number;
  totalPnlSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  roiPercent: number;
  /** Every buy + sell action (post-reset). */
  totalExecutions: number;
  /** Realized position exits (sell trades, post-reset). */
  closedTrades: number;
  winningTrades: number;
  winRate: number;
  /** Largest winning trade, or null when there are no winning closed trades. */
  bestTrade: number | null;
  worstTrade: number;
  currentStreak: number;
  participationPoints: number;
  graduationTier: string;
  openPositions: number;
  solUsd: number;
}

export interface ChartPoint {
  t: number;
  equity: number;
  balance: number;
}

export interface LiveTrade {
  mint: string;
  trader: string;
  side: "buy" | "sell";
  solAmount: number;
  tokenAmount: number;
  timestamp: number;
}

export interface NewToken {
  mint: string;
  name?: string | null;
  symbol?: string | null;
  uri?: string | null;
  marketCapSol?: number | null;
  timestamp: number;
}

export interface MigratedToken {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  migratedAt: number;
  priceUsd: number | null;
  priceChange24h: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
}

export interface WatchItem {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  priceUsd: number | null;
  priceSol: number | null;
  priceChange24h: number | null;
  marketCapUsd: number | null;
}

export type LeaderboardPeriod = "daily" | "weekly" | "all";

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  x_username: string | null;
  x_avatar_url: string | null;
  x_display_name: string | null;
  realized_pnl: number;
  roi: number;
  win_rate: number;
  total_closed_trades: number;
  best_trade: number;
  graduation_tier: string;
  created_at: number;
  updated_at: number;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  minTrades: number;
  entries: LeaderboardEntry[];
  solUsd: number;
}

export interface ExecuteResult {
  ok: boolean;
  error?: string;
  trade?: {
    side: "buy" | "sell";
    mint: string;
    solAmount: number;
    tokenAmount: number;
    price: number;
    pnl: number | null;
  };
  balance?: number;
}

// ---- API ----
export const api = {
  createAccount: (wallet: string) =>
    request<Account>("/account/create", {
      method: "POST",
      body: JSON.stringify({ wallet }),
    }),
  getAccount: (wallet: string) => request<Account>(`/account/${wallet}`),
  resetAccount: (wallet: string) =>
    request<{ ok: boolean; error?: string; account?: Account }>(
      "/account/reset",
      { method: "POST", body: JSON.stringify({ wallet }) },
    ),

  search: (q: string, wallet?: string) =>
    request<{ results: SearchResult[] }>(
      `/trade/search?q=${encodeURIComponent(q)}${wallet ? `&wallet=${wallet}` : ""}`,
    ),
  getToken: (mint: string, wallet?: string) =>
    request<TokenInfo>(
      `/trade/token/${mint}${wallet ? `?wallet=${wallet}` : ""}`,
    ),
  execute: (body: Record<string, unknown>) =>
    request<ExecuteResult>("/trade/execute", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  quote: (body: Record<string, unknown>) =>
    request<TradeQuote>("/trade/quote", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  positions: (wallet: string) =>
    request<{ positions: Position[]; solUsd: number; orderFills?: OrderFill[] }>(
      `/trade/positions/${wallet}`,
    ),
  history: (wallet: string) =>
    request<{ trades: Trade[] }>(`/trade/history/${wallet}`),

  orders: (wallet: string, mint?: string) =>
    request<{ orders: PaperOrder[] }>(
      `/trade/orders/${wallet}${mint ? `?mint=${encodeURIComponent(mint)}` : ""}`,
    ),
  createOrder: (body: {
    wallet: string;
    mint: string;
    symbol?: string | null;
    name?: string | null;
    orderType: OrderType;
    triggerType: TriggerType;
    triggerValue: number;
    amountPercent: number;
  }) =>
    request<{ ok: boolean; error?: string; order?: PaperOrder }>(
      "/trade/orders",
      { method: "POST", body: JSON.stringify(body) },
    ),
  cancelOrder: (wallet: string, id: number) =>
    request<{ ok: boolean; error?: string }>("/trade/orders/cancel", {
      method: "POST",
      body: JSON.stringify({ wallet, id }),
    }),
  createBuyLimit: (body: {
    wallet: string;
    mint: string;
    symbol?: string | null;
    name?: string | null;
    triggerMc: number;
    solAmount: number;
  }) =>
    request<{ ok: boolean; error?: string; order?: PaperOrder }>(
      "/trade/buy-limit",
      { method: "POST", body: JSON.stringify(body) },
    ),
  checkBuyLimits: (wallet: string) =>
    request<{ fills: OrderFill[] }>(`/trade/buy-limits/check/${wallet}`),
  watchlist: (wallet: string) =>
    request<{ watchlist: WatchItem[] }>(`/trade/watchlist/${wallet}`),
  watchlistAdd: (body: Record<string, unknown>) =>
    request<{ ok: boolean }>("/trade/watchlist/add", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  watchlistRemove: (wallet: string, mint: string) =>
    request<{ ok: boolean }>("/trade/watchlist/remove", {
      method: "POST",
      body: JSON.stringify({ wallet, mint }),
    }),

  liveTrades: (mint: string) =>
    request<{ trades: LiveTrade[]; connected: boolean }>(
      `/live/trades/${mint}`,
    ),
  newTokens: () =>
    request<{ tokens: NewToken[]; connected: boolean }>(`/live/new-tokens`),
  migrations: () =>
    request<{ migrations: NewToken[]; connected: boolean }>(`/live/migrations`),

  trending: () => request<{ tokens: TokenInfo[] }>(`/markets/trending`),
  gainers: () => request<{ tokens: TokenInfo[] }>(`/markets/gainers`),
  volume: () => request<{ tokens: TokenInfo[] }>(`/markets/volume`),
  migrated: () =>
    request<{ tokens: MigratedToken[]; connected: boolean }>(
      `/markets/migrated`,
    ),
  marketStatus: () =>
    request<{
      lastUpdated: number | null;
      tokenCount: number;
      pumpportalConnected: boolean;
      cacheAge: number | null;
    }>(`/markets/status`),

  portfolio: (wallet: string) => request<Portfolio>(`/portfolio/${wallet}`),
  portfolioChart: (wallet: string) =>
    request<{ points: ChartPoint[]; solUsd: number }>(
      `/portfolio/chart/${wallet}`,
    ),
  portfolioStats: (wallet: string) =>
    request<PortfolioStats>(`/portfolio/stats/${wallet}`),

  leaderboard: (period: LeaderboardPeriod) =>
    request<LeaderboardResponse>(`/leaderboard?period=${period}`),

  // Self-service "start a new season" for a depleted account.
  newSeason: (wallet: string) =>
    request<{ ok: boolean; error?: string; balance?: number; season?: number; account?: Account }>(
      "/account/new-season",
      { method: "POST", body: JSON.stringify({ wallet }) },
    ),

  // Public feature flags (read-only) consumed by the trading UI.
  featureFlags: () => request<{ flags: FeatureFlags }>("/feature-flags"),

  admin: {
    me: () => request<AdminMe>("/admin/me"),
    stats: () => request<{ stats: AdminStats; generatedAt: number }>("/admin/stats"),
    health: () => request<AdminHealth>("/admin/health"),
    orders: (filters?: { token?: string; user?: string; status?: string }) => {
      const qs = new URLSearchParams();
      if (filters?.token) qs.set("token", filters.token);
      if (filters?.user) qs.set("user", filters.user);
      if (filters?.status) qs.set("status", filters.status);
      const q = qs.toString();
      return request<{ orders: PaperOrder[] }>(`/admin/orders${q ? `?${q}` : ""}`);
    },
    cancelOrder: (id: number) =>
      request<{ ok: boolean; error?: string }>("/admin/orders/cancel", {
        method: "POST",
        body: JSON.stringify({ id }),
      }),
    refreshMarket: () =>
      request<{ ok: boolean; tokenCount: number }>("/admin/market/refresh", {
        method: "POST",
      }),
    featureFlags: () => request<{ flags: FeatureFlags }>("/admin/feature-flags"),
    setFeatureFlag: (key: FeatureFlagKey, enabled: boolean) =>
      request<{ ok: boolean; error?: string; flags?: FeatureFlags }>(
        "/admin/feature-flags",
        { method: "POST", body: JSON.stringify({ key, enabled }) },
      ),
    resetUser: (wallet: string, options: ResetOptions) =>
      request<ResetResult>("/admin/reset-user", {
        method: "POST",
        body: JSON.stringify({ wallet, options }),
      }),
    resetAll: (options: ResetOptions) =>
      request<ResetResult>("/admin/reset-all", {
        method: "POST",
        body: JSON.stringify({ options }),
      }),
  },
};
