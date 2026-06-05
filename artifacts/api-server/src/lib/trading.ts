import db from "./database.js";
import { getTokenPriceSol, getSolPriceUsd, getExecutionPrice } from "./prices.js";
import { computeSlippage, type WarningLevel } from "./slippage.js";
import { logger } from "./logger.js";

const DEV = process.env.NODE_ENV !== "production";

export const STARTING_BALANCE = 100.0;
export const MIN_TRADE_SOL = 0.1;
export const MAX_POSITIONS = 20;
export const MAX_POINTS_PER_DAY = 5;
export const RESET_THRESHOLD = 1.0; // balance below this allows a reset
export const RESET_COOLDOWN_DAYS = 7;

// --- Leaderboard anti-cheat thresholds ---
// A trader must have at least this many CLOSED (sell) trades before they appear
// on any leaderboard, so a single lucky trade cannot top the rankings.
export const MIN_LEADERBOARD_TRADES = 5;
// An account must be at least this old before it can be ranked, to blunt
// throwaway-account farming.
export const MIN_ACCOUNT_AGE_SECONDS = 60 * 60; // 1 hour
// Identical trades submitted within this window are treated as an accidental
// double-submit and rejected (idempotency guard).
export const DUPLICATE_WINDOW_SECONDS = 2;

export interface AccountRow {
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
}

export interface PositionRow {
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
}

const TIERS: { name: string; min: number }[] = [
  { name: "Managing Director", min: 1000 },
  { name: "Portfolio Manager", min: 500 },
  { name: "Senior Analyst", min: 200 },
  { name: "Analyst", min: 50 },
];

export function graduationTier(allTimePnl: number): string {
  for (const t of TIERS) {
    if (allTimePnl >= t.min) return t.name;
  }
  return "none";
}

export function ensureAccount(wallet: string): AccountRow {
  db.prepare(
    "INSERT OR IGNORE INTO accounts (wallet, paper_balance, created_at, last_active) VALUES (?, ?, unixepoch(), unixepoch())",
  ).run(wallet, STARTING_BALANCE);
  return getAccount(wallet)!;
}

export function getAccount(wallet: string): AccountRow | null {
  return (
    (db.prepare("SELECT * FROM accounts WHERE wallet = ?").get(wallet) as
      | AccountRow
      | undefined) ?? null
  );
}

