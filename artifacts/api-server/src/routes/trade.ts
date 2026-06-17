import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireOwnership } from "../lib/auth.js";
import { dbAll, dbRun } from "../lib/database.js";
import {
  searchTokens,
  getTokenInfo,
  getSolPriceUsd,
} from "../lib/prices.js";
import { pumpportal } from "../lib/pumpportal.js";
import {
  executeBuy,
  executeSell,
  valuePositions,
  getHistory,
  getTradeQuote,
} from "../lib/trading.js";
import {
  createOrder,
  createBuyLimitOrder,
  listOrders,
  cancelOrder,
  evaluateOrders,
  evaluateBuyLimitOrders,
} from "../lib/orders.js";

const router: IRouter = Router();

router.get(
  "/trade/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const wallet = req.query.wallet ? String(req.query.wallet) : null;
    if (!q) return res.json({ results: [] });
    const results = await searchTokens(q);
    await dbRun(
      "INSERT INTO search_activity (wallet, query, results_count) VALUES ($1, $2, $3)",
      [wallet, q, results.length],
    );
    return res.json({ results });
  }),
);

router.get(
  "/trade/token/:mint",
  asyncHandler(async (req, res) => {
    const mint = String(req.params.mint || "").trim();
    const wallet = req.query.wallet ? String(req.query.wallet) : null;
    if (!mint) return res.status(400).json({ error: "mint is required" });
    pumpportal.subscribeToken(mint);
    const info = await getTokenInfo(mint);
    if (!info) return res.status(404).json({ error: "Token not found" });
    await dbRun(
      "INSERT INTO token_views (wallet, token_mint) VALUES ($1, $2)",
      [wallet, mint],
    );
    return res.json(info);
  }),
);

router.post(
  "/trade/execute",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const wallet = String(b.wallet || "").trim();
    const mint = String(b.mint || "").trim();
    const side = String(b.side || "").trim();
    if (!wallet || !mint) {
      return res.status(400).json({ error: "wallet and mint are required" });
    }
    const meta = { name: b.name ?? null, symbol: b.symbol ?? null, logo: b.logo ?? null };

    if (side === "buy") {
      // USD-sized buys carry the raw usdAmount; convert to SOL here using the
      // server's authoritative SOL price so sizing never depends on the client's
      // (possibly stale) per-token rate. SOL-sized buys are unchanged.
      let solAmount = Number(b.solAmount);
      if (b.usdAmount != null) {
        const usd = Number(b.usdAmount);
        const solPrice = await getSolPriceUsd();
        if (!Number.isFinite(usd) || usd <= 0 || !solPrice || solPrice <= 0) {
          return res
            .status(400)
            .json({ ok: false, error: "SOL price unavailable; try again." });
        }
        solAmount = usd / solPrice;
      }
      const result = await executeBuy(wallet, mint, solAmount, meta);
      return res.status(result.ok ? 200 : 400).json(result);
    }
    if (side === "sell") {
      const result = await executeSell(wallet, mint, {
        tokenAmount: b.tokenAmount != null ? Number(b.tokenAmount) : undefined,
        percent: b.percent != null ? Number(b.percent) : undefined,
      });
      return res.status(result.ok ? 200 : 400).json(result);
    }
    return res.status(400).json({ error: "side must be 'buy' or 'sell'" });
  }),
);

router.post(
  "/trade/quote",
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const wallet = b.wallet ? String(b.wallet).trim() : undefined;
    const mint = String(b.mint || "").trim();
    const side = String(b.side || "").trim();
    if (!mint) return res.status(400).json({ error: "mint is required" });
    if (side !== "buy" && side !== "sell") {
      return res.status(400).json({ error: "side must be 'buy' or 'sell'" });
    }
    const quote = await getTradeQuote({
      wallet,
      mint,
      side,
      solAmount: b.solAmount != null ? Number(b.solAmount) : undefined,
      tokenAmount: b.tokenAmount != null ? Number(b.tokenAmount) : undefined,
      percent: b.percent != null ? Number(b.percent) : undefined,
    });
    return res.json(quote);
  }),
);

router.get(
  "/trade/positions/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const positions = await valuePositions(wallet);
    const solUsd = await getSolPriceUsd();
    // Evaluate TP/SL orders against the values we just fetched (no new external
    // calls for the check). Returns the orders that filled this pass so the
    // client can toast them. Never let an order-eval error break the positions
    // response — paper positions must always render.
    let orderFills: Awaited<ReturnType<typeof evaluateOrders>> = [];
    try {
      orderFills = await evaluateOrders(wallet, positions);
    } catch {
      orderFills = [];
    }
    // Re-value after fills so the client sees the post-sell position sizes.
    const finalPositions =
      orderFills.length > 0 ? await valuePositions(wallet) : positions;
    return res.json({ positions: finalPositions, solUsd, orderFills });
  }),
);

