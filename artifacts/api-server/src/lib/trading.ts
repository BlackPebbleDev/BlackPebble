import { dbAll, dbGet, dbRun, withTx } from "./database.js";
import { getSolPriceUsd, getExecutionPrice } from "./prices.js";
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

// --- Anti-whale: maximum share of a token's supply a single trader may hold ---
// A position (open tokens held) may never exceed this fraction of the token's
// total supply, derived from marketCap / price. This blocks unrealistic "buy
// the whole supply" paper trades that would otherwise farm the leaderboard,
// independently of (and in addition to) the per-trade liquidity-impact cap in
// slippage.ts — whichever limit is stricter for a given order applies first.
export const MAX_SUPPLY_PCT = 0.04; // 4% of total supply

/**
 * Maximum number of tokens a single trader may hold, given the token's market
 * cap and USD price (supply = marketCap / price). Returns null when supply
 * cannot be derived (no market cap / non-positive price), in which case the
 * supply cap is not enforced and only the liquidity-impact cap applies.
 */
export function maxTokensForSupply(
  marketCapUsd: number | null,
  priceUsd: number,
): number | null {
  if (marketCapUsd == null || !Number.isFinite(marketCapUsd) || marketCapUsd <= 0) {
    return null;
  }
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  const supply = marketCapUsd / priceUsd;
  if (!Number.isFinite(supply) || supply <= 0) return null;
  return supply * MAX_SUPPLY_PCT;
}

function supplyCapError(symbol: string | null | undefined): string {
  const pct = (MAX_SUPPLY_PCT * 100).toFixed(1).replace(/\.0$/, "");
  return `Position limit reached: a single trader can hold at most ${pct}% of ${
    symbol || "this token"
  }'s supply. Reduce your order size.`;
}

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
  season: number;
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
  // Slippage-free market cost basis (SOL). Null on legacy rows; callers fall
  // back to total_sol_spent when it is missing.
  cost_basis_market_sol: number | null;
  entry_market_cap: number | null;
  opened_at: number;
}

// Leaderboard tiers, keyed on all-time realized PnL (in SOL; accounts start at
// 100 SOL). Below the lowest threshold a trader is "Unranked".
const TIERS: { name: string; min: number }[] = [
  { name: "Legend", min: 1000 },
  { name: "Diamond", min: 300 },
  { name: "Gold", min: 100 },
  { name: "Silver", min: 25 },
  { name: "Bronze", min: 5 },
];

export function graduationTier(allTimePnl: number): string {
  for (const t of TIERS) {
    if (allTimePnl >= t.min) return t.name;
  }
  return "Unranked";
}

export async function ensureAccount(wallet: string): Promise<AccountRow> {
  await dbRun(
    `INSERT INTO accounts (wallet, paper_balance, created_at, last_active)
     VALUES ($1, $2, EXTRACT(EPOCH FROM NOW())::bigint, EXTRACT(EPOCH FROM NOW())::bigint)
     ON CONFLICT (wallet) DO NOTHING`,
    [wallet, STARTING_BALANCE],
  );
  return (await getAccount(wallet))!;
}

export async function getAccount(wallet: string): Promise<AccountRow | null> {
  return (
    (await dbGet<AccountRow>("SELECT * FROM accounts WHERE wallet = $1", [
      wallet,
    ])) ?? null
  );
}

