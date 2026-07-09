import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { resolveCoinMarketCapForMint } from "../lib/coinmarketcap.js";

const router: IRouter = Router();

// Base58 mint (Solana pubkey) - reject anything else so we only ever look up a
// plausible contract address.
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Resolve a token's CoinMarketCap currency page from its mint (contract
 * address). Returns `{ url }` when CoinMarketCap lists the token, else
 * `{ url: null }`. Read-only; safe to call from the public trading UI.
 */
router.get(
  "/coinmarketcap/resolve",
  asyncHandler(async (req, res) => {
    const mint = String(req.query["mint"] ?? "");
    if (!MINT_RE.test(mint)) return res.json({ url: null });
    return res.json(await resolveCoinMarketCapForMint(mint));
  }),
);

export default router;
