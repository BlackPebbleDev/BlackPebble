import { dbAll, dbGet, dbRun } from "./database.js";
import { executeSell, executeBuy, type ValuedPosition } from "./trading.js";
import { getTokenInfo } from "./prices.js";

/**
 * Advanced orders — phase 1: take-profit / stop-loss SELL orders attached to
 * an existing paper position, evaluated on every positions-refresh.
 *
 * Phase 2: buy_limit BUY orders, evaluated on a separate polling path
 * (GET /trade/buy-limits/check/:wallet) so the check fires for tokens the user
 * does NOT hold. Each fill routes through executeBuy() so slippage / supply
 * caps apply identically to manual buys.
 *
 * A per-user cap (BUY_LIMIT_CAP = 5) bounds the number of tokens we must poll
 * price data for on each check.
 */

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

export interface CreateOrderInput {
  wallet: string;
  mint: string;
  symbol?: string | null;
  name?: string | null;
  orderType: OrderType;
  triggerType: TriggerType;
  triggerValue: number;
  amountPercent: number;
}

export interface CreateBuyLimitInput {
  wallet: string;
  mint: string;
  symbol?: string | null;
  name?: string | null;
  /** Buy when market cap drops to or below this value (USD). */
  triggerMc: number;
  /** How many SOL to spend when the order fills. Min 0.1 SOL. */
  solAmount: number;
}

export interface OrderFill {
  orderId: number;
  orderType: OrderType;
  tokenMint: string;
  tokenSymbol: string | null;
  percent: number;
  /** SOL amount spent — populated for buy_limit fills, null for TP/SL. */
  solAmount?: number | null;
  triggerType: TriggerType;
  triggerValue: number;
  fillMarketCap: number | null;
  fillPrice: number | null;
  pnl: number | null;
}

const EPOCH = "EXTRACT(EPOCH FROM NOW())::bigint";
const FILLING_STALE_SECONDS = 60;

/** Maximum concurrent active buy limit orders per wallet. */
export const BUY_LIMIT_CAP = 5;

function isOrderType(v: unknown): v is OrderType {
  return v === "take_profit" || v === "stop_loss" || v === "buy_limit";
}
function isTriggerType(v: unknown): v is TriggerType {
  return v === "market_cap" || v === "price";
}

/**
 * Create a TP/SL order. Requires an open position for the mint — phase 1
 * orders only ever EXIT an existing position.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<{ ok: boolean; error?: string; order?: PaperOrder }> {
  const wallet = String(input.wallet || "").trim();
  const mint = String(input.mint || "").trim();
  if (!wallet || !mint) {
    return { ok: false, error: "wallet and mint are required" };
  }
  if (input.orderType === "buy_limit") {
    return { ok: false, error: "Use createBuyLimitOrder for buy_limit orders" };
  }
  if (!isOrderType(input.orderType)) {
    return { ok: false, error: "orderType must be take_profit or stop_loss" };
  }
  if (!isTriggerType(input.triggerType)) {
    return { ok: false, error: "triggerType must be market_cap or price" };
  }
  const triggerValue = Number(input.triggerValue);
  if (!Number.isFinite(triggerValue) || triggerValue <= 0) {
    return { ok: false, error: "triggerValue must be a positive number" };
  }
  const amountPercent = Number(input.amountPercent);
  if (!Number.isFinite(amountPercent) || amountPercent <= 0 || amountPercent > 100) {
    return { ok: false, error: "amountPercent must be between 1 and 100" };
  }

  const position = await dbGet(
    "SELECT id FROM positions WHERE wallet = $1 AND token_mint = $2",
    [wallet, mint],
  );
  if (!position) {
    return { ok: false, error: "No open position to attach this order to." };
  }

  const direction: TriggerDirection =
    input.orderType === "take_profit" ? "gte" : "lte";

  const order = await dbGet<PaperOrder>(
    `INSERT INTO paper_orders
       (wallet, token_mint, token_symbol, token_name, order_type, side,
        trigger_type, trigger_value, trigger_direction, amount_type, amount_value,
        status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'sell', $6, $7, $8, 'percent_position', $9,
        'pending', ${EPOCH}, ${EPOCH})
     RETURNING *`,
    [
      wallet,
      mint,
      input.symbol ?? null,
      input.name ?? null,
      input.orderType,
      input.triggerType,
      triggerValue,
      direction,
      amountPercent,
    ],
  );
  return { ok: true, order };
}

/**
 * Create a buy-limit order. No existing position is required. When the token's
 * market cap drops to or below `triggerMc`, the server auto-buys `solAmount`
 * SOL worth of the token through executeBuy() (slippage / supply caps apply).
 *
 * Capped at BUY_LIMIT_CAP active orders per wallet to bound the polling cost.
 */
