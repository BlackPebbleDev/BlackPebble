import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { resolveTradingViewForMint } from "../lib/tradingview.js";

const router: IRouter = Router();

// Base58 mint (Solana pubkey) - reject anything else so we only ever forward a
// plausible contract address to the upstream search.
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Resolve a token's TradingView symbol page from its mint (contract address).
 * Returns `{ url }` when TradingView lists the token on-chain, else
 * `{ url: null }`. Read-only; safe to call from the public trading UI.
 */
router.get(
  "/tradingview/resolve",
  asyncHandler(async (req, res) => {
    const mint = String(req.query["mint"] ?? "");
    if (!MINT_RE.test(mint)) return res.json({ url: null });
    const symbolRaw = String(req.query["sym"] ?? "").slice(0, 32);
    return res.json(await resolveTradingViewForMint(mint, symbolRaw));
  }),
);

export default router;
