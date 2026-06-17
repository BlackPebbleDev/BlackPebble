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

export type LeverageDirection = "long";
export type CloseReason = "manual" | "take_profit" | "stop_loss" | "liquidated";

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
       VALUES ($1,$2,$3,$4,$5,'long',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'open',$16,$17,${EPOCH},${EPOCH})
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
        tpTriggerMc,
        slTriggerMc,
        slip.slippagePercent,
        slip.tradeImpactPercent,
      ],
      c,
    );

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
    const entry = claimed.entry_price_sol;

    let realizedPnl: number;
    let credit: number;
    let finalStatus: "closed" | "liquidated";
    let action: "close" | "liquidated";

    if (reason === "liquidated") {
      // Liquidation: the trader loses exactly their margin, balance credited 0.
      realizedPnl = -margin;
      credit = 0;
      finalStatus = "liquidated";
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
      const rawPnl = notional * priceMovePercent;
      // Max loss is the margin; account equity can never go negative.
      realizedPnl = Math.max(rawPnl, -margin);
      credit = Math.max(0, margin + realizedPnl);
      finalStatus = "closed";
      action = "close";
    }

    await dbRun(
      "UPDATE accounts SET paper_balance = paper_balance + $1, last_active = $2 WHERE wallet = $3",
      [credit, now, wallet],
      c,
    );

    const updated = await dbGet<LeveragePositionRow>(
      `UPDATE paper_leverage_positions
         SET status = $1, realized_pnl_sol = $2, exit_price_sol = $3,
             exit_market_cap = $4, close_reason = $5, closed_at = ${EPOCH},
             updated_at = ${EPOCH}
       WHERE id = $6
       RETURNING *`,
      [finalStatus, realizedPnl, exitPriceSol, exitMarketCap, reason, id],
      c,
    );

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
        margin,
        notional,
        claimed.tokens,
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

/** Owner-initiated manual close. Fetches a fresh exit price. */
export async function closeLeverage(
  wallet: string,
  id: number,
): Promise<CloseLeverageResult> {
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
  return performClose(wallet, id, px.priceSol, px.marketCapUsd, "manual");
}

// ── Evaluate (liquidation + optional TP/SL) ─────────────────────────────────
/**
 * Evaluate open leverage positions against already-valued data (no new price
 * fetches). Liquidation is checked first, then stop-loss, then take-profit.
 * Mirrors the spot TP/SL engine: status-claim close, concurrency-safe.
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

  const fills: LeverageFill[] = [];

  for (const p of valued) {
    if (p.status !== "open") continue;
    const price = p.currentPriceSol;
    const mc = p.currentMarketCapUsd;
    if (price == null || !Number.isFinite(price)) continue;

    let reason: CloseReason | null = null;
    // 1. Liquidation: the token's USD market cap has fallen to/through the
    //    liquidation level. This is the same basis as the entry MC, the chart,
    //    the TP/SL triggers and the Liq MC shown to the trader. Fall back to the
    //    SOL-denominated price only when market-cap data is unavailable, so a
    //    long is never liquidated purely because SOL/USD appreciated.
    const liquidated =
      mc != null && p.liq_market_cap != null
        ? mc <= p.liq_market_cap
        : price <= p.liq_price_sol;
    if (liquidated) {
      reason = "liquidated";
    } else if (p.sl_trigger_mc != null && mc != null && mc <= p.sl_trigger_mc) {
      // 2. Stop-loss (by market cap).
      reason = "stop_loss";
    } else if (p.tp_trigger_mc != null && mc != null && mc >= p.tp_trigger_mc) {
      // 3. Take-profit (by market cap).
      reason = "take_profit";
    }
    if (!reason) continue;

    const res = await performClose(wallet, p.id, price, mc, reason);
    if (res.ok) {
      fills.push({
        positionId: p.id,
        tokenMint: p.token_mint,
        tokenSymbol: p.token_symbol,
        reason,
        exitPriceSol: price,
        exitMarketCap: mc,
        realizedPnlSol: res.realizedPnlSol ?? null,
      });
    }
  }

  return fills;
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
