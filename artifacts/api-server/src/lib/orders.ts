import { dbAll, dbGet, dbRun } from "./database.js";
import { executeSell, type ValuedPosition } from "./trading.js";

/**
 * Advanced orders (phase 1): take-profit / stop-loss SELL orders attached to an
 * existing paper position. They are evaluated on every positions-refresh against
 * the current market cap / price that valuePositions() already fetched, so the
 * trigger check adds ZERO new external API calls. A fill reuses the same
 * executeSell() path a manual sell uses (and inherits its transactional safety
 * and duplicate-window guard), so a failed fill never corrupts the portfolio.
 *
 * Out of scope: buy limits, OCO, ladders, cron/background workers, push.
 */

export type OrderType = "take_profit" | "stop_loss";
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

export interface OrderFill {
  orderId: number;
  orderType: OrderType;
  tokenMint: string;
  tokenSymbol: string | null;
  percent: number;
  triggerType: TriggerType;
  triggerValue: number;
  fillMarketCap: number | null;
  fillPrice: number | null;
  pnl: number | null;
}

const EPOCH = "EXTRACT(EPOCH FROM NOW())::bigint";
// A claimed-but-not-finished ('filling') order older than this is considered
// abandoned (e.g. the process died mid-fill) and is reset to 'pending' so it can
// be retried. There are no background workers, so recovery happens lazily on the
// next evaluation pass.
const FILLING_STALE_SECONDS = 60;

function isOrderType(v: unknown): v is OrderType {
  return v === "take_profit" || v === "stop_loss";
}
function isTriggerType(v: unknown): v is TriggerType {
  return v === "market_cap" || v === "price";
}

/**
 * Create a TP/SL order. Requires an open position for the mint — phase 1 orders
 * only ever EXIT an existing position, never open one, and are created by the
 * client only after a successful manual buy.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<{ ok: boolean; error?: string; order?: PaperOrder }> {
  const wallet = String(input.wallet || "").trim();
  const mint = String(input.mint || "").trim();
  if (!wallet || !mint) {
    return { ok: false, error: "wallet and mint are required" };
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
 * Evaluate all pending orders for a wallet against the already-valued positions
 * (no new price fetches for the check). Returns the orders that filled this pass
 * so the caller can surface a toast. Concurrency-safe: each order is claimed via
 * a conditional UPDATE before the sell, so two overlapping refreshes cannot
 * double-fill. A failed sell reverts the order to 'pending' for a later retry.
 */
export async function evaluateOrders(
  wallet: string,
  valued: ValuedPosition[],
): Promise<OrderFill[]> {
  // Lazily recover orders that were claimed but never finished (process died
  // mid-fill) so they are not stuck forever without a background worker.
  await dbRun(
    `UPDATE paper_orders
       SET status = 'pending', updated_at = ${EPOCH}
     WHERE wallet = $1 AND status = 'filling'
       AND updated_at < ${EPOCH} - $2`,
    [wallet, FILLING_STALE_SECONDS],
  );

  const pending = await dbAll<PaperOrder>(
    "SELECT * FROM paper_orders WHERE wallet = $1 AND status = 'pending'",
    [wallet],
  );
  if (pending.length === 0) return [];

  const byMint = new Map<string, ValuedPosition>();
  for (const p of valued) byMint.set(p.token_mint, p);

  const fills: OrderFill[] = [];

  for (const order of pending) {
    const pos = byMint.get(order.token_mint);

    // Position fully closed (e.g. sold manually): the order can never fill, so
    // cancel it rather than leaving it dangling.
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

    // Mark that we looked, even when we cannot evaluate yet (no live value).
    await dbRun(
      `UPDATE paper_orders SET last_checked_at = ${EPOCH} WHERE id = $1`,
      [order.id],
    );

    if (current == null || !Number.isFinite(current)) continue;
    if (!triggerMet(order.trigger_direction, current, order.trigger_value)) {
      continue;
    }

    // Claim the order so a concurrent refresh cannot also fill it.
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
      // Fill failed (e.g. transient price unavailability): revert to pending so
      // it retries on a later refresh. The portfolio is untouched.
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