export async function createBuyLimitOrder(
  input: CreateBuyLimitInput,
): Promise<{ ok: boolean; error?: string; order?: PaperOrder }> {
  const wallet = String(input.wallet || "").trim();
  const mint = String(input.mint || "").trim();
  if (!wallet || !mint) {
    return { ok: false, error: "wallet and mint are required" };
  }
  const triggerMc = Number(input.triggerMc);
  if (!Number.isFinite(triggerMc) || triggerMc <= 0) {
    return { ok: false, error: "triggerMc must be a positive number" };
  }
  const solAmount = Number(input.solAmount);
  if (!Number.isFinite(solAmount) || solAmount < 0.1) {
    return { ok: false, error: "solAmount must be at least 0.1 SOL" };
  }

  const countRow = await dbGet<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM paper_orders
     WHERE wallet = $1 AND order_type = 'buy_limit' AND status IN ('pending', 'filling')`,
    [wallet],
  );
  const active = parseInt(countRow?.count ?? "0", 10);
  if (active >= BUY_LIMIT_CAP) {
    return {
      ok: false,
      error: `You can have at most ${BUY_LIMIT_CAP} active buy limit orders. Cancel one to add another.`,
    };
  }

  const order = await dbGet<PaperOrder>(
    `INSERT INTO paper_orders
       (wallet, token_mint, token_symbol, token_name, order_type, side,
        trigger_type, trigger_value, trigger_direction, amount_type, amount_value,
        status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'buy_limit', 'buy', 'market_cap', $5, 'lte', 'sol', $6,
        'pending', ${EPOCH}, ${EPOCH})
     RETURNING *`,
    [
      wallet,
      mint,
      input.symbol ?? null,
      input.name ?? null,
      triggerMc,
      solAmount,
    ],
  );
  return { ok: true, order };
}

/** Active (pending/filling) orders for a wallet, optionally for one mint. */
export async function listOrders(
  wallet: string,
  mint?: string,
): Promise<PaperOrder[]> {
  if (mint) {
    return dbAll<PaperOrder>(
      `SELECT * FROM paper_orders
       WHERE wallet = $1 AND token_mint = $2 AND status IN ('pending', 'filling')
       ORDER BY created_at DESC`,
      [wallet, mint],
    );
  }
  return dbAll<PaperOrder>(
    `SELECT * FROM paper_orders
     WHERE wallet = $1 AND status IN ('pending', 'filling')
     ORDER BY created_at DESC`,
    [wallet],
  );
}

/** Cancel a pending order owned by the wallet. Idempotent. */
export async function cancelOrder(
  wallet: string,
  id: number,
): Promise<{ ok: boolean; error?: string }> {
  const row = await dbGet<{ id: number }>(
    `UPDATE paper_orders
       SET status = 'canceled', updated_at = ${EPOCH}
     WHERE id = $1 AND wallet = $2 AND status IN ('pending', 'filling')
     RETURNING id`,
    [id, wallet],
  );
  if (!row) {
    return { ok: false, error: "Order not found or not cancellable" };
  }
  return { ok: true };
}

function triggerMet(
  direction: TriggerDirection,
  current: number,
  target: number,
): boolean {
  return direction === "gte" ? current >= target : current <= target;
}

/**
 * Evaluate all pending TP/SL orders for a wallet against the already-valued
 * positions (no new price fetches for the check). Returns filled orders for
 * toasting. Concurrency-safe via conditional UPDATE claiming.
 */
export async function evaluateOrders(
  wallet: string,
  valued: ValuedPosition[],
): Promise<OrderFill[]> {
  await dbRun(
    `UPDATE paper_orders
       SET status = 'pending', updated_at = ${EPOCH}
     WHERE wallet = $1 AND status = 'filling'
       AND order_type IN ('take_profit', 'stop_loss')
       AND updated_at < ${EPOCH} - $2`,
    [wallet, FILLING_STALE_SECONDS],
  );

  const pending = await dbAll<PaperOrder>(
    `SELECT * FROM paper_orders
     WHERE wallet = $1 AND status = 'pending'
       AND order_type IN ('take_profit', 'stop_loss')`,
    [wallet],
  );
  if (pending.length === 0) return [];

  const byMint = new Map<string, ValuedPosition>();
  for (const p of valued) byMint.set(p.token_mint, p);

  const fills: OrderFill[] = [];

  for (const order of pending) {
    const pos = byMint.get(order.token_mint);

    if (!pos) {
      await dbRun(
        `UPDATE paper_orders
           SET status = 'canceled', updated_at = ${EPOCH},
               fill_reason = 'position_closed'
         WHERE id = $1 AND status = 'pending'`,
        [order.id],
      );
      continue;
    }

    const current =
      order.trigger_type === "market_cap"
        ? pos.currentMarketCapUsd
        : pos.currentPriceSol;

    await dbRun(
      `UPDATE paper_orders SET last_checked_at = ${EPOCH} WHERE id = $1`,
      [order.id],
    );

    if (current == null || !Number.isFinite(current)) continue;
    if (!triggerMet(order.trigger_direction, current, order.trigger_value)) {
      continue;
    }

    const claimed = await dbGet<{ id: number }>(
      `UPDATE paper_orders
         SET status = 'filling', updated_at = ${EPOCH}
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [order.id],
    );
    if (!claimed) continue;

    const res = await executeSell(wallet, order.token_mint, {
      percent: order.amount_value,
      source: order.order_type,
    });

    if (res.ok) {
      await dbRun(
        `UPDATE paper_orders
           SET status = 'filled', updated_at = ${EPOCH}, filled_at = ${EPOCH},
               fill_market_cap = $2, fill_price = $3, fill_reason = 'triggered'
         WHERE id = $1`,
        [order.id, pos.currentMarketCapUsd, pos.currentPriceSol],
      );
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
      await dbRun(
        `UPDATE paper_orders
           SET status = 'pending', updated_at = ${EPOCH},
               fill_reason = $2
         WHERE id = $1`,
        [order.id, (res.error ?? "fill_failed").slice(0, 200)],
      );
    }
  }

  return fills;
}

