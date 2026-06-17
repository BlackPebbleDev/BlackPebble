import { dbAll, dbGet, dbRun, withTx } from "./database.js";
import { getExecutionPrice, getSolPriceUsd } from "./prices.js";
import { computeSlippage } from "./slippage.js";
import { maxTokensForSupply } from "./trading.js";
import { logger } from "./logger.js";

const DEV = process.env.NODE_ENV !== "production";
const EPOCH = "EXTRACT(EPOCH FROM NOW())::bigint";

// ── Leverage constants ──────────────────────────────────────────────────────
/** Allowed leverage multipliers (longs only in Phase 1). */
export const ALLOWED_LEVERAGE = [2, 5, 10, 20] as const;
/** Minimum margin (SOL) — mirrors the spot MIN_TRADE_SOL. */
export const MIN_MARGIN_SOL = 0.1;
/** Per-wallet cap on simultaneously open leverage positions. */
export const MAX_LEVERAGE_POSITIONS = 10;
/**
 * Maintenance buffer: liquidates slightly EARLY so account equity can never go
 * negative. liquidation_drop_percent = (1 / leverage) − MAINTENANCE_BUFFER, so
 * the position is force-closed before the margin is fully wiped out.
 */
export const MAINTENANCE_BUFFER = 0.005;
/** A position stuck in 'closing' longer than this is released back to 'open'. */
const CLOSING_STALE_SECONDS = 60;
/** Per-position caps on manageable exit orders. */
export const MAX_LEVERAGE_TP = 4;
export const MAX_LEVERAGE_SL = 1;
/**
 * When a partial close would leave a remaining notional smaller than this (SOL),
 * finalize as a full close instead of leaving un-closable dust on the position.
 */
const DUST_NOTIONAL_SOL = 0.001;

export type LeverageDirection = "long";
export type CloseReason = "manual" | "take_profit" | "stop_loss" | "liquidated";
export type LeverageExitKind = "take_profit" | "stop_loss";

/** Liquidation level for a long, derived from entry + leverage + buffer. */
export function computeLiquidation(
  entryPriceSol: number,
  leverage: number,
): { liqDropPercent: number; liqPriceSol: number } {
  const liqDropPercent = 1 / leverage - MAINTENANCE_BUFFER;
  const liqPriceSol = entryPriceSol * (1 - liqDropPercent);
  return { liqDropPercent, liqPriceSol };
}

// ── Row + view types ────────────────────────────────────────────────────────
export interface LeveragePositionRow {
  id: number;
  wallet: string;
  token_mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  direction: string;
  leverage: number;
  margin_sol: number;
  notional_sol: number;
  tokens: number;
  entry_price_sol: number;
  entry_market_cap: number | null;
  liq_price_sol: number;
  liq_market_cap: number | null;
  tp_trigger_mc: number | null;
  sl_trigger_mc: number | null;
  status: string;
  realized_pnl_sol: number | null;
  exit_price_sol: number | null;
  exit_market_cap: number | null;
  close_reason: string | null;
  entry_slippage_percent: number | null;
  entry_trade_impact_percent: number | null;
  opened_at: number;
  updated_at: number;
  closed_at: number | null;
}

export interface ValuedLeveragePosition extends LeveragePositionRow {
  currentPriceSol: number | null;
  currentMarketCapUsd: number | null;
  /** (current − entry) / entry, as a fraction. Null when price unavailable. */
  priceMovePercent: number | null;
  /** notional × priceMovePercent (SOL). Null when price unavailable. */
  unrealizedPnlSol: number | null;
  /** unrealizedPnl / margin, as a fraction. Null when price unavailable. */
  roiOnMargin: number | null;
  /** Display-only position equity = margin + unrealized P&L. */
  positionEquitySol: number | null;
  marketCapChangePercent: number | null;
}

export interface LeverageTradeMeta {
  name?: string | null;
  symbol?: string | null;
  logo?: string | null;
}

export interface OpenLeverageResult {
  ok: boolean;
  error?: string;
  blocked?: boolean;
  position?: LeveragePositionRow;
  balance?: number;
}

export interface CloseLeverageResult {
  ok: boolean;
  error?: string;
  position?: LeveragePositionRow;
  realizedPnlSol?: number;
  reason?: CloseReason;
  balance?: number;
}

export interface LeverageFill {
  positionId: number;
  tokenMint: string;
  tokenSymbol: string | null;
  reason: CloseReason;
  exitPriceSol: number | null;
  exitMarketCap: number | null;
  realizedPnlSol: number | null;
}

