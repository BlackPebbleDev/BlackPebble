import { useSyncExternalStore } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  api,
  type Position,
  type Trade,
  type WatchItem,
  type PortfolioStats,
  type TradeQuote,
  type PaperOrder,
  type OrderFill,
  type OrderType,
  type TriggerType,
  type TriggerDirection,
} from "@/lib/api";
import { tierFromRealizedPnl } from "@/lib/tiers";

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
// Mirror of the server's MAX_SUPPLY_PCT (anti-whale cap) for guest-local buys.
export const GUEST_MAX_SUPPLY_PCT = 0.04;

const STORAGE_KEY = "bp_guest_state_v1";
const DISMISS_KEY = "bp_guest_migration_dismissed_v1";

function graduationTier(allTimePnl: number): string {
  return tierFromRealizedPnl(allTimePnl);
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
  // Slippage-free market cost basis (SOL); mirrors the server column. Older
  // guest states may lack it (load() backfills to total_sol_spent).
  cost_basis_market_sol: number;
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

export interface GuestOrderRow {
  id: number;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  order_type: OrderType;
  trigger_type: TriggerType;
  trigger_value: number;
  trigger_direction: TriggerDirection;
  amount_value: number;
  status: string;
  created_at: number;
  updated_at: number;
  filled_at: number | null;
  fill_market_cap: number | null;
  fill_price: number | null;
  fill_reason: string | null;
}

export interface GuestState {
  balance: number;
  positions: GuestPositionRow[];
  trades: GuestTrade[];
  watchlist: GuestWatchRow[];
  orders: GuestOrderRow[];
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
    orders: [],
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
      // Backfill the slippage-free cost basis on legacy guest states that
      // predate the column, so the P&L split (#8) never reads undefined.
      positions: (parsed.positions ?? []).map((p) => ({
        ...p,
        cost_basis_market_sol:
          p.cost_basis_market_sol ?? p.total_sol_spent,
      })),
      trades: parsed.trades ?? [],
      watchlist: parsed.watchlist ?? [],
      orders: parsed.orders ?? [],
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
  // Slippage-free market cost basis added by this buy (#8): tokens valued at the
  // RAW mid price, mirroring the server's executeBuy (tokensReceived*priceSol).
  const marketCostAddSol = tokensReceived * (rawPriceUsd / solUsd);
  const entryMc =
    marketCapUsd != null && Number.isFinite(marketCapUsd) && marketCapUsd > 0
      ? marketCapUsd
      : null;
  const now = Math.floor(Date.now() / 1000);

  const positions = current.positions.slice();
  const existingIdx = positions.findIndex((p) => p.token_mint === mint);

  // Anti-whale supply cap: mirror the server's executeBuy so cumulative guest
  // buys cannot exceed MAX_SUPPLY_PCT of the token's supply. The /trade/quote
  // endpoint can't enforce this for guests (no wallet, so it assumes held = 0),
  // so we enforce the cumulative cap here against the guest's existing holding.
  const supplyPriceUsd = rawPriceUsd;
  if (
    entryMc != null &&
    Number.isFinite(supplyPriceUsd) &&
    supplyPriceUsd > 0
  ) {
    const supply = entryMc / supplyPriceUsd;
    if (Number.isFinite(supply) && supply > 0) {
      const maxTokens = supply * GUEST_MAX_SUPPLY_PCT;
      const held =
        existingIdx >= 0 ? positions[existingIdx].total_tokens : 0;
      if (held + tokensReceived > maxTokens) {
        const pct = (GUEST_MAX_SUPPLY_PCT * 100)
          .toFixed(1)
          .replace(/\.0$/, "");
        return {
          ok: false,
          error: `Position limit reached: a single trader can hold at most ${pct}% of ${
            symbol || "this token"
          }'s supply. Reduce your order size.`,
        };
      }
    }
  }

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
      cost_basis_market_sol:
        (ex.cost_basis_market_sol ?? ex.total_sol_spent) + marketCostAddSol,
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
      cost_basis_market_sol: marketCostAddSol,
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
  source?: string | null;
}): GuestExecuteResult {
  const { mint, tokenAmount, quote, source } = params;

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
  // Reduce the slippage-free market cost basis (#8) proportionally, mirroring
  // the server's executeSell.
  const remainingCostBasisMarket =
    (position.cost_basis_market_sol ?? position.total_sol_spent) *
    (1 - fraction);
  if (remainingTokens <= position.total_tokens * 0.000001) {
    positions.splice(idx, 1);
  } else {
    positions[idx] = {
      ...position,
      total_tokens: remainingTokens,
      total_sol_spent: remainingSpent,
      cost_basis_market_sol: remainingCostBasisMarket,
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
    source: source ?? null,
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

// --- Advanced orders (TP/SL), guest parity ---------------------------------

function updateGuestOrder(id: number, patch: Partial<GuestOrderRow>) {
  const now = Math.floor(Date.now() / 1000);
  setState({
    ...current,
    orders: current.orders.map((o) =>
      o.id === id ? { ...o, ...patch, updated_at: now } : o,
    ),
  });
}

const GUEST_BUY_LIMIT_CAP = 5;

/**
 * Create a guest buy-limit order. No existing position required. The order
 * fires when the token's market cap drops to or below triggerMc. Guest buy
 * limits are evaluated on the trading page when the token's current MC is
 * available (the token info query already fetches it).
 */
export function guestCreateBuyLimitOrder(params: {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  triggerMc: number;
  solAmount: number;
}): { ok: boolean; error?: string; order?: GuestOrderRow } {
  if (!Number.isFinite(params.triggerMc) || params.triggerMc <= 0) {
    return { ok: false, error: "triggerMc must be a positive number" };
  }
  if (!Number.isFinite(params.solAmount) || params.solAmount < 0.1) {
    return { ok: false, error: "solAmount must be at least 0.1 SOL" };
  }
  const active = current.orders.filter(
    (o) =>
      o.order_type === "buy_limit" &&
      (o.status === "pending" || o.status === "filling"),
  ).length;
  if (active >= GUEST_BUY_LIMIT_CAP) {
    return {
      ok: false,
      error: `You can have at most ${GUEST_BUY_LIMIT_CAP} active buy limit orders. Cancel one to add another.`,
    };
  }
  const now = Math.floor(Date.now() / 1000);
  let nextId = current.nextId;
  const order: GuestOrderRow = {
    id: nextId++,
    token_mint: params.mint,
    token_symbol: params.symbol ?? null,
    token_name: params.name ?? null,
    order_type: "buy_limit",
    trigger_type: "market_cap",
    trigger_value: params.triggerMc,
    trigger_direction: "lte",
    amount_value: params.solAmount,
    status: "pending",
    created_at: now,
    updated_at: now,
    filled_at: null,
    fill_market_cap: null,
    fill_price: null,
    fill_reason: null,
  };
  setState({ ...current, orders: [...current.orders, order], nextId });
  return { ok: true, order };
}

/** Create a guest TP/SL order. Requires an open guest position for the mint. */
export function guestCreateOrder(params: {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  orderType: OrderType;
  triggerType: TriggerType;
  triggerValue: number;
  amountPercent: number;
}): { ok: boolean; error?: string; order?: GuestOrderRow } {
  const { mint, orderType, triggerType, triggerValue, amountPercent } = params;
  if (!Number.isFinite(triggerValue) || triggerValue <= 0) {
    return { ok: false, error: "triggerValue must be a positive number" };
  }
  if (!Number.isFinite(amountPercent) || amountPercent <= 0 || amountPercent > 100) {
    return { ok: false, error: "amountPercent must be between 1 and 100" };
  }
  const pos = current.positions.find((p) => p.token_mint === mint);
  if (!pos) {
    return { ok: false, error: "No open position to attach this order to." };
  }
  const now = Math.floor(Date.now() / 1000);
  let nextId = current.nextId;
  const order: GuestOrderRow = {
    id: nextId++,
    token_mint: mint,
    token_symbol: params.symbol ?? pos.token_symbol,
    token_name: params.name ?? pos.token_name,
    order_type: orderType,
    trigger_type: triggerType,
    trigger_value: triggerValue,
    trigger_direction: orderType === "take_profit" ? "gte" : "lte",
    amount_value: amountPercent,
    status: "pending",
    created_at: now,
    updated_at: now,
    filled_at: null,
    fill_market_cap: null,
    fill_price: null,
    fill_reason: null,
  };
  setState({ ...current, orders: [...current.orders, order], nextId });
  return { ok: true, order };
}

export function guestCancelOrder(id: number): { ok: boolean; error?: string } {
  const order = current.orders.find((o) => o.id === id);
  if (!order || (order.status !== "pending" && order.status !== "filling")) {
    return { ok: false, error: "Order not found or not cancellable" };
  }
  updateGuestOrder(id, { status: "canceled" });
  return { ok: true };
}

/** Map a guest order row to the shared PaperOrder shape for the UI. */
export function guestOrderToPaperOrder(o: GuestOrderRow): PaperOrder {
  const isBuyLimit = o.order_type === "buy_limit";
  return {
    id: o.id,
    wallet: "guest",
    token_mint: o.token_mint,
    token_symbol: o.token_symbol,
    token_name: o.token_name,
    order_type: o.order_type,
    side: isBuyLimit ? "buy" : "sell",
    trigger_type: o.trigger_type,
    trigger_value: o.trigger_value,
    trigger_direction: o.trigger_direction,
    amount_type: isBuyLimit ? "sol" : "percent_position",
    amount_value: o.amount_value,
    status: o.status,
    linked_group_id: null,
    linked_trade_plan: null,
    created_at: o.created_at,
    updated_at: o.updated_at,
    last_checked_at: null,
    filled_at: o.filled_at,
    fill_market_cap: o.fill_market_cap,
    fill_price: o.fill_price,
    fill_reason: o.fill_reason,
  };
}

/** Active (pending/filling) guest orders for a mint, as PaperOrder[]. */
export function guestActiveOrders(
  state: GuestState,
  mint?: string,
): PaperOrder[] {
  return state.orders
    .filter(
      (o) =>
        (o.status === "pending" || o.status === "filling") &&
        (mint ? o.token_mint === mint : true),
    )
    .sort((a, b) => b.created_at - a.created_at)
    .map(guestOrderToPaperOrder);
}

// Guard against overlapping async evaluation passes (each fill awaits a quote).
let guestEvalInFlight = false;

/**
 * Evaluate pending guest orders against already-valued positions. Mirrors the
 * server: the trigger CHECK uses the values useGuestValuedPositions already
 * fetched (zero new calls); a fill fetches one sell quote (same as a manual
 * sell) and routes through guestSell so a failed fill never corrupts the local
 * portfolio. Returns the orders that filled this pass for toasting.
 */
export async function evaluateGuestOrders(
  valued: Position[],
): Promise<OrderFill[]> {
  if (guestEvalInFlight) return [];
  const pending = current.orders.filter((o) => o.status === "pending");
  if (pending.length === 0) return [];

  guestEvalInFlight = true;
  const fills: OrderFill[] = [];
  try {
    const byMint = new Map(valued.map((p) => [p.token_mint, p]));
    for (const order of pending) {
      // Re-check status: an earlier iteration / external change may have moved it.
      const live = current.orders.find((o) => o.id === order.id);
      if (!live || live.status !== "pending") continue;

      // -----------------------------------------------------------------------
      // Buy-limit branch: no existing position required.
      // Evaluated against the current MC if the token happens to be in valued
      // positions (user already holds it); otherwise skipped until live data is
      // available. We never cancel buy limits for "no position".
      // -----------------------------------------------------------------------
      if (order.order_type === "buy_limit") {
        const pos = byMint.get(order.token_mint);
        const curMc = pos?.currentMarketCapUsd ?? null;
        // No live market-cap data for this token yet — skip, don't cancel.
        if (curMc == null || !Number.isFinite(curMc)) continue;
        // buy_limit triggers when MC drops to or below the target.
        if (curMc > order.trigger_value) continue;

        updateGuestOrder(order.id, { status: "filling" });
        try {
          const quote = await api.quote({
            mint: order.token_mint,
            side: "buy",
            solAmount: order.amount_value,
          });
          const res = guestBuy({
            mint: order.token_mint,
            symbol: order.token_symbol,
            name: order.token_name,
            logo: null,
            solAmount: order.amount_value,
            quote,
            marketCapUsd: curMc,
          });
          if (res.ok) {
            updateGuestOrder(order.id, {
              status: "filled",
              filled_at: Math.floor(Date.now() / 1000),
              fill_market_cap: curMc,
              fill_price: pos?.currentPriceSol ?? null,
              fill_reason: "triggered",
            });
            fills.push({
              orderId: order.id,
              orderType: order.order_type,
              tokenMint: order.token_mint,
              tokenSymbol: order.token_symbol,
              percent: 0,
              triggerType: order.trigger_type,
              triggerValue: order.trigger_value,
              fillMarketCap: curMc,
              fillPrice: pos?.currentPriceSol ?? null,
              pnl: null,
              solAmount: order.amount_value,
            });
          } else {
            updateGuestOrder(order.id, {
              status: "pending",
              fill_reason: (res.error ?? "fill_failed").slice(0, 200),
            });
          }
        } catch (e) {
          updateGuestOrder(order.id, {
            status: "pending",
            fill_reason:
              e instanceof Error ? e.message.slice(0, 200) : "fill_failed",
          });
        }
        continue; // Do not fall through to the TP/SL path.
      }

      // -----------------------------------------------------------------------
      // TP/SL branch: requires an open position.
      // -----------------------------------------------------------------------
      const pos = byMint.get(order.token_mint);
      if (!pos) {
        updateGuestOrder(order.id, {
          status: "canceled",
          fill_reason: "position_closed",
        });
        continue;
      }
      const cur =
        order.trigger_type === "market_cap"
          ? pos.currentMarketCapUsd
          : pos.currentPriceSol;
      if (cur == null || !Number.isFinite(cur)) continue;
      const met =
        order.trigger_direction === "gte"
          ? cur >= order.trigger_value
          : cur <= order.trigger_value;
      if (!met) continue;

      updateGuestOrder(order.id, { status: "filling" });
      const tokenAmount = pos.total_tokens * (order.amount_value / 100);
      try {
        const quote = await api.quote({
          mint: order.token_mint,
          side: "sell",
          tokenAmount,
        });
        const res = guestSell({
          mint: order.token_mint,
          tokenAmount,
          quote,
          source: order.order_type,
        });
        if (res.ok) {
          updateGuestOrder(order.id, {
            status: "filled",
            filled_at: Math.floor(Date.now() / 1000),
            fill_market_cap: pos.currentMarketCapUsd,
            fill_price: pos.currentPriceSol,
            fill_reason: "triggered",
          });
          fills.push({
            orderId: order.id,
            orderType: order.order_type,
            tokenMint: order.token_mint,
            tokenSymbol: order.token_symbol,
            percent: order.amount_value,
            triggerType: order.trigger_type,
            triggerValue: order.trigger_value,
            fillMarketCap: pos.currentMarketCapUsd,
            fillPrice: pos.currentPriceSol,
            pnl: res.trade?.pnl ?? null,
          });
        } else {
          updateGuestOrder(order.id, {
            status: "pending",
            fill_reason: (res.error ?? "fill_failed").slice(0, 200),
          });
        }
      } catch (e) {
        updateGuestOrder(order.id, {
          status: "pending",
          fill_reason: e instanceof Error ? e.message.slice(0, 200) : "fill_failed",
        });
      }
    }
  } finally {
    guestEvalInFlight = false;
  }
  return fills;
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
export function useGuestValuedPositions(opts?: {
  /**
   * When true, this hook only OBSERVES the shared token-info cache (populated by
   * the Trading/Portfolio pages) and never initiates its own fetches. Used by
   * the global fill-toast hook so it adds zero new external API calls — guest
   * fills can only happen while a page is already polling token data anyway.
   */
  observeOnly?: boolean;
}): {
  positions: Position[];
  solUsd: number;
  isLoading: boolean;
} {
  const observeOnly = opts?.observeOnly ?? false;
  const state = useGuestStore();
  const mints = state.positions.map((p) => p.token_mint);

  const results = useQueries({
    queries: mints.map((mint) => ({
      queryKey: ["token", mint, null],
      queryFn: () => api.getToken(mint),
      enabled: !observeOnly,
      refetchInterval: observeOnly ? (false as const) : 15_000,
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
    // P&L split (#8), mirroring the server's valuePositions().
    const costBasisMarketSol = p.cost_basis_market_sol ?? p.total_sol_spent;
    const tradingCostsSol = costBasisMarketSol - p.total_sol_spent;
    const unrealizedPnlMarketSol = currentValueSol - costBasisMarketSol;
    const netResultSol = unrealizedPnlSol;
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
      costBasisMarketSol,
      unrealizedPnlMarketSol,
      tradingCostsSol,
      netResultSol,
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
