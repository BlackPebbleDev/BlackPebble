import { Router } from "express";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import db from "../lib/database.js";
import { logger } from "../lib/logger.js";

const router = Router();

async function getSolPrice(): Promise<number> {
  try {
    const resp = await axios.get(
      "https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112",
      { timeout: 5000 }
    );
    return resp.data?.data?.["So11111111111111111111111111111111111111112"]?.price || 150;
  } catch {
    return 150;
  }
}

async function getTokenPrice(mintAddress: string): Promise<number | null> {
  try {
    const resp = await axios.get(
      `https://price.jup.ag/v6/price?ids=${mintAddress}`,
      { timeout: 5000 }
    );
    if (resp.data?.data?.[mintAddress]?.price) {
      return resp.data.data[mintAddress].price;
    }
  } catch {}
  try {
    const resp = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
      { timeout: 8000 }
    );
    if (resp.data?.pairs?.length > 0) {
      return parseFloat(resp.data.pairs[0].priceUsd) || null;
    }
  } catch {}
  return null;
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

function upsertWeeklyCompetition(wallet: string, pnlDelta: number): void {
  const weekStart = getWeekStart();
  db.prepare(`
    INSERT INTO weekly_competitions (wallet, week_start, week_pnl, week_trades)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(wallet, week_start) DO UPDATE SET
      week_pnl = week_pnl + excluded.week_pnl,
      week_trades = week_trades + 1
  `).run(wallet, weekStart, pnlDelta);
}

function checkGraduationTier(wallet: string): void {
  const account = db.prepare("SELECT realized_pnl FROM paper_accounts WHERE wallet = ?").get(wallet) as any;
  if (!account) return;
  let tier = "none";
  if (account.realized_pnl >= 500) tier = "fund-manager";
  else if (account.realized_pnl >= 200) tier = "senior-analyst";
  else if (account.realized_pnl >= 50) tier = "analyst";
  db.prepare("UPDATE paper_accounts SET graduation_tier = ? WHERE wallet = ?").run(tier, wallet);
}

function ensureAccount(wallet: string): void {
  const existing = db.prepare("SELECT wallet FROM paper_accounts WHERE wallet = ?").get(wallet);
  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO paper_accounts (wallet, paper_balance, total_pnl, realized_pnl, total_trades,
        winning_trades, participation_points, graduation_tier, created_at, last_trade_at)
      VALUES (?, 100.0, 0.0, 0.0, 0, 0, 0, 'none', ?, ?)
    `).run(wallet, now, now);
  }
}

function formatBigNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

// GET /api/paper/account/:wallet
router.get("/paper/account/:wallet", (req, res) => {
  try {
    const { wallet } = req.params;
    ensureAccount(wallet);
    const account = db.prepare("SELECT * FROM paper_accounts WHERE wallet = ?").get(wallet) as any;
    const weekStart = getWeekStart();
    const weekRow = db.prepare(
      "SELECT week_pnl, week_trades FROM weekly_competitions WHERE wallet = ? AND week_start = ?"
    ).get(wallet, weekStart) as any;
    res.json({
      ...account,
      weekPnl: weekRow?.week_pnl || 0,
      weekTrades: weekRow?.week_trades || 0
    });
  } catch (err) {
    logger.error({ err }, "GET /api/paper/account error");
    res.status(500).json({ error: "Failed to load account" });
  }
});

// POST /api/paper/search
router.post("/paper/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) return res.json({ results: [] });
    const resp = await axios.get(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      { timeout: 8000 }
    );
    const pairs: any[] = resp.data?.pairs || [];
    const solanaPairs = pairs.filter((p) => p.chainId === "solana");
    const seen = new Map<string, any>();
    for (const pair of solanaPairs) {
      const mint = pair.baseToken?.address;
      if (!mint) continue;
      const liq = pair.liquidity?.usd || 0;
      if (!seen.has(mint) || liq > (seen.get(mint).liquidity?.usd || 0)) {
        seen.set(mint, pair);
      }
    }
    const results = Array.from(seen.values())
      .slice(0, 10)
      .map((pair) => ({
        mint: pair.baseToken.address,
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        price: parseFloat(pair.priceUsd) || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        marketCap: pair.marketCap || 0,
        volume24h: pair.volume?.h24 || 0,
        logo: pair.info?.imageUrl || null
      }));
    res.json({ results });
  } catch (err) {
    logger.error({ err }, "POST /api/paper/search error");
    res.json({ results: [] });
  }
});

// GET /api/paper/token/:mintAddress
router.get("/paper/token/:mintAddress", async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const [dexResult, jupResult] = await Promise.allSettled([
      axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`, { timeout: 8000 }),
      axios.get(`https://price.jup.ag/v6/price?ids=${mintAddress}`, { timeout: 5000 })
    ]);
    let pair: any = null;
    if (dexResult.status === "fulfilled" && dexResult.value.data?.pairs?.length > 0) {
      pair = dexResult.value.data.pairs.sort((a: any, b: any) =>
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];
    }
    let priceUsd: number | null = null;
    if (jupResult.status === "fulfilled" && jupResult.value.data?.data?.[mintAddress]?.price) {
      priceUsd = jupResult.value.data.data[mintAddress].price;
    } else if (pair?.priceUsd) {
      priceUsd = parseFloat(pair.priceUsd) || null;
    }
    if (!pair && priceUsd === null) {
      return res.status(404).json({ error: "Token not found" });
    }
    res.json({
      mint: mintAddress,
      name: pair?.baseToken?.name || "Unknown Token",
      symbol: pair?.baseToken?.symbol || "???",
      logo: pair?.info?.imageUrl || null,
      priceUsd,
      marketCap: pair?.marketCap || 0,
      volume24h: pair?.volume?.h24 || 0,
      priceChange24h: pair?.priceChange?.h24 || 0,
      liquidity: pair?.liquidity?.usd || 0,
      pairAddress: pair?.pairAddress || null
    });
  } catch (err) {
    logger.error({ err }, "GET /api/paper/token error");
    res.status(500).json({ error: "Failed to fetch token data" });
  }
});