/** A manageable take-profit / stop-loss order on an open leverage position. */
export interface LeverageExitOrderRow {
  id: number;
  position_id: number;
  wallet: string;
  token_mint: string;
  kind: string;
  trigger_mc: number;
  percent: number;
  status: string;
  created_at: number;
  updated_at: number;
  last_checked_at: number | null;
  filled_at: number | null;
  fill_market_cap: number | null;
  fill_price: number | null;
  fill_reason: string | null;
}

export interface ExitOrderResult {
  ok: boolean;
  error?: string;
  order?: LeverageExitOrderRow;
}

// ── Open ────────────────────────────────────────────────────────────────────
export async function openLeverage(opts: {
  wallet: string;
  mint: string;
  marginSol: number;
  leverage: number;
  meta: LeverageTradeMeta;
  tpTriggerMc?: number | null;
  slTriggerMc?: number | null;
}): Promise<OpenLeverageResult> {
  const { wallet, mint, marginSol, leverage, meta } = opts;

  if (!(ALLOWED_LEVERAGE as readonly number[]).includes(leverage)) {
    return { ok: false, error: "Leverage must be 2x, 5x, 10x, or 20x." };
  }
  if (!Number.isFinite(marginSol) || marginSol < MIN_MARGIN_SOL) {
    return { ok: false, error: `Minimum margin is ${MIN_MARGIN_SOL} SOL.` };
  }

  const px = await getExecutionPrice(mint);
  if (!px) {
    return { ok: false, error: "Price data unavailable. Position not opened." };
  }
  const { priceUsd, solUsd, liquidityUsd, marketCapUsd } = px;
  if (![priceUsd, solUsd].every((v) => Number.isFinite(v) && v > 0)) {
    return { ok: false, error: "Price data unavailable. Position not opened." };
  }

  const notionalSol = marginSol * leverage;
  const notionalUsd = notionalSol * solUsd;

  // Slippage / supply caps apply to the FULL notional, exactly like a spot buy.
  const slip = computeSlippage({
    side: "buy",
    rawPriceUsd: priceUsd,
    solUsd,
    liquidityUsd,
    tradeUsdValue: notionalUsd,
    marketCapUsd,
  });
  if (!slip.ok) {
    return { ok: false, error: slip.error, blocked: slip.blocked };
  }

  const effectivePriceUsd = slip.effectivePriceUsd;
  const entryPriceSol = effectivePriceUsd / solUsd;
  const tokens = notionalUsd / effectivePriceUsd;
  if (!Number.isFinite(entryPriceSol) || entryPriceSol <= 0 || !Number.isFinite(tokens) || tokens <= 0) {
    return { ok: false, error: "Price data unavailable. Position not opened." };
  }

  // Anti-whale supply cap on the leveraged token quantity.
  const maxTokens = maxTokensForSupply(marketCapUsd, priceUsd);
  if (maxTokens != null && tokens > maxTokens) {
    return {
      ok: false,
      error: "Position too large: it would exceed the per-trader supply cap. Reduce margin or leverage.",
      blocked: true,
    };
  }

  const entryMc =
    marketCapUsd != null && Number.isFinite(marketCapUsd) && marketCapUsd > 0
      ? marketCapUsd
      : null;
  const { liqPriceSol } = computeLiquidation(entryPriceSol, leverage);
  const liqMc = entryMc != null ? entryMc * (liqPriceSol / entryPriceSol) : null;

  const tpTriggerMc =
    opts.tpTriggerMc != null && Number.isFinite(opts.tpTriggerMc) && opts.tpTriggerMc > 0
      ? opts.tpTriggerMc
      : null;
  const slTriggerMc =
    opts.slTriggerMc != null && Number.isFinite(opts.slTriggerMc) && opts.slTriggerMc > 0
      ? opts.slTriggerMc
      : null;

  const now = Math.floor(Date.now() / 1000);

  if (DEV) {
    logger.debug(
      {
        symbol: meta.symbol,
        mint,
        marginSol,
        leverage,
        notionalSol,
        entryPriceSol,
        liqPriceSol,
        slippagePercent: slip.slippagePercent,
        tradeImpactPercent: slip.tradeImpactPercent,
      },
      "[leverage-debug] open",
    );
  }

  return withTx(async (c): Promise<OpenLeverageResult> => {
    const acct = await dbGet<{ paper_balance: number }>(
      "SELECT paper_balance FROM accounts WHERE wallet = $1 FOR UPDATE",
      [wallet],
      c,
    );
    if (!acct) {
      // No spot account yet — leverage requires a funded paper balance.
      return { ok: false, error: "No paper-trading account found for this wallet." };
    }
    if (acct.paper_balance < marginSol) {
      return { ok: false, error: "Insufficient paper balance for this margin." };
    }

    const count = await dbGet<{ c: number }>(
      "SELECT COUNT(*)::int AS c FROM paper_leverage_positions WHERE wallet = $1 AND status IN ('open','closing')",
      [wallet],
      c,
    );
    if ((count?.c ?? 0) >= MAX_LEVERAGE_POSITIONS) {
      return {
        ok: false,
        error: `Maximum of ${MAX_LEVERAGE_POSITIONS} open leverage positions reached.`,
      };
    }

    // Debit margin only. Leverage stats are kept fully separate from spot
    // accounts.realized_pnl / winning_trades / leaderboard (Key decision #2).
    await dbRun(
      "UPDATE accounts SET paper_balance = paper_balance - $1, last_active = $2 WHERE wallet = $3",
      [marginSol, now, wallet],
      c,
    );

    const inserted = await dbGet<LeveragePositionRow>(
      `INSERT INTO paper_leverage_positions
         (wallet, token_mint, token_name, token_symbol, token_logo, direction,
          leverage, margin_sol, notional_sol, tokens, entry_price_sol,
          entry_market_cap, liq_price_sol, liq_market_cap, tp_trigger_mc,
          sl_trigger_mc, status, entry_slippage_percent, entry_trade_impact_percent,
          opened_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'long',$6,$7,$8,$9,$10,$11,$12,$13,NULL,NULL,'open',$14,$15,${EPOCH},${EPOCH})
       RETURNING *`,
      [
        wallet,
        mint,
        meta.name ?? null,
        meta.symbol ?? null,
        meta.logo ?? null,
        leverage,
        marginSol,
        notionalSol,
        tokens,
        entryPriceSol,
        entryMc,
        liqPriceSol,
        liqMc,
        slip.slippagePercent,
        slip.tradeImpactPercent,
      ],
      c,
    );

    // Entry-time TP/SL are persisted as manageable exit-order rows (each closing
    // 100% of the remaining notional on trigger), NOT as the legacy write-once
    // tp_trigger_mc / sl_trigger_mc columns. The columns are retained in the
    // schema (left NULL here) only as a rollback path. The engine reads these
    // rows exclusively.
    if (tpTriggerMc != null) {
      await dbRun(
        `INSERT INTO paper_leverage_exit_orders
           (position_id, wallet, token_mint, kind, trigger_mc, percent, status,
            created_at, updated_at)
         VALUES ($1,$2,$3,'take_profit',$4,100,'pending',${EPOCH},${EPOCH})`,
        [inserted!.id, wallet, mint, tpTriggerMc],
        c,
      );
    }
    if (slTriggerMc != null) {
      await dbRun(
        `INSERT INTO paper_leverage_exit_orders
           (position_id, wallet, token_mint, kind, trigger_mc, percent, status,
            created_at, updated_at)
         VALUES ($1,$2,$3,'stop_loss',$4,100,'pending',${EPOCH},${EPOCH})`,
        [inserted!.id, wallet, mint, slTriggerMc],
        c,
      );
    }

    await dbRun(
      `INSERT INTO paper_leverage_trades
         (position_id, wallet, token_mint, token_name, token_symbol, token_logo,
          action, direction, leverage, margin_sol, notional_sol, tokens,
          price_sol, market_cap, pnl_sol, executed_at)
       VALUES ($1,$2,$3,$4,$5,$6,'open','long',$7,$8,$9,$10,$11,$12,NULL,${EPOCH})`,
      [
        inserted!.id,
        wallet,
        mint,
        meta.name ?? null,
        meta.symbol ?? null,
        meta.logo ?? null,
        leverage,
        marginSol,
        notionalSol,
        tokens,
        entryPriceSol,
        entryMc,
      ],
      c,
    );

    const after = await dbGet<{ paper_balance: number }>(
      "SELECT paper_balance FROM accounts WHERE wallet = $1",
      [wallet],
      c,
    );

    return { ok: true, position: inserted!, balance: after?.paper_balance };
  });
}