/**
 * Evaluate pending buy-limit orders for a wallet. Fetches current market cap
 * for each token via getTokenInfo() (30 s cache — the same data the markets
 * page already fetches, so the incremental cost is bounded by BUY_LIMIT_CAP).
 *
 * Called on a separate polling path (GET /trade/buy-limits/check/:wallet) so
 * it fires even for tokens the user does not currently hold, unlike the
 * TP/SL path that piggybacks on the positions-refresh.
 */
export async function evaluateBuyLimitOrders(
  wallet: string,
): Promise<OrderFill[]> {
  await dbRun(
    `UPDATE paper_orders
       SET status = 'pending', updated_at = ${EPOCH}
     WHERE wallet = $1 AND order_type = 'buy_limit' AND status = 'filling'
       AND updated_at < ${EPOCH} - $2`,
    [wallet, FILLING_STALE_SECONDS],
  );

  const pending = await dbAll<PaperOrder>(
    `SELECT * FROM paper_orders
     WHERE wallet = $1 AND order_type = 'buy_limit' AND status = 'pending'`,
    [wallet],
  );
  if (pending.length === 0) return [];

  const uniqueMints = [...new Set(pending.map((o) => o.token_mint))];
  const infoMap = new Map<
    string,
    { marketCapUsd: number | null; priceSol: number | null }
  >();
  for (const mint of uniqueMints) {
    try {
      const info = await getTokenInfo(mint);
      if (info) {
        infoMap.set(mint, {
          marketCapUsd: info.marketCapUsd,
          priceSol: info.priceSol,
        });
      }
    } catch {
      // Token info unavailable this pass — retry next poll.
    }
  }

  const fills: OrderFill[] = [];

  for (const order of pending) {
    const info = infoMap.get(order.token_mint);
    if (!info) continue;

    const currentMc = info.marketCapUsd;

    await dbRun(
      `UPDATE paper_orders SET last_checked_at = ${EPOCH} WHERE id = $1`,
      [order.id],
    );

    if (currentMc == null || !Number.isFinite(currentMc)) continue;
    // buy_limit always triggers lte: buy when MC ≤ trigger
    if (!triggerMet("lte", currentMc, order.trigger_value)) continue;

    const claimed = await dbGet<{ id: number }>(
      `UPDATE paper_orders
         SET status = 'filling', updated_at = ${EPOCH}
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [order.id],
    );
    if (!claimed) continue;

    const res = await executeBuy(wallet, order.token_mint, order.amount_value, {
      name: order.token_name,
      symbol: order.token_symbol,
      logo: null,
    });

    if (res.ok) {
      await dbRun(
        `UPDATE paper_orders
           SET status = 'filled', updated_at = ${EPOCH}, filled_at = ${EPOCH},
               fill_market_cap = $2, fill_price = $3, fill_reason = 'triggered'
         WHERE id = $1`,
        [order.id, currentMc, info.priceSol],
      );
      fills.push({
        orderId: order.id,
        orderType: "buy_limit",
        tokenMint: order.token_mint,
        tokenSymbol: order.token_symbol,
        percent: 0,
        solAmount: order.amount_value,
        triggerType: "market_cap",
        triggerValue: order.trigger_value,
        fillMarketCap: currentMc,
        fillPrice: info.priceSol,
        pnl: null,
      });
    } else {
      await dbRun(
        `UPDATE paper_orders
           SET status = 'pending', updated_at = ${EPOCH},
               fill_reason = $2
         WHERE id = $1`,
        [order.id, (res.error ?? "fill_failed").slice(0, 200)],
      );
    }
  }

  return fills;
}