// POST /api/paper/trade
router.post("/paper/trade", async (req, res) => {
  try {
    const { wallet, tokenMint, side, solAmount: rawAmount, positionId } = req.body;
    if (!wallet || !tokenMint || !side || rawAmount === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const solAmount = parseFloat(rawAmount);
    if (isNaN(solAmount) || solAmount < 0.1) {
      return res.status(400).json({ error: "Minimum trade is 0.1 SOL" });
    }

    ensureAccount(wallet);
    const account = db.prepare("SELECT * FROM paper_accounts WHERE wallet = ?").get(wallet) as any;
    const now = new Date().toISOString();

    const [tokenPriceUsd, solPriceUsd] = await Promise.all([
      getTokenPrice(tokenMint),
      getSolPrice()
    ]);

    if (tokenPriceUsd === null) {
      return res.status(400).json({ error: "Price unavailable for this token. Trading is disabled." });
    }

    const tokenPriceSol = tokenPriceUsd / solPriceUsd;

    if (side === "buy") {
      if (account.paper_balance < solAmount) {
        return res.status(400).json({ error: `Insufficient balance. You have ${account.paper_balance.toFixed(3)} SOL available.` });
      }
      const openCount = (db.prepare(
        "SELECT COUNT(*) as c FROM paper_positions WHERE wallet = ? AND status = 'open'"
      ).get(wallet) as any).c;
      if (openCount >= 20) {
        return res.status(400).json({ error: "Maximum 20 open positions reached. Close a position before opening a new one." });
      }

      const tokensReceived = (solAmount / tokenPriceSol) * 0.99;

      let tokenName = "Unknown", tokenSymbol = "???", tokenLogo = null;
      try {
        const dex = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, { timeout: 5000 });
        if (dex.data?.pairs?.length > 0) {
          tokenName = dex.data.pairs[0].baseToken.name;
          tokenSymbol = dex.data.pairs[0].baseToken.symbol;
          tokenLogo = dex.data.pairs[0].info?.imageUrl || null;
        }
      } catch {}

      const existingPos = db.prepare(
        "SELECT * FROM paper_positions WHERE wallet = ? AND token_mint = ? AND status = 'open'"
      ).get(wallet, tokenMint) as any;

      db.transaction(() => {
        if (existingPos) {
          const newTotal = existingPos.total_tokens + tokensReceived;
          const newSol = existingPos.total_sol_spent + solAmount;
          db.prepare(`UPDATE paper_positions SET total_tokens=?, total_sol_spent=?, avg_entry_price=? WHERE id=?`)
            .run(newTotal, newSol, newSol / newTotal, existingPos.id);
        } else {
          db.prepare(`
            INSERT INTO paper_positions (wallet,token_mint,token_name,token_symbol,token_logo,total_tokens,total_sol_spent,avg_entry_price,last_price_sol,last_price_updated,opened_at,status)
            VALUES (?,?,?,?,?,?,?,?,?,?,'${now}','open')
          `).run(wallet, tokenMint, tokenName, tokenSymbol, tokenLogo, tokensReceived, solAmount, tokenPriceSol, tokenPriceSol, now);
        }
        db.prepare(`
          INSERT INTO paper_trades (wallet,token_mint,token_name,token_symbol,side,sol_amount,token_amount,price_per_token,pnl_sol,timestamp)
          VALUES (?,?,?,?,'buy',?,?,?,0,?)
        `).run(wallet, tokenMint, tokenName, tokenSymbol, solAmount, tokensReceived, tokenPriceSol, now);

        const today = now.split("T")[0];
        const todayCount = (db.prepare(
          "SELECT COUNT(*) as c FROM paper_trades WHERE wallet=? AND timestamp LIKE ?"
        ).get(wallet, `${today}%`) as any).c;
        const pts = todayCount <= 5 ? 1 : 0;

        db.prepare(`
          UPDATE paper_accounts SET paper_balance=paper_balance-?, total_trades=total_trades+1,
          participation_points=participation_points+?, last_trade_at=? WHERE wallet=?
        `).run(solAmount, pts, now, wallet);

        upsertWeeklyCompetition(wallet, 0);
      })();

      return res.json({
        success: true,
        message: `Bought ${formatBigNumber(tokensReceived)} ${tokenSymbol} for ${solAmount} SOL`,
        tokensReceived,
        pricePerToken: tokenPriceSol,
        tokenSymbol,
        newBalance: account.paper_balance - solAmount
      });
    }

    if (side === "sell") {
      if (!positionId) {
        return res.status(400).json({ error: "Position ID required for sell" });
      }
      const position = db.prepare(
        "SELECT * FROM paper_positions WHERE id=? AND wallet=? AND status='open'"
      ).get(positionId, wallet) as any;
      if (!position) {
        return res.status(400).json({ error: "Position not found" });
      }

      const solReceived = position.total_tokens * tokenPriceSol * 0.99;
      const pnlSol = solReceived - position.total_sol_spent;

      db.transaction(() => {
        db.prepare("UPDATE paper_positions SET status='closed' WHERE id=?").run(positionId);
        db.prepare(`
          INSERT INTO paper_trades (wallet,token_mint,token_name,token_symbol,side,sol_amount,token_amount,price_per_token,pnl_sol,timestamp)
          VALUES (?,?,?,?,'sell',?,?,?,?,?)
        `).run(wallet, position.token_mint, position.token_name, position.token_symbol, solReceived, position.total_tokens, tokenPriceSol, pnlSol, now);

        const today = now.split("T")[0];
        const todayCount = (db.prepare(
          "SELECT COUNT(*) as c FROM paper_trades WHERE wallet=? AND timestamp LIKE ?"
        ).get(wallet, `${today}%`) as any).c;
        const pts = todayCount <= 5 ? 1 : 0;
        const isWin = pnlSol > 0 ? 1 : 0;

        db.prepare(`
          UPDATE paper_accounts SET paper_balance=paper_balance+?, realized_pnl=realized_pnl+?,
          total_pnl=total_pnl+?, total_trades=total_trades+1, winning_trades=winning_trades+?,
          participation_points=participation_points+?, last_trade_at=? WHERE wallet=?
        `).run(solReceived, pnlSol, pnlSol, isWin, pts, now, wallet);

        checkGraduationTier(wallet);
        upsertWeeklyCompetition(wallet, pnlSol);
      })();

      return res.json({
        success: true,
        message: `Sold ${formatBigNumber(position.total_tokens)} ${position.token_symbol} for ${solReceived.toFixed(3)} SOL (${pnlSol >= 0 ? "+" : ""}${pnlSol.toFixed(3)} SOL)`,
        solReceived,
        pnlSol,
        tokenSymbol: position.token_symbol,
        newBalance: account.paper_balance + solReceived
      });
    }

    return res.status(400).json({ error: "Invalid side. Must be 'buy' or 'sell'." });
  } catch (err) {
    logger.error({ err }, "POST /api/paper/trade error");
    res.status(500).json({ error: "Trade failed — please try again" });
  }
});