// ── Valuation ───────────────────────────────────────────────────────────────
export async function valueLeveragePositions(
  wallet: string,
): Promise<ValuedLeveragePosition[]> {
  const rows = await dbAll<LeveragePositionRow>(
    `SELECT * FROM paper_leverage_positions
     WHERE wallet = $1 AND status IN ('open','closing')
     ORDER BY opened_at DESC`,
    [wallet],
  );
  if (rows.length === 0) return [];

  // Fetch each distinct mint's price once.
  const mints = [...new Set(rows.map((r) => r.token_mint))];
  const priceByMint = new Map<string, { priceSol: number | null; mc: number | null }>();
  await Promise.all(
    mints.map(async (mint) => {
      try {
        const px = await getExecutionPrice(mint);
        priceByMint.set(mint, {
          priceSol: px ? px.priceSol : null,
          mc: px ? px.marketCapUsd : null,
        });
      } catch {
        priceByMint.set(mint, { priceSol: null, mc: null });
      }
    }),
  );

  return rows.map((p) => {
    const px = priceByMint.get(p.token_mint) ?? { priceSol: null, mc: null };
    const currentPriceSol = px.priceSol;
    const currentMarketCapUsd = px.mc;
    // P&L tracks the token's USD market-cap move — the same basis as the entry
    // MC, the chart (MCAP/USD), the TP/SL triggers and the Liq MC shown to the
    // trader. Fall back to the SOL-denominated price move only when market-cap
    // data is unavailable, so a long is never liquidated or marked down purely
    // because SOL/USD moved.
    const priceMovePercent =
      currentMarketCapUsd != null &&
      p.entry_market_cap != null &&
      p.entry_market_cap > 0
        ? (currentMarketCapUsd - p.entry_market_cap) / p.entry_market_cap
        : currentPriceSol != null && p.entry_price_sol > 0
          ? (currentPriceSol - p.entry_price_sol) / p.entry_price_sol
          : null;
    const unrealizedPnlSol =
      priceMovePercent != null ? p.notional_sol * priceMovePercent : null;
    const roiOnMargin =
      unrealizedPnlSol != null && p.margin_sol > 0
        ? unrealizedPnlSol / p.margin_sol
        : null;
    const positionEquitySol =
      unrealizedPnlSol != null ? p.margin_sol + unrealizedPnlSol : null;
    const marketCapChangePercent =
      p.entry_market_cap != null &&
      p.entry_market_cap > 0 &&
      currentMarketCapUsd != null
        ? ((currentMarketCapUsd - p.entry_market_cap) / p.entry_market_cap) * 100
        : null;
    return {
      ...p,
      currentPriceSol,
      currentMarketCapUsd,
      priceMovePercent,
      unrealizedPnlSol,
      roiOnMargin,
      positionEquitySol,
      marketCapChangePercent,
    };
  });
}

