import db from "./database.js";
import { getTokenPriceSol, getSolPriceUsd, getExecutionPrice } from "./prices.js";
import { logger } from "./logger.js";

const DEV = process.env.NODE_ENV !== "production";

export const STARTING_BALANCE = 100.0;
export const MIN_TRADE_SOL = 0.1;
export const MAX_POSITIONS = 20;
export const SLIPPAGE = 0.99; // 1% slippage applied to received amount
export const MAX_POINTS_PER_DAY = 5;
export const RESET_THRESHOLD = 1.0; // balance below this allows a reset
export const RESET_COOLDOWN_DAYS = 7;

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
  const { priceSol, priceUsd, solUsd, source, pair } = px;
  const price = priceSol;

  // Quantity is computed from the trusted USD price, never market cap / FDV /
  // formatted values: USD spent / USD token price. Full precision is kept here;
  // values are only rounded for display in the UI.
  const amountInUsd = solAmount * solUsd;
  const tokensReceived = (amountInUsd / priceUsd) * SLIPPAGE;
  const now = Math.floor(Date.now() / 1000);

  if (DEV) {
    logger.debug(
      {
        side: "buy",
        mint,
        solSpent: solAmount,
        solUsd,
        tokenPriceUsd: priceUsd,
        tokenPriceSol: priceSol,
        amountInUsd,
        tokenQuantity: tokensReceived,
        source,
        pair,
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
      `INSERT INTO trades (wallet, token_mint, token_name, token_symbol, token_logo, side, sol_amount, token_amount, price, pnl, executed_at)
       VALUES (?, ?, ?, ?, ?, 'buy', ?, ?, ?, NULL, ?)`,
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
  const { priceSol, priceUsd, solUsd, source, pair } = px;
  const price = priceSol;

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

    const solReceived = tokenAmount * price * SLIPPAGE;
    const fraction = tokenAmount / position.total_tokens;
    const costBasis = position.total_sol_spent * fraction;
    const pnl = solReceived - costBasis;

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
      `INSERT INTO trades (wallet, token_mint, token_name, token_symbol, token_logo, side, sol_amount, token_amount, price, pnl, executed_at)
       VALUES (?, ?, ?, ?, ?, 'sell', ?, ?, ?, ?, ?)`,
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
  if (DEV && result.trade) {
    logger.debug(
      {
        side: "sell",
        mint,
        tokenQuantity: result.trade.tokenAmount,
        solReceived: result.trade.solAmount,
        tokenPriceUsd: priceUsd,
        tokenPriceSol: priceSol,
        solUsd,
        pnl: result.trade.pnl,
        source,
        pair,
      },
      "[trade-debug] sell execution",
    );
  }
  return { ...result, balance: updated.paper_balance };
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
  closedTrades: number;
  winningTrades: number;
  winRate: number;
  realizedPnl: number;
  bestTrade: number;
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
 * - winRate:      winning sells / closed sells * 100
 * - bestTrade:    largest positive realized pnl, or 0 when there are no wins
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

  const closedTrades = row.closedTrades;
  return {
    closedTrades,
    winningTrades: row.winningTrades,
    winRate: closedTrades > 0 ? (row.winningTrades / closedTrades) * 100 : 0,
    realizedPnl: row.realizedPnl,
    bestTrade: row.maxPnl > 0 ? row.maxPnl : 0,
    worstTrade: row.minPnl < 0 ? row.minPnl : 0,
  };
}
