import { useSyncExternalStore } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  api,
  type Position,
  type Trade,
  type WatchItem,
  type PortfolioStats,
  type TradeQuote,
} from "@/lib/api";

/**
 * Client-side guest trading engine.
 *
 * Guests trade without a wallet. Their balance, positions, trade history and
 * watchlist live entirely in localStorage (survive refresh / navigation, but
 * never touch the server database and never appear on the leaderboard).
 *
 * Market math (slippage / effective fill price) is NEVER recomputed here — the
 * server `/trade/quote` endpoint is the single source of truth and works
 * without an account. This module only does the position bookkeeping
 * (averaging, cost basis, realized P&L), mirroring the server's executeBuy /
 * executeSell exactly so a guest trade behaves identically to a signed-in one.
 */

export const GUEST_STARTING_BALANCE = 100.0;
export const GUEST_MIN_TRADE_SOL = 0.1;
export const GUEST_MAX_POSITIONS = 20;

const STORAGE_KEY = "bp_guest_state_v1";
const DISMISS_KEY = "bp_guest_migration_dismissed_v1";

const TIERS: { name: string; min: number }[] = [
  { name: "Managing Director", min: 1000 },
  { name: "Portfolio Manager", min: 500 },
  { name: "Senior Analyst", min: 200 },
  { name: "Analyst", min: 50 },
];

function graduationTier(allTimePnl: number): string {
  for (const t of TIERS) {
    if (allTimePnl >= t.min) return t.name;
  }
  return "none";
}

export interface GuestPositionRow {
  id: number;
  token_mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  total_tokens: number;
  total_sol_spent: number;
  avg_entry_price: number;
  entry_market_cap: number | null;
  opened_at: number;
}

export interface GuestTrade extends Trade {}

export interface GuestWatchRow {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  added_at: number;
}

export interface GuestState {
  balance: number;
  positions: GuestPositionRow[];
  trades: GuestTrade[];
  watchlist: GuestWatchRow[];
  lastSolUsd: number;
  nextId: number;
  created_at: number;
}

function freshState(): GuestState {
  return {
    balance: GUEST_STARTING_BALANCE,
    positions: [],
    trades: [],
    watchlist: [],
    lastSolUsd: 0,
    nextId: 1,
    created_at: Math.floor(Date.now() / 1000),
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function load(): GuestState {
  if (!isBrowser()) return freshState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw) as Partial<GuestState>;
    return {
      ...freshState(),
      ...parsed,
      positions: parsed.positions ?? [],
      trades: parsed.trades ?? [],
      watchlist: parsed.watchlist ?? [],
    };
  } catch {
    return freshState();
  }
}

// --- Reactive store (useSyncExternalStore compatible) -----------------------

let current: GuestState = load();
const listeners = new Set<() => void>();

function persist() {
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* ignore quota / serialization errors */
    }
  }
}

function setState(next: GuestState) {
  current = next;
  persist();
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (isBrowser()) {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        current = load();
        cb();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  }
  return () => listeners.delete(cb);
}

function getSnapshot(): GuestState {
  return current;
}

export function getGuestState(): GuestState {
  return current;
}

export function useGuestStore(): GuestState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function hasGuestActivity(state: GuestState = current): boolean {
  return (
    state.positions.length > 0 ||
    state.trades.length > 0 ||
    state.watchlist.length > 0
  );
}

export function resetGuest() {
  setState(freshState());
}

export function clearGuest() {
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  setState(freshState());
}

/**
 * Remove only the given mints from the guest's open positions, leaving the rest
 * (and trade history/watchlist) intact. Used by migration so positions that
 * successfully transfer to a wallet are dropped while any that failed to
 * migrate are preserved locally rather than silently lost.
 */
export function removeGuestPositions(mints: string[]) {
  if (mints.length === 0) return;
  const drop = new Set(mints);
  setState({
    ...current,
    positions: current.positions.filter((p) => !drop.has(p.token_mint)),
  });
}

// --- Migration dismissal tracking ------------------------------------------