// ── Close (shared core) ─────────────────────────────────────────────────────
/**
 * Finalize a close for a single position. Claims the row (open → closing) inside
 * the transaction so concurrent refreshes cannot double-close, computes realized
 * P&L per the Key-decision balance model, credits the balance, marks the row,
 * and records a leverage trade.
 */
async function performClose(
  wallet: string,
  id: number,
  exitPriceSol: number,
  exitMarketCap: number | null,
  reason: CloseReason,
  fraction = 1,
): Promise<CloseLeverageResult> {
  const now = Math.floor(Date.now() / 1000);
  return withTx(async (c): Promise<CloseLeverageResult> => {
    const claimed = await dbGet<LeveragePositionRow>(
      `UPDATE paper_leverage_positions
         SET status = 'closing', updated_at = ${EPOCH}
       WHERE id = $1 AND wallet = $2 AND status = 'open'
       RETURNING *`,
      [id, wallet],
      c,
    );
    if (!claimed) {
      return { ok: false, error: "Position not found or not open." };
    }

    const margin = claimed.margin_sol;
    const notional = claimed.notional_sol;
    const tokens = claimed.tokens;
    const entry = claimed.entry_price_sol;

    // Liquidation always closes 100%. Otherwise clamp the requested fraction and
    // promote near-full / dust-leaving closes to a full close so a position can
    // never be left with un-closable residual notional.
    let f = reason === "liquidated" ? 1 : Math.min(Math.max(fraction, 0), 1);
    if (f <= 0) f = 1;
    const remainingNotionalAfter = notional * (1 - f);
    if (f >= 0.9999 || remainingNotionalAfter < DUST_NOTIONAL_SOL) f = 1;
    const isPartial = f < 1;

    // Scale the closed slice by the fraction. Partial closes settle and free a
    // proportional share of the margin/notional/tokens; the rest stays open.
    const closedMargin = margin * f;
    const closedNotional = notional * f;
    const closedTokens = tokens * f;

    let realizedPnl: number;
    let credit: number;
    let action: "close" | "liquidated";

    if (reason === "liquidated") {
      // Liquidation: the trader loses exactly their (remaining) margin, credit 0.
      realizedPnl = -margin;
      credit = 0;
      action = "liquidated";
    } else {
      // Realized P&L tracks the token's USD market-cap move (consistent with the
      // valuation, the liquidation level and the TP/SL triggers). Fall back to
      // the SOL-denominated price move only when market-cap data is unavailable
      // at entry or exit.
      const entryMc = claimed.entry_market_cap;
      const priceMovePercent =
        entryMc != null && entryMc > 0 && exitMarketCap != null
          ? (exitMarketCap - entryMc) / entryMc
          : entry > 0
            ? (exitPriceSol - entry) / entry
            : 0;
      const rawPnl = closedNotional * priceMovePercent;
      // Max loss on the closed slice is its margin; equity can never go negative.
      realizedPnl = Math.max(rawPnl, -closedMargin);
      credit = Math.max(0, closedMargin + realizedPnl);
      action = "close";
    }

    // Settlement touches ONLY the paper balance — leverage P&L stays isolated
    // from spot accounts.realized_pnl / winning_trades / leaderboard columns.
    await dbRun(
      "UPDATE accounts SET paper_balance = paper_balance + $1, last_active = $2 WHERE wallet = $3",
      [credit, now, wallet],
      c,
    );

    let updated: LeveragePositionRow | undefined;
    if (isPartial) {
      // Reduce the position and reopen it. realized_pnl_sol accumulates each
      // partial slice. The liquidation level depends only on entry + leverage,
      // so it is intentionally left unchanged.
      updated = await dbGet<LeveragePositionRow>(
        `UPDATE paper_leverage_positions
           SET status = 'open',
               margin_sol = margin_sol - $1,
               notional_sol = notional_sol - $2,
               tokens = tokens - $3,
               realized_pnl_sol = COALESCE(realized_pnl_sol, 0) + $4,
               updated_at = ${EPOCH}
         WHERE id = $5
         RETURNING *`,
        [closedMargin, closedNotional, closedTokens, realizedPnl, id],
        c,
      );
    } else {
      updated = await dbGet<LeveragePositionRow>(
        `UPDATE paper_leverage_positions
           SET status = $1, realized_pnl_sol = COALESCE(realized_pnl_sol, 0) + $2,
               exit_price_sol = $3, exit_market_cap = $4, close_reason = $5,
               closed_at = ${EPOCH}, updated_at = ${EPOCH}
         WHERE id = $6
         RETURNING *`,
        [
          reason === "liquidated" ? "liquidated" : "closed",
          realizedPnl,
          exitPriceSol,
          exitMarketCap,
          reason,
          id,
        ],
        c,
      );
      // Orphan cleanup: a fully-closed position cancels its remaining pending /
      // filling exit orders so they can never fire against a closed position.
      await dbRun(
        `UPDATE paper_leverage_exit_orders
           SET status = 'canceled', fill_reason = 'position_closed', updated_at = ${EPOCH}
         WHERE position_id = $1 AND status IN ('pending', 'filling')`,
        [id],
        c,
      );
    }

    await dbRun(
      `INSERT INTO paper_leverage_trades
         (position_id, wallet, token_mint, token_name, token_symbol, token_logo,
          action, direction, leverage, margin_sol, notional_sol, tokens,
          price_sol, market_cap, pnl_sol, executed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'long',$8,$9,$10,$11,$12,$13,$14,${EPOCH})`,
      [
        claimed.id,
        wallet,
        claimed.token_mint,
        claimed.token_name,
        claimed.token_symbol,
        claimed.token_logo,
        action,
        claimed.leverage,
        closedMargin,
        closedNotional,
        closedTokens,
        exitPriceSol,
        exitMarketCap,
        realizedPnl,
      ],
      c,
    );

    const after = await dbGet<{ paper_balance: number }>(
      "SELECT paper_balance FROM accounts WHERE wallet = $1",
      [wallet],
      c,
    );

    return {
      ok: true,
      position: updated!,
      realizedPnlSol: realizedPnl,
      reason,
      balance: after?.paper_balance,
    };
  });
}