// GET /api/paper/positions/:wallet
router.get("/paper/positions/:wallet", async (req, res) => {
  try {
    const { wallet } = req.params;
    const rows = db.prepare(
      "SELECT * FROM paper_positions WHERE wallet=? AND status='open' ORDER BY opened_at DESC"
    ).all(wallet) as any[];

    if (rows.length === 0) return res.json({ positions: [] });

    const solPrice = await getSolPrice();
    const positions = await Promise.all(
      rows.map(async (pos) => {
        const priceUsd = await getTokenPrice(pos.token_mint);
        const priceSol = priceUsd !== null ? priceUsd / solPrice : pos.last_price_sol;
        const currentValue = priceSol !== null ? pos.total_tokens * priceSol : null;
        const pnlSol = currentValue !== null ? currentValue - pos.total_sol_spent : null;
        const pnlPct = pnlSol !== null ? (pnlSol / pos.total_sol_spent) * 100 : null;

        if (priceSol !== null) {
          db.prepare(
            "UPDATE paper_positions SET last_price_sol=?, last_price_updated=? WHERE id=?"
          ).run(priceSol, new Date().toISOString(), pos.id);
        }

        return {
          id: pos.id,
          tokenMint: pos.token_mint,
          tokenName: pos.token_name,
          tokenSymbol: pos.token_symbol,
          tokenLogo: pos.token_logo,
          totalTokens: pos.total_tokens,
          totalSolSpent: pos.total_sol_spent,
          avgEntryPrice: pos.avg_entry_price,
          currentPriceSol: priceSol,
          currentValue,
          pnlSol,
          pnlPct,
          openedAt: pos.opened_at
        };
      })
    );

    res.json({ positions });
  } catch (err) {
    logger.error({ err }, "GET /api/paper/positions error");
    res.json({ positions: [] });
  }
});