router.post(
  "/trade/orders",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const result = await createOrder({
      wallet: String(b.wallet || "").trim(),
      mint: String(b.mint || "").trim(),
      symbol: b.symbol ?? null,
      name: b.name ?? null,
      orderType: b.orderType,
      triggerType: b.triggerType,
      triggerValue: Number(b.triggerValue),
      amountPercent: Number(b.amountPercent),
    });
    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

router.post(
  "/trade/buy-limit",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const result = await createBuyLimitOrder({
      wallet: String(b.wallet || "").trim(),
      mint: String(b.mint || "").trim(),
      symbol: b.symbol ?? null,
      name: b.name ?? null,
      triggerMc: Number(b.triggerMc),
      solAmount: Number(b.solAmount),
    });
    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

router.get(
  "/trade/buy-limits/check/:wallet",
  requireOwnership((req) => String(req.params.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    let fills: Awaited<ReturnType<typeof evaluateBuyLimitOrders>> = [];
    try {
      fills = await evaluateBuyLimitOrders(wallet);
    } catch {
      fills = [];
    }
    return res.json({ fills });
  }),
);

router.get(
  "/trade/orders/:wallet",
  // Pending TP/SL orders reveal a user's future trading intent, so unlike public
  // positions/history reads this listing is restricted to the wallet's owner.
  requireOwnership((req) => String(req.params.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const mint = req.query.mint ? String(req.query.mint).trim() : undefined;
    return res.json({ orders: await listOrders(wallet, mint) });
  }),
);

router.post(
  "/trade/orders/cancel",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const wallet = String(b.wallet || "").trim();
    const id = Number(b.id);
    if (!wallet || !Number.isFinite(id)) {
      return res.status(400).json({ error: "wallet and id are required" });
    }
    const result = await cancelOrder(wallet, id);
    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

router.get(
  "/trade/history/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    return res.json({ trades: await getHistory(wallet, 200) });
  }),
);

router.post(
  "/trade/watchlist/add",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const wallet = String(b.wallet || "").trim();
    const mint = String(b.mint || "").trim();
    if (!wallet || !mint) {
      return res.status(400).json({ error: "wallet and mint are required" });
    }
    await dbRun(
      `INSERT INTO watchlist (wallet, token_mint, token_name, token_symbol, token_logo, added_at)
       VALUES ($1, $2, $3, $4, $5, EXTRACT(EPOCH FROM NOW())::bigint)
       ON CONFLICT (wallet, token_mint) DO UPDATE SET
         token_name = EXCLUDED.token_name,
         token_symbol = EXCLUDED.token_symbol,
         token_logo = EXCLUDED.token_logo,
         added_at = EXCLUDED.added_at`,
      [wallet, mint, b.name ?? null, b.symbol ?? null, b.logo ?? null],
    );
    return res.json({ ok: true });
  }),
);

router.post(
  "/trade/watchlist/remove",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const wallet = String(b.wallet || "").trim();
    const mint = String(b.mint || "").trim();
    if (!wallet || !mint) {
      return res.status(400).json({ error: "wallet and mint are required" });
    }
    await dbRun(
      "DELETE FROM watchlist WHERE wallet = $1 AND token_mint = $2",
      [wallet, mint],
    );
    return res.json({ ok: true });
  }),
);

router.get(
  "/trade/watchlist/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const rows = await dbAll<{
      token_mint: string;
      token_name: string | null;
      token_symbol: string | null;
      token_logo: string | null;
    }>(
      "SELECT * FROM watchlist WHERE wallet = $1 ORDER BY added_at DESC LIMIT 50",
      [wallet],
    );

    const items = await Promise.all(
      rows.map(async (r) => {
        const info = await getTokenInfo(r.token_mint).catch(() => null);
        return {
          mint: r.token_mint,
          name: info?.name ?? r.token_name,
          symbol: info?.symbol ?? r.token_symbol,
          logo: info?.logo ?? r.token_logo,
          priceUsd: info?.priceUsd ?? null,
          priceSol: info?.priceSol ?? null,
          priceChange24h: info?.priceChange24h ?? null,
          marketCapUsd: info?.marketCapUsd ?? null,
        };
      }),
    );
    return res.json({ watchlist: items });
  }),
);

export default router;