/**
 * Owner-initiated manual close. Fetches a fresh exit price. `percent` (1..100)
 * controls how much of the position's remaining notional to close; the default
 * of 100 fully closes it (behavior unchanged from before partial closes).
 */
export async function closeLeverage(
  wallet: string,
  id: number,
  percent = 100,
): Promise<CloseLeverageResult> {
  const pct = Number.isFinite(percent) ? percent : 100;
  if (pct <= 0 || pct > 100) {
    return { ok: false, error: "percent must be between 1 and 100." };
  }
  const pos = await dbGet<LeveragePositionRow>(
    "SELECT * FROM paper_leverage_positions WHERE id = $1 AND wallet = $2",
    [id, wallet],
  );
  if (!pos) return { ok: false, error: "Position not found." };
  if (pos.status !== "open") {
    return { ok: false, error: "Position is not open." };
  }
  const px = await getExecutionPrice(pos.token_mint);
  if (!px || !Number.isFinite(px.priceSol) || px.priceSol <= 0) {
    return { ok: false, error: "Price data unavailable. Position not closed." };
  }
  return performClose(wallet, id, px.priceSol, px.marketCapUsd, "manual", pct / 100);
}

// ── Evaluate (liquidation + manageable exit orders) ─────────────────────────
/**
 * Evaluate open leverage positions against already-valued data (no new price
 * fetches). Precedence per position: liquidation (full close) → stop-loss →
 * take-profit rungs (ascending trigger). Each exit order closes its configured
 * percent of the *remaining* notional, mirroring the spot TP/SL engine
 * (status-claim, concurrency-safe, orphan-cancel on full close).
 */