// GET /api/paper/history/:wallet
router.get("/paper/history/:wallet", (req, res) => {
  try {
    const { wallet } = req.params;
    const trades = db.prepare(
      "SELECT * FROM paper_trades WHERE wallet=? ORDER BY timestamp DESC LIMIT 100"
    ).all(wallet) as any[];
    res.json({
      trades: trades.map((t) => ({
        id: t.id,
        tokenMint: t.token_mint,
        tokenName: t.token_name,
        tokenSymbol: t.token_symbol,
        side: t.side,
        solAmount: t.sol_amount,
        tokenAmount: t.token_amount,
        pricePerToken: t.price_per_token,
        pnlSol: t.pnl_sol,
        timestamp: t.timestamp
      }))
    });
  } catch (err) {
    logger.error({ err }, "GET /api/paper/history error");
    res.json({ trades: [] });
  }
});

// GET /api/paper/leaderboard?period=all|month|week
router.get("/paper/leaderboard", (req, res) => {
  try {
    const period = (req.query.period as string) || "all";
    let rows: any[] = [];

    if (period === "week") {
      const weekStart = getWeekStart();
      rows = db.prepare(`
        SELECT w.wallet, w.week_pnl as total_pnl, w.week_trades as total_trades,
               a.winning_trades, a.graduation_tier
        FROM weekly_competitions w LEFT JOIN paper_accounts a ON a.wallet=w.wallet
        WHERE w.week_start=? ORDER BY w.week_pnl DESC LIMIT 50
      `).all(weekStart) as any[];
    } else if (period === "month") {
      const ms = new Date();
      ms.setDate(1); ms.setHours(0, 0, 0, 0);
      rows = db.prepare(`
        SELECT a.wallet, a.realized_pnl as total_pnl, a.total_trades, a.winning_trades, a.graduation_tier
        FROM paper_accounts a
        WHERE a.last_trade_at >= ?
        ORDER BY a.realized_pnl DESC LIMIT 50
      `).all(ms.toISOString()) as any[];
    } else {
      rows = db.prepare(`
        SELECT a.wallet, a.realized_pnl as total_pnl, a.total_trades, a.winning_trades, a.graduation_tier,
               (SELECT COUNT(*) FROM paper_trades pt WHERE pt.wallet=a.wallet AND pt.side='sell') as closed_trades
        FROM paper_accounts a
        WHERE (SELECT COUNT(*) FROM paper_trades pt WHERE pt.wallet=a.wallet AND pt.side='sell') >= 5
        ORDER BY a.realized_pnl DESC LIMIT 50
      `).all() as any[];
    }

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      wallet: r.wallet,
      walletShort: `${r.wallet.slice(0, 4)}...${r.wallet.slice(-4)}`,
      totalPnl: r.total_pnl || 0,
      roi: r.total_pnl || 0,
      winRate: r.total_trades > 0 ? Math.round((r.winning_trades / r.total_trades) * 100) : 0,
      totalTrades: r.total_trades || 0,
      graduationTier: r.graduation_tier || "none"
    }));

    res.json({ leaderboard, period });
  } catch (err) {
    logger.error({ err }, "GET /api/paper/leaderboard error");
    res.json({ leaderboard: [], period: "all" });
  }
});

// GET /api/paper/competition
router.get("/paper/competition", (req, res) => {
  try {
    const weekStart = getWeekStart();
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const ms = weekEnd.getTime() - Date.now();
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);

    const top = db.prepare(`
      SELECT w.wallet, w.week_pnl FROM weekly_competitions w
      WHERE w.week_start=? ORDER BY w.week_pnl DESC LIMIT 10
    `).all(weekStart) as any[];

    res.json({
      weekStart,
      timeRemaining: `${days}d ${hours}h ${minutes}m`,
      topPerformers: top.map((t, i) => ({
        rank: i + 1,
        walletShort: `${t.wallet.slice(0, 4)}...${t.wallet.slice(-4)}`,
        weekPnl: t.week_pnl,
        multiplier: i === 0 ? 2.0 : i < 3 ? 1.5 : 1.25
      }))
    });
  } catch (err) {
    logger.error({ err }, "GET /api/paper/competition error");
    res.json({ timeRemaining: "—", topPerformers: [] });
  }
});

export { getWeekStart };
export default router;