export async function getOpenPositions(wallet: string): Promise<PositionRow[]> {
  return dbAll<PositionRow>(
    "SELECT * FROM positions WHERE wallet = $1 ORDER BY opened_at DESC",
    [wallet],
  );
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Award participation points (max MAX_POINTS_PER_DAY per day). */
async function recordParticipation(wallet: string): Promise<void> {
  const date = todayStr();
  await withTx(async (c) => {
    await dbRun(
      "INSERT INTO participation_metrics (wallet, date) VALUES ($1, $2) ON CONFLICT (wallet, date) DO NOTHING",
      [wallet, date],
      c,
    );
    const row =
      (await dbGet<{ trades_today: number; points_today: number }>(
        "SELECT trades_today, points_today FROM participation_metrics WHERE wallet = $1 AND date = $2 FOR UPDATE",
        [wallet, date],
        c,
      )) ?? { trades_today: 0, points_today: 0 };

    const newTrades = row.trades_today + 1;
    let newPoints = row.points_today;
    let award = 0;
    if (row.points_today < MAX_POINTS_PER_DAY) {
      newPoints += 1;
      award = 1;
    }
    await dbRun(
      "UPDATE participation_metrics SET trades_today = $1, points_today = $2 WHERE wallet = $3 AND date = $4",
      [newTrades, newPoints, wallet, date],
      c,
    );
    if (award > 0) {
      await dbRun(
        "UPDATE accounts SET participation_points = participation_points + $1 WHERE wallet = $2",
        [award, wallet],
        c,
      );
    }
  });
}

export interface ValuedPosition extends PositionRow {
  currentPriceSol: number | null;
  currentValueSol: number;
  unrealizedPnlSol: number;
  unrealizedPnlPercent: number;
  // Slippage-free market cost basis (SOL), with the legacy null fallback
  // already resolved to total_sol_spent.
  costBasisMarketSol: number;
  // Pure market movement P&L: currentValue measured against the slippage-free
  // cost basis (what the position would be worth ignoring entry trading costs).
  unrealizedPnlMarketSol: number;
  // Slippage/impact already paid on entry (≤ 0): costBasisMarket − total spent.
  tradingCostsSol: number;
  // Actual unrealized result including trading costs (= unrealizedPnlSol).
  netResultSol: number;
  currentMarketCapUsd: number | null;
  marketCapChangePercent: number | null;
}

export async function valuePositions(
  wallet: string,
): Promise<ValuedPosition[]> {
  const positions = await getOpenPositions(wallet);
  const valued = await Promise.all(
    positions.map(async (p) => {
      // Use the same trusted execution price source for both the current SOL
      // price and the current market cap, so valuation and the MC change stay
      // consistent with how trades actually fill.
      const px = await getExecutionPrice(p.token_mint);
      const price = px ? px.priceSol : null;
      const currentMarketCapUsd = px ? px.marketCapUsd : null;
      const currentValueSol =
        price != null ? p.total_tokens * price : p.total_sol_spent;
      const unrealizedPnlSol = currentValueSol - p.total_sol_spent;
      const unrealizedPnlPercent =
        p.total_sol_spent > 0
          ? (unrealizedPnlSol / p.total_sol_spent) * 100
          : 0;
      // P&L split (#8): separate pure market movement from the slippage/impact
      // already paid on entry. The slippage-free cost basis falls back to
      // total_sol_spent for legacy rows (then trading costs read as 0).
      const costBasisMarketSol = p.cost_basis_market_sol ?? p.total_sol_spent;
      const tradingCostsSol = costBasisMarketSol - p.total_sol_spent;
      const unrealizedPnlMarketSol = currentValueSol - costBasisMarketSol;
      const netResultSol = unrealizedPnlSol;
      // Null (not 0) when we cannot compute a real change: no entry MC stored,
      // a non-positive entry MC, or no current MC available right now.
      const marketCapChangePercent =
        p.entry_market_cap != null &&
        p.entry_market_cap > 0 &&
        currentMarketCapUsd != null
          ? ((currentMarketCapUsd - p.entry_market_cap) / p.entry_market_cap) *
            100
          : null;
      return {
        ...p,
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
  const account = await ensureAccount(wallet);
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
  await ensureAccount(wallet);

  const px = await getExecutionPrice(mint);
  if (!px) {
    return { ok: false, error: "Price data unavailable. Trade not executed." };
  }
  const { priceSol, priceUsd, solUsd, liquidityUsd, marketCapUsd, source, pair } =
    px;
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
    marketCapUsd,
  });
  if (!slip.ok) {
    return { ok: false, error: slip.error };
  }
  // Effective (slippage-adjusted) prices drive the executed quantity and the
  // value stored against the trade. The flat raw price is never used to fill.
  const effectivePriceUsd = slip.effectivePriceUsd;
  const price = effectivePriceUsd / solUsd; // effective price in SOL
  const tokensReceived = amountInUsd / effectivePriceUsd;
  // Slippage-free market cost basis added by this buy (#8): the tokens received
  // valued at the RAW mid price (priceSol), NOT the worse effective fill. The
  // gap between this and solAmount spent is the entry slippage/impact cost.
  const marketCostAddSol = tokensReceived * priceSol;
  // Entry market cap is display-only (never used in any quantity/PnL math).
  const entryMc =
    marketCapUsd != null && Number.isFinite(marketCapUsd) && marketCapUsd > 0
      ? marketCapUsd
      : null;
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
        marketCapUsd,
        source,
        pair,
        result: "executed",
      },
      "[trade-debug] buy execution",
    );
  }

  // All reads and writes happen inside a single transaction so concurrent
  // requests cannot overspend the balance or exceed position limits. The
  // account and position rows are locked FOR UPDATE.
  const result = await withTx(async (c): Promise<ExecuteResult> => {
    const acct = await dbGet<{ paper_balance: number }>(
      "SELECT paper_balance FROM accounts WHERE wallet = $1 FOR UPDATE",
      [wallet],
      c,
    );
    if (!acct || acct.paper_balance < solAmount) {
      return { ok: false, error: "Insufficient paper balance" };
    }

    // Idempotency guard: reject an identical buy submitted within the dedupe
    // window (accidental double-click / double-submit).
    const dup = await dbGet(
      `SELECT 1 FROM trades
         WHERE wallet = $1 AND token_mint = $2 AND side = 'buy'
           AND sol_amount = $3 AND executed_at >= $4 LIMIT 1`,
      [wallet, mint, solAmount, now - DUPLICATE_WINDOW_SECONDS],
      c,
    );
    if (dup) {
      return {
        ok: false,
        error: "Duplicate trade ignored. Please wait a moment before retrying.",
      };
    }

    const existing = await dbGet<PositionRow>(
      "SELECT * FROM positions WHERE wallet = $1 AND token_mint = $2 FOR UPDATE",
      [wallet, mint],
      c,
    );

    if (!existing) {
      const count = await dbGet<{ c: number }>(
        "SELECT COUNT(*)::int AS c FROM positions WHERE wallet = $1",
        [wallet],
        c,
      );
      if ((count?.c ?? 0) >= MAX_POSITIONS) {
        return {
          ok: false,
          error: `Maximum of ${MAX_POSITIONS} open positions reached`,
        };
      }
    }

    // Anti-whale supply cap: a trader's total holding (existing + this order)
    // may not exceed MAX_SUPPLY_PCT of the token's supply. This is checked
    // inside the locked transaction so concurrent buys can't race past it.
    const maxTokens = maxTokensForSupply(marketCapUsd, priceUsd);
    if (maxTokens != null) {
      const heldAfter = (existing?.total_tokens ?? 0) + tokensReceived;
      if (heldAfter > maxTokens) {
        return { ok: false, error: supplyCapError(meta.symbol) };
      }
    }

    await dbRun(
      "UPDATE accounts SET paper_balance = paper_balance - $1, total_trades = total_trades + 1, last_active = $2 WHERE wallet = $3",
      [solAmount, now, wallet],
      c,
    );

    if (existing) {
      const totalTokens = existing.total_tokens + tokensReceived;
      const totalSpent = existing.total_sol_spent + solAmount;
      // SOL-weighted average entry market cap, mirroring avg_entry_price. Keep
      // the prior value if this add has no market cap, and seed it if the
      // existing position never had one.
      let newEntryMc = existing.entry_market_cap;
      if (entryMc != null) {
        newEntryMc =
          existing.entry_market_cap != null
            ? (existing.entry_market_cap * existing.total_sol_spent +
                entryMc * solAmount) /
              totalSpent
            : entryMc;
      }
      const newCostBasisMarket =
        (existing.cost_basis_market_sol ?? existing.total_sol_spent) +
        marketCostAddSol;
      await dbRun(
        "UPDATE positions SET total_tokens = $1, total_sol_spent = $2, avg_entry_price = $3, cost_basis_market_sol = $4, entry_market_cap = $5 WHERE id = $6",
        [
          totalTokens,
          totalSpent,
          totalSpent / totalTokens,
          newCostBasisMarket,
          newEntryMc,
          existing.id,
        ],
        c,
      );
    } else {
      await dbRun(
        `INSERT INTO positions (wallet, token_mint, token_name, token_symbol, token_logo, total_tokens, total_sol_spent, avg_entry_price, cost_basis_market_sol, entry_market_cap, opened_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          wallet,
          mint,
          meta.name ?? null,
          meta.symbol ?? null,
          meta.logo ?? null,
          tokensReceived,
          solAmount,
          solAmount / tokensReceived,
          marketCostAddSol,
          entryMc,
          now,
        ],
        c,
      );
    }

    await dbRun(
      `INSERT INTO trades (
         wallet, token_mint, token_name, token_symbol, token_logo, side,
         sol_amount, token_amount, price, pnl, executed_at,
         raw_price_usd, effective_price_usd, slippage_percent,
         trade_impact_percent, liquidity_usd_at_execution,
         sol_usd_price_at_execution, trade_usd_value
       )
       VALUES ($1, $2, $3, $4, $5, 'buy', $6, $7, $8, NULL, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
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
      ],
      c,
    );
    return { ok: true };
  });

  if (!result.ok) return result;
  await recordParticipation(wallet);

  const updated = (await getAccount(wallet))!;
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
  opts: { tokenAmount?: number; percent?: number; source?: string | null },
): Promise<ExecuteResult> {
  await ensureAccount(wallet);
  if (opts.percent == null && opts.tokenAmount == null) {
    return { ok: false, error: "Specify tokenAmount or percent" };
  }

  const px = await getExecutionPrice(mint);
  if (!px) {
    return { ok: false, error: "Price data unavailable. Trade not executed." };
  }
  const { priceSol, priceUsd, solUsd, liquidityUsd, marketCapUsd, source, pair } =
    px;
  // Never trade on a non-finite or non-positive price — a bad upstream feed
  // could otherwise produce NaN/Infinity/zero proceeds and poison stats.
  if (![priceSol, priceUsd, solUsd].every((v) => Number.isFinite(v) && v > 0)) {
    return { ok: false, error: "Price data unavailable. Trade not executed." };
  }

  const now = Math.floor(Date.now() / 1000);

  // Re-read account and position inside the transaction (locked FOR UPDATE) so
  // concurrent sells cannot double-credit a position that another request
  // already closed. Lock order MUST match executeBuy (accounts → positions) so
  // a concurrent buy + sell on the same wallet/mint cannot deadlock.
  const result = await withTx(async (c): Promise<ExecuteResult> => {
    const account = await dbGet<AccountRow>(
      "SELECT * FROM accounts WHERE wallet = $1 FOR UPDATE",
      [wallet],
      c,
    );
    if (!account) {
      return { ok: false, error: "Account not found" };
    }
    const position = await dbGet<PositionRow>(
      "SELECT * FROM positions WHERE wallet = $1 AND token_mint = $2 FOR UPDATE",
      [wallet, mint],
      c,
    );
    if (!position) {
      return { ok: false, error: "No open position for this token" };
    }

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
    const dup = await dbGet(
      `SELECT 1 FROM trades
         WHERE wallet = $1 AND token_mint = $2 AND side = 'sell'
           AND executed_at >= $3 AND ABS(token_amount - $4) <= $5 LIMIT 1`,
      [
        wallet,
        mint,
        now - DUPLICATE_WINDOW_SECONDS,
        tokenAmount,
        Math.max(tokenAmount * 1e-6, 1e-9),
      ],
      c,
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
      marketCapUsd,
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
    // Reduce the slippage-free market cost basis (#8) by the same fraction so
    // the trading-costs split stays proportional after a partial sell.
    const costBasisMarket =
      position.cost_basis_market_sol ?? position.total_sol_spent;
    const remainingCostBasisMarket = costBasisMarket * (1 - fraction);
    if (remainingTokens <= position.total_tokens * 0.000001) {
      await dbRun("DELETE FROM positions WHERE id = $1", [position.id], c);
    } else {
      await dbRun(
        "UPDATE positions SET total_tokens = $1, total_sol_spent = $2, cost_basis_market_sol = $3 WHERE id = $4",
        [remainingTokens, remainingSpent, remainingCostBasisMarket, position.id],
        c,
      );
    }

    const winInc = pnl > 0 ? 1 : 0;
    const streak = pnl > 0 ? account.current_streak + 1 : 0;
    const best = Math.max(account.best_trade, pnl);
    const worst = Math.min(account.worst_trade, pnl);
    const newRealized = account.realized_pnl + pnl;
    const newTier = graduationTier(newRealized);

    await dbRun(
      `UPDATE accounts SET
         paper_balance = paper_balance + $1,
         total_trades = total_trades + 1,
         winning_trades = winning_trades + $2,
         realized_pnl = $3,
         total_pnl = $4,
         best_trade = $5,
         worst_trade = $6,
         current_streak = $7,
         graduation_tier = $8,
         last_active = $9
       WHERE wallet = $10`,
      [
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
      ],
      c,
    );

    await dbRun(
      `INSERT INTO trades (
         wallet, token_mint, token_name, token_symbol, token_logo, side,
         sol_amount, token_amount, price, pnl, source, executed_at,
         raw_price_usd, effective_price_usd, slippage_percent,
         trade_impact_percent, liquidity_usd_at_execution,
         sol_usd_price_at_execution, trade_usd_value
       )
       VALUES ($1, $2, $3, $4, $5, 'sell', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        wallet,
        mint,
        position.token_name,
        position.token_symbol,
        position.token_logo,
        solReceived,
        tokenAmount,
        price,
        pnl,
        opts.source ?? null,
        now,
        priceUsd,
        effectivePriceUsd,
        slip.slippagePercent,
        slip.tradeImpactPercent,
        slip.liquidityUsd,
        solUsd,
        tradeUsdValue,
      ],
      c,
    );

    return {
      ok: true,
      trade: { side: "sell", mint, solAmount: solReceived, tokenAmount, price, pnl },
    };
  });

  if (!result.ok) return result;
  await recordParticipation(wallet);

  const updated = (await getAccount(wallet))!;
  return { ...result, balance: updated.paper_balance };
}

export interface TradeQuote {
  ok: boolean;
  error?: string;
  /** True only when rejected for exceeding the max liquidity impact. */
  blocked?: boolean;
  /** True when the fill was simulated from market cap (liquidity missing). */
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
      error: "Trading unavailable: insufficient live market data.",
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
  const { priceUsd, solUsd, liquidityUsd, marketCapUsd } = px;

  // Defensive: stale/garbage feed data must not feed NaN/Infinity into the
  // preview math below (token/SOL estimates divide by price and solUsd). The
  // execute path already rejects non-finite/non-positive prices; mirror that
  // here so the preview fails loudly instead of rendering nonsense.
  if (
    !Number.isFinite(priceUsd) ||
    priceUsd <= 0 ||
    !Number.isFinite(solUsd) ||
    solUsd <= 0
  ) {
    return {
      ok: false,
      error: "Trading unavailable: insufficient live market data.",
      side,
      rawPriceUsd: 0,
      effectivePriceUsd: 0,
      slippagePercent: 0,
      tradeImpactPercent: 0,
      liquidityUsd: Number.isFinite(liquidityUsd) ? (liquidityUsd ?? 0) : 0,
      solUsd: Number.isFinite(solUsd) && solUsd > 0 ? solUsd : 0,
      tradeUsdValue: 0,
      warningLevel: "none",
      estimatedTokens: null,
      estimatedSol: null,
    };
  }

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
        ? await dbGet<{ total_tokens: number }>(
            "SELECT total_tokens FROM positions WHERE wallet = $1 AND token_mint = $2",
            [opts.wallet, mint],
          )
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
    marketCapUsd,
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

  // Anti-whale supply cap (buys only): mirror executeBuy so the preview blocks
  // an order that would push the trader's total holding past MAX_SUPPLY_PCT of
  // supply. Applied on top of the liquidity-impact cap — whichever is stricter.
  let supplyOk = true;
  let supplyError: string | undefined;
  if (slip.ok && side === "buy" && estimatedTokens != null) {
    const maxTokens = maxTokensForSupply(marketCapUsd, priceUsd);
    if (maxTokens != null) {
      const held = opts.wallet
        ? (
            await dbGet<{ total_tokens: number }>(
              "SELECT total_tokens FROM positions WHERE wallet = $1 AND token_mint = $2",
              [opts.wallet, mint],
            )
          )?.total_tokens ?? 0
        : 0;
      if (held + estimatedTokens > maxTokens) {
        supplyOk = false;
        supplyError = supplyCapError(undefined);
      }
    }
  }

  return {
    ok: slip.ok && supplyOk,
    error: supplyError ?? slip.error,
    blocked: slip.blocked || !supplyOk,
    lowData: slip.lowData,
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

export async function resetAccount(wallet: string): Promise<ExecuteResult> {
  const account = await ensureAccount(wallet);
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
  await withTx(async (c) => {
    await dbRun("DELETE FROM positions WHERE wallet = $1", [wallet], c);
    await dbRun(
      "UPDATE accounts SET paper_balance = $1, last_reset_at = $2, current_streak = 0 WHERE wallet = $3",
      [STARTING_BALANCE, now, wallet],
      c,
    );
  });
  return { ok: true, balance: STARTING_BALANCE };
}

export interface NewSeasonResult {
  ok: boolean;
  error?: string;
  balance?: number;
  season?: number;
}

/**
 * Self-service "start a new season" reset for a depleted paper account.
 *
 * Mirrors the admin single-user reset but is user-initiated and gated on the
 * account being effectively wiped out (total equity — cash + open positions —
 * below RESET_THRESHOLD). It cancels pending orders, clears open positions and
 * resets cash to STARTING_BALANCE, bumping `last_reset_at` (which windows the
 * leaderboard / closed-trade stats so the previous season's P&L and trade
 * history drop out) and incrementing the `season` counter. Identity, wallet/X
 * links and the watchlist are never touched.
 *
 * NOTE (future full-season history): trade rows are intentionally preserved and
 * simply windowed by last_reset_at. A full archive would add a
 * `seasons(wallet, season, started_at, ended_at, final_pnl …)` table and stamp
 * each trade/snapshot with its season; out of scope here.
 */
export async function startNewSeason(wallet: string): Promise<NewSeasonResult> {
  const portfolio = await getPortfolio(wallet);
  if (portfolio.equitySol >= RESET_THRESHOLD) {
    return {
      ok: false,
      error: `A new season is only available once your total equity falls below ${RESET_THRESHOLD} SOL.`,
    };
  }
  const now = Math.floor(Date.now() / 1000);
  const result = await withTx(async (c) => {
    // Cancel any still-pending/active orders so they don't fire post-reset.
    await dbRun(
      `UPDATE paper_orders
         SET status = 'canceled', updated_at = $2, fill_reason = 'season_reset'
       WHERE wallet = $1 AND status IN ('pending', 'filling')`,
      [wallet, now],
      c,
    );
    await dbRun("DELETE FROM positions WHERE wallet = $1", [wallet], c);
    const row = await dbGet<{ season: number }>(
      `UPDATE accounts
         SET paper_balance = $1,
             last_reset_at = $2,
             current_streak = 0,
             season = COALESCE(season, 1) + 1
       WHERE wallet = $3
       RETURNING season`,
      [STARTING_BALANCE, now, wallet],
      c,
    );
    return row;
  });
  return { ok: true, balance: STARTING_BALANCE, season: result?.season ?? 1 };
}

export async function getHistory(wallet: string, limit = 100) {
  return dbAll(
    "SELECT * FROM trades WHERE wallet = $1 ORDER BY executed_at DESC LIMIT $2",
    [wallet, limit],
  );
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
export async function getClosedTradeStats(
  wallet: string,
): Promise<ClosedTradeStats> {
  const acct = await dbGet<{ last_reset_at: number | null }>(
    "SELECT last_reset_at FROM accounts WHERE wallet = $1",
    [wallet],
  );
  const since = acct?.last_reset_at ?? 0;

  // Aliases are double-quoted so node-postgres preserves their camelCase keys
  // (unquoted identifiers are folded to lowercase by Postgres).
  const row = (await dbGet<{
    closedTrades: number;
    winningTrades: number;
    realizedPnl: number;
    maxPnl: number;
    minPnl: number;
  }>(
    `SELECT
       COUNT(*)::int AS "closedTrades",
       COALESCE(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END), 0)::int AS "winningTrades",
       COALESCE(SUM(pnl), 0) AS "realizedPnl",
       COALESCE(MAX(pnl), 0) AS "maxPnl",
       COALESCE(MIN(pnl), 0) AS "minPnl"
     FROM trades
     WHERE wallet = $1 AND side = 'sell' AND pnl IS NOT NULL AND executed_at > $2`,
    [wallet, since],
  ))!;

  // All executions (buys + sells) over the same post-reset window.
  const exec = await dbGet<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM trades WHERE wallet = $1 AND executed_at > $2",
    [wallet, since],
  );
  const executions = exec?.c ?? 0;

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
  graduation_tier: string;
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
export async function getLeaderboard(
  period: LeaderboardPeriod,
  limit = 100,
): Promise<LeaderboardEntry[]> {
  const now = Math.floor(Date.now() / 1000);
  let periodStart = 0;
  if (period === "daily") periodStart = now - 86_400;
  else if (period === "weekly") periodStart = now - 7 * 86_400;

  const maxCreatedAt = now - MIN_ACCOUNT_AGE_SECONDS;

  // The trade aggregation and the identity lookup are kept in separate CTEs and
  // joined last, so a wallet/user that happens to have multiple identity rows
  // can never duplicate or skew the per-wallet trade aggregates.
  const rows = await dbAll<{
    wallet: string;
    created_at: number;
    total_closed_trades: number;
    winning_trades: number;
    realized_pnl: number;
    best_trade: number;
    cost_basis: number;
    updated_at: number;
    graduation_tier: string;
    x_username: string | null;
    x_avatar_url: string | null;
    x_display_name: string | null;
  }>(
    `WITH agg AS (
       SELECT
         a.wallet AS wallet,
         a.created_at AS created_at,
         a.graduation_tier AS graduation_tier,
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
           WHEN $1 > COALESCE(a.last_reset_at, 0) THEN $1
           ELSE COALESCE(a.last_reset_at, 0)
         END
         AND a.created_at <= $2
       GROUP BY a.wallet, a.graduation_tier
       HAVING COUNT(*) >= $3
     ),
     ident AS (
       -- Wallet-keyed accounts: resolve the X profile linked to the wallet.
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
       UNION ALL
       -- X-only accounts: the account key is the synthetic 'x:<x_id>' identity.
       SELECT
         ('x:' || xi.provider_user_id) AS wallet,
         xi.x_username AS x_username,
         u.avatar_url AS x_avatar_url,
         u.display_name AS x_display_name
       FROM user_identities xi
       JOIN users u ON u.id = xi.user_id
       WHERE xi.provider = 'x'
     )
     SELECT
       agg.wallet AS wallet,
       agg.created_at AS created_at,
       agg.graduation_tier AS graduation_tier,
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
     LIMIT $4`,
    [periodStart, maxCreatedAt, MIN_LEADERBOARD_TRADES, limit],
  );

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
    graduation_tier: r.graduation_tier ?? "Unranked",
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}