export async function evaluateLeverage(
  wallet: string,
  valued: ValuedLeveragePosition[],
): Promise<LeverageFill[]> {
  // Release any positions stuck mid-close by a crashed request.
  await dbRun(
    `UPDATE paper_leverage_positions
       SET status = 'open', updated_at = ${EPOCH}
     WHERE wallet = $1 AND status = 'closing'
       AND updated_at < ${EPOCH} - $2`,
    [wallet, CLOSING_STALE_SECONDS],
  );

  // Batch-load every pending exit order for the wallet, grouped by position.
  const pendingOrders = await dbAll<LeverageExitOrderRow>(
    `SELECT * FROM paper_leverage_exit_orders
     WHERE wallet = $1 AND status = 'pending'`,
    [wallet],
  );
  const ordersByPosition = new Map<number, LeverageExitOrderRow[]>();
  for (const o of pendingOrders) {
    const list = ordersByPosition.get(o.position_id) ?? [];
    list.push(o);
    ordersByPosition.set(o.position_id, list);
  }

  const fills: LeverageFill[] = [];

  for (const p of valued) {
    if (p.status !== "open") continue;
    const price = p.currentPriceSol;
    const mc = p.currentMarketCapUsd;
    if (price == null || !Number.isFinite(price)) continue;

    // 1. Liquidation (full close, highest precedence). The token's USD market
    //    cap has fallen to/through the liquidation level — same basis as the
    //    entry MC, the chart, the triggers and the Liq MC shown to the trader.
    //    Fall back to the SOL price only when market-cap data is unavailable, so
    //    a long is never liquidated purely because SOL/USD appreciated.
    const liquidated =
      mc != null && p.liq_market_cap != null
        ? mc <= p.liq_market_cap
        : price <= p.liq_price_sol;
    if (liquidated) {
      const res = await performClose(wallet, p.id, price, mc, "liquidated", 1);
      if (res.ok) {
        fills.push({
          positionId: p.id,
          tokenMint: p.token_mint,
          tokenSymbol: p.token_symbol,
          reason: "liquidated",
          exitPriceSol: price,
          exitMarketCap: mc,
          realizedPnlSol: res.realizedPnlSol ?? null,
        });
      }
      // performClose cancels this position's remaining exit orders.
      continue;
    }

    // Exit orders trigger by USD market cap, so skip when MC is unavailable.
    if (mc == null) continue;
    const orders = ordersByPosition.get(p.id) ?? [];
    if (orders.length === 0) continue;

    // 2. Stop-loss first (risk management precedence): trigger when MC has
    //    fallen to/through the stop. 3. Then take-profit rungs in ascending
    //    trigger order: trigger when MC has risen to/through each target.
    const triggered = [
      ...orders
        .filter((o) => o.kind === "stop_loss" && mc <= o.trigger_mc)
        .sort((a, b) => b.trigger_mc - a.trigger_mc),
      ...orders
        .filter((o) => o.kind === "take_profit" && mc >= o.trigger_mc)
        .sort((a, b) => a.trigger_mc - b.trigger_mc),
    ];

    for (const order of triggered) {
      // Claim the order (pending → filling) so concurrent refreshes can't
      // double-fire it.
      const claimedOrder = await dbGet<{ id: number }>(
        `UPDATE paper_leverage_exit_orders
           SET status = 'filling', updated_at = ${EPOCH}, last_checked_at = ${EPOCH}
         WHERE id = $1 AND status = 'pending'
         RETURNING id`,
        [order.id],
      );
      if (!claimedOrder) continue;

      const reason: CloseReason =
        order.kind === "stop_loss" ? "stop_loss" : "take_profit";
      const res = await performClose(
        wallet,
        p.id,
        price,
        mc,
        reason,
        order.percent / 100,
      );

      if (res.ok) {
        await dbRun(
          `UPDATE paper_leverage_exit_orders
             SET status = 'filled', filled_at = ${EPOCH}, updated_at = ${EPOCH},
                 fill_market_cap = $2, fill_price = $3, fill_reason = 'triggered'
           WHERE id = $1`,
          [order.id, mc, price],
        );
        fills.push({
          positionId: p.id,
          tokenMint: p.token_mint,
          tokenSymbol: p.token_symbol,
          reason,
          exitPriceSol: price,
          exitMarketCap: mc,
          realizedPnlSol: res.realizedPnlSol ?? null,
        });
        // If this fill fully closed the position (100% or dust promotion), its
        // remaining orders were canceled by performClose — stop processing.
        if (res.position && res.position.status !== "open") break;
      } else {
        // Release the claim so a later pass can retry — but ONLY if this order
        // is still 'filling'. A concurrent full close / liquidation may have
        // already canceled it (orphan cleanup); the `status = 'filling'` guard
        // prevents resurrecting a canceled order back to 'pending'.
        await dbRun(
          `UPDATE paper_leverage_exit_orders
             SET status = 'pending', updated_at = ${EPOCH},
                 fill_reason = $2
           WHERE id = $1 AND status = 'filling'`,
          [order.id, (res.error ?? "fill_failed").slice(0, 180)],
        );
      }
    }
  }

  return fills;
}

