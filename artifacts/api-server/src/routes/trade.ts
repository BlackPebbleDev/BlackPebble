import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import db from "../lib/database.js";
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
} from "../lib/trading.js";

const router: IRouter = Router();

router.get(
  "/trade/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const wallet = req.query.wallet ? String(req.query.wallet) : null;
    if (!q) return res.json({ results: [] });
    const results = await searchTokens(q);
    db.prepare(
      "INSERT INTO search_activity (wallet, query, results_count) VALUES (?, ?, ?)",
    ).run(wallet, q, results.length);
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
    db.prepare(
      "INSERT INTO token_views (wallet, token_mint) VALUES (?, ?)",
    ).run(wallet, mint);
    return res.json(info);
  }),
);

router.post(
  "/trade/execute",
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
      const result = await executeBuy(wallet, mint, Number(b.solAmount), meta);
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

router.get(
  "/trade/positions/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const positions = await valuePositions(wallet);
    const solUsd = await getSolPriceUsd();
    return res.json({ positions, solUsd });
  }),
);

router.get(
  "/trade/history/:wallet",
  asyncHandler((req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    return res.json({ trades: getHistory(wallet, 200) });
  }),
);

router.post(
  "/trade/watchlist/add",
  asyncHandler((req, res) => {
    const b = req.body ?? {};
    const wallet = String(b.wallet || "").trim();
    const mint = String(b.mint || "").trim();
    if (!wallet || !mint) {
      return res.status(400).json({ error: "wallet and mint are required" });
    }
    db.prepare(
      `INSERT OR REPLACE INTO watchlist (wallet, token_mint, token_name, token_symbol, token_logo, added_at)
       VALUES (?, ?, ?, ?, ?, unixepoch())`,
    ).run(wallet, mint, b.name ?? null, b.symbol ?? null, b.logo ?? null);
    return res.json({ ok: true });
  }),
);

router.post(
  "/trade/watchlist/remove",
  asyncHandler((req, res) => {
    const b = req.body ?? {};
    const wallet = String(b.wallet || "").trim();
    const mint = String(b.mint || "").trim();
    if (!wallet || !mint) {
      return res.status(400).json({ error: "wallet and mint are required" });
    }
    db.prepare(
      "DELETE FROM watchlist WHERE wallet = ? AND token_mint = ?",
    ).run(wallet, mint);
    return res.json({ ok: true });
  }),
);

router.get(
  "/trade/watchlist/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const rows = db
      .prepare(
        "SELECT * FROM watchlist WHERE wallet = ? ORDER BY added_at DESC LIMIT 50",
      )
      .all(wallet) as Array<{
      token_mint: string;
      token_name: string | null;
      token_symbol: string | null;
      token_logo: string | null;
    }>;

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
        };
      }),
    );
    return res.json({ watchlist: items });
  }),
);

export default router;