function loadDismissed(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function isMigrationDismissed(wallet: string): boolean {
  return loadDismissed().includes(wallet);
}

export function dismissMigration(wallet: string) {
  if (!isBrowser()) return;
  const list = loadDismissed();
  if (!list.includes(wallet)) {
    list.push(wallet);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }
}

// --- Trade execution (bookkeeping only) ------------------------------------

export interface GuestExecuteResult {
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

/**
 * Apply a buy using a server quote. `quote` must come from /trade/quote so the
 * effective (slippage-adjusted) fill price matches a real trade.
 */
export function guestBuy(params: {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  solAmount: number;
  quote: TradeQuote;
  marketCapUsd: number | null;
}): GuestExecuteResult {
  const { mint, name, symbol, logo, solAmount, quote, marketCapUsd } = params;

  if (!Number.isFinite(solAmount) || solAmount < GUEST_MIN_TRADE_SOL) {
    return { ok: false, error: `Minimum trade is ${GUEST_MIN_TRADE_SOL} SOL` };
  }
  if (!quote.ok) {
    return { ok: false, error: quote.error || "Trade not executed." };
  }
  const { solUsd, effectivePriceUsd, rawPriceUsd } = quote;
  if (
    ![effectivePriceUsd, solUsd].every((v) => Number.isFinite(v) && v > 0)
  ) {
    return { ok: false, error: "Price data unavailable. Trade not executed." };
  }
  if (current.balance < solAmount) {
    return { ok: false, error: "Insufficient paper balance" };
  }

  const amountInUsd = solAmount * solUsd;
  const price = effectivePriceUsd / solUsd; // SOL per token
  const tokensReceived = amountInUsd / effectivePriceUsd;
  const entryMc =
    marketCapUsd != null && Number.isFinite(marketCapUsd) && marketCapUsd > 0
      ? marketCapUsd
      : null;
  const now = Math.floor(Date.now() / 1000);

  const positions = current.positions.slice();
  const existingIdx = positions.findIndex((p) => p.token_mint === mint);

  if (existingIdx === -1 && positions.length >= GUEST_MAX_POSITIONS) {
    return {
      ok: false,
      error: `Maximum of ${GUEST_MAX_POSITIONS} open positions reached`,
    };
  }

  let nextId = current.nextId;

  if (existingIdx >= 0) {
    const ex = positions[existingIdx];
    const totalTokens = ex.total_tokens + tokensReceived;
    const totalSpent = ex.total_sol_spent + solAmount;
    let newEntryMc = ex.entry_market_cap;
    if (entryMc != null) {
      newEntryMc =
        ex.entry_market_cap != null
          ? (ex.entry_market_cap * ex.total_sol_spent + entryMc * solAmount) /
            totalSpent
          : entryMc;
    }
    positions[existingIdx] = {
      ...ex,
      total_tokens: totalTokens,
      total_sol_spent: totalSpent,
      avg_entry_price: totalSpent / totalTokens,
      entry_market_cap: newEntryMc,
    };
  } else {
    positions.push({
      id: nextId++,
      token_mint: mint,
      token_name: name,
      token_symbol: symbol,
      token_logo: logo,
      total_tokens: tokensReceived,
      total_sol_spent: solAmount,
      avg_entry_price: solAmount / tokensReceived,
      entry_market_cap: entryMc,
      opened_at: now,
    });
  }

  const trade: GuestTrade = {
    id: nextId++,
    token_mint: mint,
    token_name: name,
    token_symbol: symbol,
    token_logo: logo,
    side: "buy",
    sol_amount: solAmount,
    token_amount: tokensReceived,
    price,
    pnl: null,
    executed_at: now,
    raw_price_usd: rawPriceUsd,
    effective_price_usd: effectivePriceUsd,
    slippage_percent: quote.slippagePercent,
    trade_impact_percent: quote.tradeImpactPercent,
    liquidity_usd_at_execution: quote.liquidityUsd,
    sol_usd_price_at_execution: solUsd,
    trade_usd_value: amountInUsd,
  };

  setState({
    ...current,
    balance: current.balance - solAmount,
    positions,
    trades: [...current.trades, trade],
    lastSolUsd: solUsd,
    nextId,
  });

  return {
    ok: true,
    trade: {
      side: "buy",
      mint,
      solAmount,
      tokenAmount: tokensReceived,
      price,
      pnl: null,
    },
    balance: current.balance,
  };
}

/**
 * Apply a sell of an explicit token amount using a server quote.
 */
export function guestSell(params: {
  mint: string;
  tokenAmount: number;
  quote: TradeQuote;
}): GuestExecuteResult {
  const { mint, tokenAmount, quote } = params;

  if (!quote.ok) {
    return { ok: false, error: quote.error || "Trade not executed." };
  }
  const positions = current.positions.slice();
  const idx = positions.findIndex((p) => p.token_mint === mint);
  if (idx === -1) {
    return { ok: false, error: "No open position for this token" };
  }
  const position = positions[idx];

  if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
    return { ok: false, error: "Invalid sell amount" };
  }
  if (tokenAmount > position.total_tokens * 1.0000001) {
    return { ok: false, error: "Cannot sell more than held" };
  }

  const { solUsd, effectivePriceUsd, rawPriceUsd } = quote;
  if (![effectivePriceUsd, solUsd].every((v) => Number.isFinite(v) && v > 0)) {
    return { ok: false, error: "Price data unavailable. Trade not executed." };
  }

  const price = effectivePriceUsd / solUsd; // SOL per token
  const tradeUsdValue = tokenAmount * rawPriceUsd;
  const solReceived = tokenAmount * price;
  const fraction = tokenAmount / position.total_tokens;
  const costBasis = position.total_sol_spent * fraction;
  const pnl = solReceived - costBasis;
  const now = Math.floor(Date.now() / 1000);

  const remainingTokens = position.total_tokens - tokenAmount;
  const remainingSpent = position.total_sol_spent - costBasis;
  if (remainingTokens <= position.total_tokens * 0.000001) {
    positions.splice(idx, 1);
  } else {
    positions[idx] = {
      ...position,
      total_tokens: remainingTokens,
      total_sol_spent: remainingSpent,
    };
  }

  let nextId = current.nextId;
  const trade: GuestTrade = {
    id: nextId++,
    token_mint: mint,
    token_name: position.token_name,
    token_symbol: position.token_symbol,
    token_logo: position.token_logo,
    side: "sell",
    sol_amount: solReceived,
    token_amount: tokenAmount,
    price,
    pnl,
    executed_at: now,
    raw_price_usd: rawPriceUsd,
    effective_price_usd: effectivePriceUsd,
    slippage_percent: quote.slippagePercent,
    trade_impact_percent: quote.tradeImpactPercent,
    liquidity_usd_at_execution: quote.liquidityUsd,
    sol_usd_price_at_execution: solUsd,
    trade_usd_value: tradeUsdValue,
  };

  setState({
    ...current,
    balance: current.balance + solReceived,
    positions,
    trades: [...current.trades, trade],
    lastSolUsd: solUsd,
    nextId,
  });

  return {
    ok: true,
    trade: { side: "sell", mint, solAmount: solReceived, tokenAmount, price, pnl },
    balance: current.balance,
  };
}

// --- Watchlist --------------------------------------------------------------

export function guestWatchAdd(item: {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
}) {
  const exists = current.watchlist.some((w) => w.mint === item.mint);
  const now = Math.floor(Date.now() / 1000);
  const watchlist = exists
    ? current.watchlist.map((w) =>
        w.mint === item.mint ? { ...w, ...item, added_at: now } : w,
      )
    : [...current.watchlist, { ...item, added_at: now }];
  setState({ ...current, watchlist });
}

export function guestWatchRemove(mint: string) {
  setState({
    ...current,
    watchlist: current.watchlist.filter((w) => w.mint !== mint),
  });
}

// --- Valuation + stats (display) -------------------------------------------

/**
 * Value guest open positions against live token prices. Mirrors the server's
 * valuePositions(): currentValueSol from the live SOL price, unrealized P&L,
 * and market-cap change since entry.
 */
export function useGuestValuedPositions(): {
  positions: Position[];
  solUsd: number;
  isLoading: boolean;
} {
  const state = useGuestStore();
  const mints = state.positions.map((p) => p.token_mint);

  const results = useQueries({
    queries: mints.map((mint) => ({
      queryKey: ["token", mint, null],
      queryFn: () => api.getToken(mint),
      refetchInterval: 15_000,
      staleTime: 10_000,
    })),
  });

  const byMint = new Map<string, (typeof results)[number]["data"]>();
  mints.forEach((m, i) => byMint.set(m, results[i]?.data));

  let solUsd = state.lastSolUsd;
  for (const info of byMint.values()) {
    if (info && info.priceUsd && info.priceSol && info.priceSol > 0) {
      solUsd = info.priceUsd / info.priceSol;
      break;
    }
  }

  const positions: Position[] = state.positions.map((p) => {
    const info = byMint.get(p.token_mint);
    const price = info?.priceSol ?? null;
    const currentMarketCapUsd = info?.marketCapUsd ?? null;
    const currentValueSol =
      price != null ? p.total_tokens * price : p.total_sol_spent;
    const unrealizedPnlSol = currentValueSol - p.total_sol_spent;
    const unrealizedPnlPercent =
      p.total_sol_spent > 0
        ? (unrealizedPnlSol / p.total_sol_spent) * 100
        : 0;
    const marketCapChangePercent =
      p.entry_market_cap != null &&
      p.entry_market_cap > 0 &&
      currentMarketCapUsd != null
        ? ((currentMarketCapUsd - p.entry_market_cap) / p.entry_market_cap) * 100
        : null;
    return {
      id: p.id,
      wallet: "guest",
      token_mint: p.token_mint,
      token_name: p.token_name,
      token_symbol: p.token_symbol,
      token_logo: p.token_logo,
      total_tokens: p.total_tokens,
      total_sol_spent: p.total_sol_spent,
      avg_entry_price: p.avg_entry_price,
      entry_market_cap: p.entry_market_cap,
      opened_at: p.opened_at,
      currentPriceSol: price,
      currentValueSol,
      unrealizedPnlSol,
      unrealizedPnlPercent,
      currentMarketCapUsd,
      marketCapChangePercent,
    };
  });

  return {
    positions,
    solUsd,
    isLoading: results.some((r) => r.isLoading),
  };
}

/** Trade history, newest first (mirrors server getHistory ordering). */
export function guestHistory(state: GuestState): Trade[] {
  return state.trades
    .slice()
    .sort((a, b) => b.executed_at - a.executed_at || b.id - a.id);
}

/** Watchlist valued against live prices via token info queries. */
export function useGuestWatchlist(): { watchlist: WatchItem[]; isLoading: boolean } {
  const state = useGuestStore();
  const mints = state.watchlist.map((w) => w.mint);

  const results = useQueries({
    queries: mints.map((mint) => ({
      queryKey: ["token", mint, null],
      queryFn: () => api.getToken(mint),
      refetchInterval: 30_000,
      staleTime: 20_000,
    })),
  });

  const watchlist: WatchItem[] = state.watchlist.map((w, i) => {
    const info = results[i]?.data;
    return {
      mint: w.mint,
      name: w.name,
      symbol: w.symbol,
      logo: w.logo,
      priceUsd: info?.priceUsd ?? null,
      priceSol: info?.priceSol ?? null,
      priceChange24h: info?.priceChange24h ?? null,
      marketCapUsd: info?.marketCapUsd ?? null,
    };
  });

  return { watchlist, isLoading: results.some((r) => r.isLoading) };
}

/**
 * Compute the guest PortfolioStats, mirroring the server's
 * getClosedTradeStats() + /portfolio/stats math exactly.
 */
export function computeGuestStats(
  state: GuestState,
  valued: Position[],
  solUsd: number,
): PortfolioStats {
  const sells = state.trades.filter(
    (t) => t.side === "sell" && t.pnl != null,
  );
  const closedTrades = sells.length;
  const winningTrades = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  const realizedPnl = sells.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const maxPnl = sells.length
    ? Math.max(...sells.map((t) => t.pnl ?? 0))
    : 0;
  const minPnl = sells.length
    ? Math.min(...sells.map((t) => t.pnl ?? 0))
    : 0;
  const executions = state.trades.length;

  // current streak: trailing consecutive winning sells (chronological).
  const chrono = sells
    .slice()
    .sort((a, b) => a.executed_at - b.executed_at || a.id - b.id);
  let streak = 0;
  for (const t of chrono) streak = (t.pnl ?? 0) > 0 ? streak + 1 : 0;

  const positionsValueSol = valued.reduce((s, p) => s + p.currentValueSol, 0);
  const unrealizedPnlSol = valued.reduce((s, p) => s + p.unrealizedPnlSol, 0);
  const equitySol = state.balance + positionsValueSol;
  const roi =
    ((equitySol - GUEST_STARTING_BALANCE) / GUEST_STARTING_BALANCE) * 100;

  return {
    wallet: "guest",
    balance: state.balance,
    equitySol,
    equityUsd: equitySol * solUsd,
    totalPnlSol: realizedPnl + unrealizedPnlSol,
    realizedPnlSol: realizedPnl,
    unrealizedPnlSol,
    roiPercent: roi,
    totalExecutions: executions,
    closedTrades,
    winningTrades,
    winRate: closedTrades > 0 ? (winningTrades / closedTrades) * 100 : 0,
    bestTrade: maxPnl > 0 ? maxPnl : null,
    worstTrade: minPnl < 0 ? minPnl : 0,
    currentStreak: streak,
    participationPoints: 0,
    graduationTier: graduationTier(realizedPnl),
    openPositions: valued.length,
    solUsd,
  };
}