// ── Exit-order CRUD ─────────────────────────────────────────────────────────
/**
 * Validate a trigger market cap for a given exit kind against the position's
 * entry / liquidation market caps. Returns an error string, or null if valid.
 */
function validateTrigger(
  kind: LeverageExitKind,
  triggerMc: number,
  entryMc: number | null,
  liqMc: number | null,
): string | null {
  if (kind === "take_profit") {
    if (entryMc != null && triggerMc <= entryMc) {
      return "Take Profit must be above the entry market cap.";
    }
  } else {
    if (entryMc != null && triggerMc >= entryMc) {
      return "Stop Loss must be below the entry market cap.";
    }
    if (liqMc != null && triggerMc <= liqMc) {
      return "Stop Loss must be above the liquidation market cap.";
    }
  }
  return null;
}

/** All active (pending/filling) exit orders for a wallet. */
export async function getLeverageExitOrders(
  wallet: string,
): Promise<LeverageExitOrderRow[]> {
  return dbAll<LeverageExitOrderRow>(
    `SELECT * FROM paper_leverage_exit_orders
     WHERE wallet = $1 AND status IN ('pending', 'filling')
     ORDER BY position_id, kind, trigger_mc`,
    [wallet],
  );
}

export async function createLeverageExitOrder(input: {
  wallet: string;
  positionId: number;
  kind: LeverageExitKind;
  triggerMc: number;
  percent: number;
}): Promise<ExitOrderResult> {
  const wallet = String(input.wallet ?? "").trim();
  const positionId = Number(input.positionId);
  if (!wallet || !Number.isInteger(positionId) || positionId <= 0) {
    return { ok: false, error: "wallet and a valid position id are required." };
  }
  if (input.kind !== "take_profit" && input.kind !== "stop_loss") {
    return { ok: false, error: "kind must be take_profit or stop_loss." };
  }
  const triggerMc = Number(input.triggerMc);
  if (!Number.isFinite(triggerMc) || triggerMc <= 0) {
    return { ok: false, error: "triggerMc must be a positive number." };
  }
  const percent = Number(input.percent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return { ok: false, error: "percent must be between 1 and 100." };
  }

  return withTx(async (c): Promise<ExitOrderResult> => {
    const pos = await dbGet<LeveragePositionRow>(
      "SELECT * FROM paper_leverage_positions WHERE id = $1 AND wallet = $2 FOR UPDATE",
      [positionId, wallet],
      c,
    );
    if (!pos) return { ok: false, error: "Position not found." };
    if (pos.status !== "open") return { ok: false, error: "Position is not open." };

    const triggerError = validateTrigger(
      input.kind,
      triggerMc,
      pos.entry_market_cap,
      pos.liq_market_cap,
    );
    if (triggerError) return { ok: false, error: triggerError };

    const cnt = await dbGet<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM paper_leverage_exit_orders
       WHERE position_id = $1 AND kind = $2 AND status IN ('pending', 'filling')`,
      [positionId, input.kind],
      c,
    );
    const cap = input.kind === "take_profit" ? MAX_LEVERAGE_TP : MAX_LEVERAGE_SL;
    if ((cnt?.c ?? 0) >= cap) {
      return {
        ok: false,
        error:
          input.kind === "take_profit"
            ? `At most ${MAX_LEVERAGE_TP} take-profit levels per position.`
            : `At most ${MAX_LEVERAGE_SL} stop-loss per position.`,
      };
    }

    const order = await dbGet<LeverageExitOrderRow>(
      `INSERT INTO paper_leverage_exit_orders
         (position_id, wallet, token_mint, kind, trigger_mc, percent, status,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',${EPOCH},${EPOCH})
       RETURNING *`,
      [positionId, wallet, pos.token_mint, input.kind, triggerMc, percent],
      c,
    );
    return { ok: true, order: order! };
  });
}

export async function updateLeverageExitOrder(input: {
  wallet: string;
  orderId: number;
  triggerMc?: number;
  percent?: number;
}): Promise<ExitOrderResult> {
  const wallet = String(input.wallet ?? "").trim();
  const orderId = Number(input.orderId);
  if (!wallet || !Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "wallet and a valid order id are required." };
  }

  return withTx(async (c): Promise<ExitOrderResult> => {
    const order = await dbGet<LeverageExitOrderRow>(
      "SELECT * FROM paper_leverage_exit_orders WHERE id = $1 AND wallet = $2 FOR UPDATE",
      [orderId, wallet],
      c,
    );
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "pending") {
      return { ok: false, error: "Only pending orders can be modified." };
    }
    const pos = await dbGet<LeveragePositionRow>(
      "SELECT * FROM paper_leverage_positions WHERE id = $1 AND wallet = $2",
      [order.position_id, wallet],
      c,
    );
    if (!pos || pos.status !== "open") {
      return { ok: false, error: "Position is not open." };
    }

    const newTrigger =
      input.triggerMc != null ? Number(input.triggerMc) : order.trigger_mc;
    const newPercent =
      input.percent != null ? Number(input.percent) : order.percent;
    if (!Number.isFinite(newTrigger) || newTrigger <= 0) {
      return { ok: false, error: "triggerMc must be a positive number." };
    }
    if (!Number.isFinite(newPercent) || newPercent <= 0 || newPercent > 100) {
      return { ok: false, error: "percent must be between 1 and 100." };
    }
    const triggerError = validateTrigger(
      order.kind === "stop_loss" ? "stop_loss" : "take_profit",
      newTrigger,
      pos.entry_market_cap,
      pos.liq_market_cap,
    );
    if (triggerError) return { ok: false, error: triggerError };

    const updated = await dbGet<LeverageExitOrderRow>(
      `UPDATE paper_leverage_exit_orders
         SET trigger_mc = $1, percent = $2, updated_at = ${EPOCH}
       WHERE id = $3
       RETURNING *`,
      [newTrigger, newPercent, orderId],
      c,
    );
    return { ok: true, order: updated! };
  });
}

export async function cancelLeverageExitOrder(
  wallet: string,
  orderId: number,
): Promise<ExitOrderResult> {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "A valid order id is required." };
  }
  const canceled = await dbGet<LeverageExitOrderRow>(
    `UPDATE paper_leverage_exit_orders
       SET status = 'canceled', fill_reason = 'canceled', updated_at = ${EPOCH}
     WHERE id = $1 AND wallet = $2 AND status = 'pending'
     RETURNING *`,
    [id, wallet],
  );
  if (!canceled) {
    return { ok: false, error: "Order not found or not pending." };
  }
  return { ok: true, order: canceled };
}

// ── History + portfolio summary ─────────────────────────────────────────────
export interface LeverageTradeRow {
  id: number;
  position_id: number;
  wallet: string;
  token_mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  action: string;
  direction: string;
  leverage: number;
  margin_sol: number;
  notional_sol: number;
  tokens: number;
  price_sol: number;
  market_cap: number | null;
  pnl_sol: number | null;
  executed_at: number;
}

export async function getLeverageHistory(
  wallet: string,
  limit = 100,
): Promise<LeverageTradeRow[]> {
  return dbAll<LeverageTradeRow>(
    `SELECT * FROM paper_leverage_trades
     WHERE wallet = $1
     ORDER BY executed_at DESC, id DESC
     LIMIT $2`,
    [wallet, limit],
  );
}

export interface LeveragePortfolioSummary {
  wallet: string;
  positions: ValuedLeveragePosition[];
  openMarginSol: number;
  unrealizedPnlSol: number;
  /** Total realized leverage P&L to date (separate from spot realized_pnl). */
  realizedPnlSol: number;
  solUsd: number;
}

export async function getLeveragePortfolio(
  wallet: string,
): Promise<LeveragePortfolioSummary> {
  const positions = await valueLeveragePositions(wallet);
  const solUsd = await getSolPriceUsd();
  const openMarginSol = positions.reduce((s, p) => s + p.margin_sol, 0);
  const unrealizedPnlSol = positions.reduce(
    (s, p) => s + (p.unrealizedPnlSol ?? 0),
    0,
  );
  const realized = await dbGet<{ pnl: number }>(
    `SELECT COALESCE(SUM(pnl_sol), 0) AS pnl FROM paper_leverage_trades
     WHERE wallet = $1 AND action IN ('close','liquidated')`,
    [wallet],
  );
  return {
    wallet,
    positions,
    openMarginSol,
    unrealizedPnlSol,
    realizedPnlSol: realized?.pnl ?? 0,
    solUsd,
  };
}
