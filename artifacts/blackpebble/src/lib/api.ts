const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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
  opened_at: number;
  currentPriceSol: number | null;
  currentValueSol: number;
  unrealizedPnlSol: number;
  unrealizedPnlPercent: number;
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
  executed_at: number;
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
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  bestTrade: number;
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

export interface WatchItem {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  priceUsd: number | null;
  priceSol: number | null;
  priceChange24h: number | null;
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
  positions: (wallet: string) =>
    request<{ positions: Position[]; solUsd: number }>(
      `/trade/positions/${wallet}`,
    ),
  history: (wallet: string) =>
    request<{ trades: Trade[] }>(`/trade/history/${wallet}`),
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
};