export function getOpenPositions(wallet: string): PositionRow[] {
  return db
    .prepare("SELECT * FROM positions WHERE wallet = ? ORDER BY opened_at DESC")
    .all(wallet) as PositionRow[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Award participation points (max MAX_POINTS_PER_DAY per day). */
function recordParticipation(wallet: string): void {
  const date = todayStr();
  db.prepare(
    "INSERT OR IGNORE INTO participation_metrics (wallet, date) VALUES (?, ?)",
  ).run(wallet, date);
  const row = db
    .prepare(
      "SELECT trades_today, points_today FROM participation_metrics WHERE wallet = ? AND date = ?",
    )
    .get(wallet, date) as { trades_today: number; points_today: number };

  const newTrades = row.trades_today + 1;
  let newPoints = row.points_today;
  let award = 0;
  if (row.points_today < MAX_POINTS_PER_DAY) {
    newPoints += 1;
    award = 1;
  }
  db.prepare(
    "UPDATE participation_metrics SET trades_today = ?, points_today = ? WHERE wallet = ? AND date = ?",
  ).run(newTrades, newPoints, wallet, date);
  if (award > 0) {
    db.prepare(
      "UPDATE accounts SET participation_points = participation_points + ? WHERE wallet = ?",
    ).run(award, wallet);
  }
}

export interface ValuedPosition extends PositionRow {
  currentPriceSol: number | null;
  currentValueSol: number;
  unrealizedPnlSol: number;
  unrealizedPnlPercent: number;
}

export async function valuePositions(
  wallet: string,
): Promise<ValuedPosition[]> {
  const positions = getOpenPositions(wallet);
  const valued = await Promise.all(
    positions.map(async (p) => {
      const price = await getTokenPriceSol(p.token_mint);
      const currentValueSol =
        price != null ? p.total_tokens * price : p.total_sol_spent;
      const unrealizedPnlSol = currentValueSol - p.total_sol_spent;
      const unrealizedPnlPercent =
        p.total_sol_spent > 0
          ? (unrealizedPnlSol / p.total_sol_spent) * 100
          : 0;
      return {
        ...p,
        currentPriceSol: price,
        currentValueSol,
        unrealizedPnlSol,
        unrealizedPnlPercent,
      };
    }),
  );
  return valued;
}

export interface PortfolioSummary {
  wallet: string;
  balance: number;
  positionsValueSol: number;
  equitySol: number;
  unrealizedPnlSol: number;
  realizedPnlSol: number;
  totalPnlSol: number;
  solUsd: number;
  positions: ValuedPosition[];
}

export async function getPortfolio(wallet: string): Promise<PortfolioSummary> {
  const account = ensureAccount(wallet);
  const positions = await valuePositions(wallet);
  const solUsd = await getSolPriceUsd();
  const positionsValueSol = positions.reduce(
    (s, p) => s + p.currentValueSol,
    0,
  );
  const unrealizedPnlSol = positions.reduce(
    (s, p) => s + p.unrealizedPnlSol,
    0,
  );
  const equitySol = account.paper_balance + positionsValueSol;
  return {
    wallet,
    balance: account.paper_balance,
    positionsValueSol,
    equitySol,
    unrealizedPnlSol,
    realizedPnlSol: account.realized_pnl,
    totalPnlSol: account.realized_pnl + unrealizedPnlSol,
    solUsd,
    positions,
  };
}

export interface TradeTokenMeta {
  name?: string | null;
  symbol?: string | null;
  logo?: string | null;
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

export async function executeBuy(
  wallet: string,
  mint: string,
  solAmount: number,
  meta: TradeTokenMeta,
): Promise<ExecuteResult> {
  if (!Number.isFinite(solAmount) || solAmount < MIN_TRADE_SOL) {
    return { ok: false, error: `Minimum trade is ${MIN_TRADE_SOL} SOL` };
  }
  ensureAccount(wallet);

  const px = await getExecutionPrice(mint);
  if (!px) {
    return { ok: false, error: "Price data unavailable. Trade not executed." };
  }
  const { priceSol, priceUsd, solUsd, liquidityUsd, source, pair } = px;
  // Never trade on a non-finite or non-positive price — a bad upstream feed
  // could otherwise produce NaN/Infinity/zero token amounts and poison stats.
  if (![priceSol, priceUsd, solUsd].every((v) => Number.isFinite(v) && v > 0)) {
    return { ok: false, error: "Price data unavailable. Trade not executed." };
  }

  // Quantity is computed from the trusted USD price, never market cap / FDV /
  // formatted values. Slippage is simulated from how large this order is
  // relative to pool liquidity, so the effective fill price (and therefore the
  // token quantity) is worse for big orders into thin pools.
  const amountInUsd = solAmount * solUsd;
  const slip = computeSlippage({
    side: "buy",
    rawPriceUsd: priceUsd,
    solUsd,
    liquidityUsd,
    tradeUsdValue: amountInUsd,
  });
  if (!slip.ok) {
    return { ok: false, error: slip.error };
  }
  // Effective (slippage-adjusted) prices drive the executed quantity and the
  // value stored against the trade. The flat raw price is never used to fill.
  const effectivePriceUsd = slip.effectivePriceUsd;
  const price = effectivePriceUsd / solUsd; // effective price in SOL
  const tokensReceived = amountInUsd / effectivePriceUsd;
  const now = Math.floor(Date.now() / 1000);

  if (DEV) {
    logger.debug(
      {
        side: "buy",
        symbol: meta.symbol,
        mint,
        solAmount,
        solUsd,
        tradeUsdValue: amountInUsd,
        liquidityUsd,
        tradeImpactPercent: slip.tradeImpactPercent,
        rawPriceUsd: priceUsd,
        slippagePercent: slip.slippagePercent,
        effectivePriceUsd,
        tokenQuantity: tokensReceived,
        source,
        pair,
        result: "executed",
      },
      "[trade-debug] buy execution",
    );
  }

  // All reads and writes happen inside a single synchronous transaction so
  // concurrent requests cannot overspend the balance or exceed position limits.
  const run = db.transaction((): ExecuteResult => {
    const acct = db
      .prepare("SELECT paper_balance FROM accounts WHERE wallet = ?")
      .get(wallet) as { paper_balance: number } | undefined;
    if (!acct || acct.paper_balance < solAmount) {
      return { ok: false, error: "Insufficient paper balance" };
    }

    // Idempotency guard: reject an identical buy submitted within the dedupe
    // window (accidental double-click / double-submit).
    const dup = db
      .prepare(
        `SELECT 1 FROM trades
         WHERE wallet = ? AND token_mint = ? AND side = 'buy'
           AND sol_amount = ? AND executed_at >= ? LIMIT 1`,
      )
      .get(wallet, mint, solAmount, now - DUPLICATE_WINDOW_SECONDS);
    if (dup) {
      return {
        ok: false,
        error: "Duplicate trade ignored. Please wait a moment before retrying.",
      };
    }

    const existing = db
      .prepare("SELECT * FROM positions WHERE wallet = ? AND token_mint = ?")
      .get(wallet, mint) as PositionRow | undefined;

    if (!existing) {
      const count = (
        db
          .prepare("SELECT COUNT(*) AS c FROM positions WHERE wallet = ?")
          .get(wallet) as { c: number }
      ).c;
      if (count >= MAX_POSITIONS) {
        return {
          ok: false,
          error: `Maximum of ${MAX_POSITIONS} open positions reached`,
        };
      }
    }

    db.prepare(
      "UPDATE accounts SET paper_balance = paper_balance - ?, total_trades = total_trades + 1, last_active = ? WHERE wallet = ?",
    ).run(solAmount, now, wallet);

    if (existing) {
      const totalTokens = existing.total_tokens + tokensReceived;
      const totalSpent = existing.total_sol_spent + solAmount;
      db.prepare(
        "UPDATE positions SET total_tokens = ?, total_sol_spent = ?, avg_entry_price = ? WHERE id = ?",
      ).run(totalTokens, totalSpent, totalSpent / totalTokens, existing.id);
    } else {
      db.prepare(
        `INSERT INTO positions (wallet, token_mint, token_name, token_symbol, token_logo, total_tokens, total_sol_spent, avg_entry_price, opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        wallet,
        mint,
        meta.name ?? null,
        meta.symbol ?? null,
        meta.logo ?? null,
        tokensReceived,
        solAmount,
        solAmount / tokensReceived,
        now,
      );
    }

    db.prepare(
      `INSERT INTO trades (
         wallet, token_mint, token_name, token_symbol, token_logo, side,
         sol_amount, token_amount, price, pnl, executed_at,
         raw_price_usd, effective_price_usd, slippage_percent,
         trade_impact_percent, liquidity_usd_at_execution,
         sol_usd_price_at_execution, trade_usd_value
       )
       VALUES (?, ?, ?, ?, ?, 'buy', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      wallet,
      mint,
      meta.name ?? null,
      meta.symbol ?? null,
      meta.logo ?? null,
      solAmount,
      tokensReceived,
      price,
      now,
      priceUsd,
      effectivePriceUsd,
      slip.slippagePercent,
      slip.tradeImpactPercent,
      slip.liquidityUsd,
      solUsd,
      amountInUsd,
    );
    return { ok: true };
  });

  const result = run();
  if (!result.ok) return result;
  recordParticipation(wallet);

  const updated = getAccount(wallet)!;
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
    balance: updated.paper_balance,
  };
}

/**
 * Sell either an explicit token amount or a percentage (0-100) of the held position.
 */
export async function executeSell(
  wallet: string,
  mint: string,
  opts: { tokenAmount?: number; percent?: number },
): Promise<ExecuteResult> {
  ensureAccount(wallet);
  if (opts.percent == null && opts.tokenAmount == null) {
    return { ok: false, error: "Specify tokenAmount or percent" };
  }

  const px = await getExecutionPrice(mint);
  if (!px) {
    return { ok: false, error: "Price data unavailable. Trade not executed." };
  }
  const { priceSol, priceUsd, solUsd, liquidityUsd, source, pair } = px;
  // Never trade on a non-finite or non-positive price — a bad upstream feed
  // could otherwise produce NaN/Infinity/zero proceeds and poison stats.
  if (![priceSol, priceUsd, solUsd].every((v) => Number.isFinite(v) && v > 0)) {
    return { ok: false, error: "Price data unavailable. Trade not executed." };
  }

  const now = Math.floor(Date.now() / 1000);

  // Re-read position and account inside the transaction so concurrent sells
  // cannot double-credit a position that another request already closed.
  const run = db.transaction((): ExecuteResult => {
    const position = db
      .prepare("SELECT * FROM positions WHERE wallet = ? AND token_mint = ?")
      .get(wallet, mint) as PositionRow | undefined;
    if (!position) {
      return { ok: false, error: "No open position for this token" };
    }
    const account = db
      .prepare("SELECT * FROM accounts WHERE wallet = ?")
      .get(wallet) as AccountRow;

    let tokenAmount: number;
    if (opts.percent != null) {
      const pct = Math.max(0, Math.min(100, opts.percent));
      tokenAmount = position.total_tokens * (pct / 100);
    } else {
      tokenAmount = opts.tokenAmount!;
    }
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
      return { ok: false, error: "Invalid sell amount" };
    }
    if (tokenAmount > position.total_tokens * 1.0000001) {
      return { ok: false, error: "Cannot sell more than held" };
    }

    // Idempotency guard: reject an identical sell submitted within the dedupe
    // window (accidental double-click / double-submit).
    const dup = db
      .prepare(
        `SELECT 1 FROM trades
         WHERE wallet = ? AND token_mint = ? AND side = 'sell'
           AND executed_at >= ? AND ABS(token_amount - ?) <= ? LIMIT 1`,
      )
      .get(
        wallet,
        mint,
        now - DUPLICATE_WINDOW_SECONDS,
        tokenAmount,
        Math.max(tokenAmount * 1e-6, 1e-9),
      );
    if (dup) {
      return {
        ok: false,
        error: "Duplicate trade ignored. Please wait a moment before retrying.",
      };
    }

    // Slippage is based on how large this sell is relative to pool liquidity,
    // valued at the raw price. Sells fill at a lower effective price.
    const tradeUsdValue = tokenAmount * priceUsd;
    const slip = computeSlippage({
      side: "sell",
      rawPriceUsd: priceUsd,
      solUsd,
      liquidityUsd,
      tradeUsdValue,
    });
    if (!slip.ok) {
      return { ok: false, error: slip.error };
    }
    const effectivePriceUsd = slip.effectivePriceUsd;
    const price = effectivePriceUsd / solUsd; // effective price in SOL
    const solReceived = tokenAmount * price;
    const fraction = tokenAmount / position.total_tokens;
    const costBasis = position.total_sol_spent * fraction;
    const pnl = solReceived - costBasis;

    if (DEV) {
      logger.debug(
        {
          side: "sell",
          symbol: position.token_symbol,
          mint,
          tokenAmount,
          solUsd,
          tradeUsdValue,
          liquidityUsd,
          tradeImpactPercent: slip.tradeImpactPercent,
          rawPriceUsd: priceUsd,
          slippagePercent: slip.slippagePercent,
          effectivePriceUsd,
          solReceived,
          pnl,
          source,
          pair,
          result: "executed",
        },
        "[trade-debug] sell execution",
      );
    }

    const remainingTokens = position.total_tokens - tokenAmount;
    const remainingSpent = position.total_sol_spent - costBasis;
    if (remainingTokens <= position.total_tokens * 0.000001) {
      db.prepare("DELETE FROM positions WHERE id = ?").run(position.id);
    } else {
      db.prepare(
        "UPDATE positions SET total_tokens = ?, total_sol_spent = ? WHERE id = ?",
      ).run(remainingTokens, remainingSpent, position.id);
    }

    const winInc = pnl > 0 ? 1 : 0;
    const streak = pnl > 0 ? account.current_streak + 1 : 0;
    const best = Math.max(account.best_trade, pnl);
    const worst = Math.min(account.worst_trade, pnl);
    const newRealized = account.realized_pnl + pnl;
    const newTier = graduationTier(newRealized);

    db.prepare(
      `UPDATE accounts SET
         paper_balance = paper_balance + ?,
         total_trades = total_trades + 1,
         winning_trades = winning_trades + ?,
         realized_pnl = ?,
         total_pnl = ?,
         best_trade = ?,
         worst_trade = ?,
         current_streak = ?,
         graduation_tier = ?,
         last_active = ?
       WHERE wallet = ?`,
    ).run(
      solReceived,
      winInc,
      newRealized,
      newRealized,
      best,
      worst,
      streak,
      newTier,
      now,
      wallet,
    );

    db.prepare(
      `INSERT INTO trades (
         wallet, token_mint, token_name, token_symbol, token_logo, side,
         sol_amount, token_amount, price, pnl, executed_at,
         raw_price_usd, effective_price_usd, slippage_percent,
         trade_impact_percent, liquidity_usd_at_execution,
         sol_usd_price_at_execution, trade_usd_value
       )
       VALUES (?, ?, ?, ?, ?, 'sell', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      wallet,
      mint,
      position.token_name,
      position.token_symbol,
      position.token_logo,
      solReceived,
      tokenAmount,
      price,
      pnl,
      now,
      priceUsd,
      effectivePriceUsd,
      slip.slippagePercent,
      slip.tradeImpactPercent,
      slip.liquidityUsd,
      solUsd,
      tradeUsdValue,
    );

    return {
      ok: true,
      trade: { side: "sell", mint, solAmount: solReceived, tokenAmount, price, pnl },
    };
  });

  const result = run();
  if (!result.ok) return result;
  recordParticipation(wallet);

  const updated = getAccount(wallet)!;
  return { ...result, balance: updated.paper_balance };
}

export interface TradeQuote {
  ok: boolean;
  error?: string;
  /** True only when rejected for exceeding the max liquidity impact. */
  blocked?: boolean;
  side: "buy" | "sell";
  rawPriceUsd: number;
  effectivePriceUsd: number;
  slippagePercent: number;
  tradeImpactPercent: number;
  liquidityUsd: number;
  solUsd: number;
  tradeUsdValue: number;
  warningLevel: WarningLevel;
  /** Tokens the buyer would receive (buy) — null for sells. */
  estimatedTokens: number | null;
  /** SOL the seller would receive (sell) — null for buys. */
  estimatedSol: number | null;
}

/**
 * Pre-trade quote: returns the simulated effective price, slippage and impact
 * the user would get RIGHT NOW for a given order, using the exact same model as
 * execution so the preview matches the fill. Read-only — never writes.
 */
export async function getTradeQuote(opts: {
  wallet?: string;
  mint: string;
  side: "buy" | "sell";
  solAmount?: number;
  tokenAmount?: number;
  percent?: number;
}): Promise<TradeQuote> {
  const { side, mint } = opts;
  const px = await getExecutionPrice(mint);
  if (!px) {
    return {
      ok: false,
      error: "Price data unavailable.",
      side,
      rawPriceUsd: 0,
      effectivePriceUsd: 0,
      slippagePercent: 0,
      tradeImpactPercent: 0,
      liquidityUsd: 0,
      solUsd: 0,
      tradeUsdValue: 0,
      warningLevel: "none",
      estimatedTokens: null,
      estimatedSol: null,
    };
  }
  const { priceUsd, solUsd, liquidityUsd } = px;

  // Resolve the trade's USD value from the requested order.
  let tradeUsdValue: number;
  if (side === "buy") {
    const solAmount = Number(opts.solAmount);
    if (!Number.isFinite(solAmount) || solAmount <= 0) {
      return {
        ok: false,
        error: "Enter an amount.",
        side,
        rawPriceUsd: priceUsd,
        effectivePriceUsd: priceUsd,
        slippagePercent: 0,
        tradeImpactPercent: 0,
        liquidityUsd: liquidityUsd ?? 0,
        solUsd,
        tradeUsdValue: 0,
        warningLevel: "none",
        estimatedTokens: null,
        estimatedSol: null,
      };
    }
    tradeUsdValue = solAmount * solUsd;
  } else {
    let tokenAmount = Number(opts.tokenAmount);
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
      // Derive the token amount from a percent of the open position.
      const position = opts.wallet
        ? (db
            .prepare(
              "SELECT total_tokens FROM positions WHERE wallet = ? AND token_mint = ?",
            )
            .get(opts.wallet, mint) as { total_tokens: number } | undefined)
        : undefined;
      const pct = Math.max(0, Math.min(100, Number(opts.percent ?? 0)));
      tokenAmount = position ? position.total_tokens * (pct / 100) : 0;
    }
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
      return {
        ok: false,
        error: "No position to sell.",
        side,
        rawPriceUsd: priceUsd,
        effectivePriceUsd: priceUsd,
        slippagePercent: 0,
        tradeImpactPercent: 0,
        liquidityUsd: liquidityUsd ?? 0,
        solUsd,
        tradeUsdValue: 0,
        warningLevel: "none",
        estimatedTokens: null,
        estimatedSol: null,
      };
    }
    tradeUsdValue = tokenAmount * priceUsd;
  }

  const slip = computeSlippage({
    side,
    rawPriceUsd: priceUsd,
    solUsd,
    liquidityUsd,
    tradeUsdValue,
  });

  // Estimated receive uses the slippage-adjusted effective price.
  let estimatedTokens: number | null = null;
  let estimatedSol: number | null = null;
  if (slip.ok) {
    if (side === "buy") {
      estimatedTokens = tradeUsdValue / slip.effectivePriceUsd;
    } else {
      const tokenAmount = tradeUsdValue / priceUsd;
      estimatedSol = (tokenAmount * slip.effectivePriceUsd) / solUsd;
    }
  }

  return {
    ok: slip.ok,
    error: slip.error,
    blocked: slip.blocked,
    side,
    rawPriceUsd: slip.rawPriceUsd,
    effectivePriceUsd: slip.effectivePriceUsd,
    slippagePercent: slip.slippagePercent,
    tradeImpactPercent: slip.tradeImpactPercent,
    liquidityUsd: slip.liquidityUsd,
    solUsd: slip.solUsd,
    tradeUsdValue: slip.tradeUsdValue,
    warningLevel: slip.warningLevel,
    estimatedTokens,
    estimatedSol,
  };
}

export function resetAccount(wallet: string): ExecuteResult {
  const account = ensureAccount(wallet);
  const equityFloor = account.paper_balance;
  if (equityFloor >= RESET_THRESHOLD) {
    return {
      ok: false,
      error: `Reset only available when balance is below ${RESET_THRESHOLD} SOL`,
    };
  }
  const now = Math.floor(Date.now() / 1000);
  if (account.last_reset_at) {
    const elapsedDays = (now - account.last_reset_at) / 86400;
    if (elapsedDays < RESET_COOLDOWN_DAYS) {
      const remaining = Math.ceil(RESET_COOLDOWN_DAYS - elapsedDays);
      return { ok: false, error: `Reset available in ${remaining} day(s)` };
    }
  }
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM positions WHERE wallet = ?").run(wallet);
    db.prepare(
      "UPDATE accounts SET paper_balance = ?, last_reset_at = ?, current_streak = 0 WHERE wallet = ?",
    ).run(STARTING_BALANCE, now, wallet);
  });
  tx();
  return { ok: true, balance: STARTING_BALANCE };
}

export function getHistory(wallet: string, limit = 100) {
  return db
    .prepare(
      "SELECT * FROM trades WHERE wallet = ? ORDER BY executed_at DESC LIMIT ?",
    )
    .all(wallet, limit);
}

export interface ClosedTradeStats {
  /** Number of CLOSED trades (sell executions) since the last reset. */
  closedTrades: number;
  /** All buy + sell executions since the last reset. */
  executions: number;
  winningTrades: number;
  winRate: number;
  realizedPnl: number;
  /**
   * Largest positive realized pnl, or null when there are no winning closed
   * trades. Null is meaningful: the UI distinguishes "no winners yet" from
   * "no closed trades yet" — it must never render a misleading 0.00.
   */
  bestTrade: number | null;
  worstTrade: number;
}

/**
 * Closed-trade statistics derived directly from the immutable `trades` table
 * (every sell row carries its realized pnl). This is the source of truth, so
 * the numbers survive page refreshes, wallet reconnects and redeploys and never
 * drift the way incrementally-updated account counter columns can.
 *
 * Only trades executed AFTER the last account reset are counted: a reset wipes
 * the balance back to STARTING_BALANCE, so counting pre-reset realized pnl would
 * make Total PnL (realized + unrealized) disagree with the equity-based ROI.
 *
 * - closedTrades: number of sell executions — a buy alone is NOT a closed trade
 * - executions:   every buy + sell action since the last reset
 * - winRate:      winning sells / closed sells * 100
 * - bestTrade:    largest positive realized pnl, or null when there are no wins
 * - worstTrade:   most negative realized pnl, or 0 when there are no losses
 */
export function getClosedTradeStats(wallet: string): ClosedTradeStats {
  const acct = db
    .prepare("SELECT last_reset_at FROM accounts WHERE wallet = ?")
    .get(wallet) as { last_reset_at: number | null } | undefined;
  const since = acct?.last_reset_at ?? 0;

  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS closedTrades,
         COALESCE(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END), 0) AS winningTrades,
         COALESCE(SUM(pnl), 0) AS realizedPnl,
         COALESCE(MAX(pnl), 0) AS maxPnl,
         COALESCE(MIN(pnl), 0) AS minPnl
       FROM trades
       WHERE wallet = ? AND side = 'sell' AND pnl IS NOT NULL AND executed_at > ?`,
    )
    .get(wallet, since) as {
    closedTrades: number;
    winningTrades: number;
    realizedPnl: number;
    maxPnl: number;
    minPnl: number;
  };

  // All executions (buys + sells) over the same post-reset window.
  const executions = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM trades WHERE wallet = ? AND executed_at > ?",
      )
      .get(wallet, since) as { c: number }
  ).c;

  const closedTrades = row.closedTrades;
  return {
    closedTrades,
    executions,
    winningTrades: row.winningTrades,
    winRate: closedTrades > 0 ? (row.winningTrades / closedTrades) * 100 : 0,
    realizedPnl: row.realizedPnl,
    // null (not 0) when there is no winning closed trade, so the UI can show
    // "No winning trades yet" instead of a misleading 0.00 SOL.
    bestTrade: row.maxPnl > 0 ? row.maxPnl : null,
    worstTrade: row.minPnl < 0 ? row.minPnl : 0,
  };
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
  created_at: number;
  updated_at: number;
}

/**
 * Server-authoritative leaderboard, computed entirely from the immutable
 * `trades` table — never from any client-supplied figure. Anti-cheat rules:
 *
 * - Only CLOSED trades count (sell rows that carry a realized pnl). Open
 *   positions are ignored so unrealized paper gains cannot inflate a rank.
 * - A wallet needs at least MIN_LEADERBOARD_TRADES closed trades to appear.
 * - The account must be at least MIN_ACCOUNT_AGE_SECONDS old to be ranked.
 * - Trades before a wallet's last account reset are excluded, so a reset wipes
 *   the slate (you cannot bank gains then reset to dodge later losses).
 * - ROI is realized pnl over the actual SOL cost basis of the closed trades in
 *   the period (guarded against divide-by-zero), not a self-reported number.
 */
export function getLeaderboard(
  period: LeaderboardPeriod,
  limit = 100,
): LeaderboardEntry[] {
  const now = Math.floor(Date.now() / 1000);
  let periodStart = 0;
  if (period === "daily") periodStart = now - 86_400;
  else if (period === "weekly") periodStart = now - 7 * 86_400;

  const maxCreatedAt = now - MIN_ACCOUNT_AGE_SECONDS;

  // The trade aggregation and the identity lookup are kept in separate CTEs and
  // joined last, so a wallet/user that happens to have multiple identity rows
  // can never duplicate or skew the per-wallet trade aggregates.
  const rows = db
    .prepare(
      `WITH agg AS (
         SELECT
           a.wallet AS wallet,
           a.created_at AS created_at,
           COUNT(*) AS total_closed_trades,
           COALESCE(SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END), 0) AS winning_trades,
           COALESCE(SUM(t.pnl), 0) AS realized_pnl,
           COALESCE(MAX(t.pnl), 0) AS best_trade,
           COALESCE(SUM(t.sol_amount - t.pnl), 0) AS cost_basis,
           COALESCE(MAX(t.executed_at), 0) AS updated_at
         FROM accounts a
         JOIN trades t ON t.wallet = a.wallet
         WHERE t.side = 'sell'
           AND t.pnl IS NOT NULL
           AND t.executed_at > CASE
             WHEN ? > COALESCE(a.last_reset_at, 0) THEN ?
             ELSE COALESCE(a.last_reset_at, 0)
           END
           AND a.created_at <= ?
         GROUP BY a.wallet
         HAVING COUNT(*) >= ?
       ),
       ident AS (
         SELECT
           wi.wallet_address AS wallet,
           MAX(xi.x_username) AS x_username,
           MAX(u.avatar_url) AS x_avatar_url,
           MAX(u.display_name) AS x_display_name
         FROM user_identities wi
         JOIN users u ON u.id = wi.user_id
         LEFT JOIN user_identities xi
           ON xi.user_id = wi.user_id AND xi.provider = 'x'
         WHERE wi.provider = 'wallet'
         GROUP BY wi.wallet_address
       )
       SELECT
         agg.wallet AS wallet,
         agg.created_at AS created_at,
         agg.total_closed_trades AS total_closed_trades,
         agg.winning_trades AS winning_trades,
         agg.realized_pnl AS realized_pnl,
         agg.best_trade AS best_trade,
         agg.cost_basis AS cost_basis,
         agg.updated_at AS updated_at,
         ident.x_username AS x_username,
         ident.x_avatar_url AS x_avatar_url,
         ident.x_display_name AS x_display_name
       FROM agg
       LEFT JOIN ident ON ident.wallet = agg.wallet
       ORDER BY agg.realized_pnl DESC
       LIMIT ?`,
    )
    .all(
      periodStart,
      periodStart,
      maxCreatedAt,
      MIN_LEADERBOARD_TRADES,
      limit,
    ) as Array<{
    wallet: string;
    created_at: number;
    total_closed_trades: number;
    winning_trades: number;
    realized_pnl: number;
    best_trade: number;
    cost_basis: number;
    updated_at: number;
    x_username: string | null;
    x_avatar_url: string | null;
    x_display_name: string | null;
  }>;

  return rows.map((r, i) => ({
    rank: i + 1,
    wallet: r.wallet,
    x_username: r.x_username ?? null,
    x_avatar_url: r.x_avatar_url ?? null,
    x_display_name: r.x_display_name ?? null,
    realized_pnl: r.realized_pnl,
    roi: r.cost_basis > 0 ? (r.realized_pnl / r.cost_basis) * 100 : 0,
    win_rate:
      r.total_closed_trades > 0
        ? (r.winning_trades / r.total_closed_trades) * 100
        : 0,
    total_closed_trades: r.total_closed_trades,
    best_trade: r.best_trade > 0 ? r.best_trade : 0,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}
