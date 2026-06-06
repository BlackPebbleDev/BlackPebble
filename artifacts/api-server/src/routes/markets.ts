import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  getTrendingTokens,
  getMarketStatus,
  type MarketToken,
} from "../lib/prices.js";
import { pumpportal } from "../lib/pumpportal.js";

const router: IRouter = Router();

/** Max tokens returned per feed — keeps mobile lists fast and bounded. */
const FEED_LIMIT = 50;

/** Drop any repeated mints so a token never appears twice in one list. */
function dedupe(tokens: MarketToken[]): MarketToken[] {
  const seen = new Set<string>();
  const out: MarketToken[] = [];
  for (const t of tokens) {
    if (!t.mint || seen.has(t.mint)) continue;
    seen.add(t.mint);
    out.push(t);
  }
  return out;
}

// All three list feeds share one cached upstream fetch (getTrendingTokens, 60s
// cache) but each derives a genuinely distinct ranking so the tabs don't mirror
// each other:
//   • trending → most active right now (24h transaction count)
//   • gainers  → biggest positive 24h price movers
//   • volume   → highest 24h USD volume
router.get(
  "/markets/trending",
  asyncHandler(async (_req, res) => {
    const tokens = dedupe(await getTrendingTokens());
    const sorted = [...tokens].sort(
      (a, b) => (b.txns24h ?? 0) - (a.txns24h ?? 0),
    );
    return res.json({ tokens: sorted.slice(0, FEED_LIMIT) });
  }),
);

router.get(
  "/markets/gainers",
  asyncHandler(async (_req, res) => {
    const tokens = dedupe(await getTrendingTokens());
    const sorted = tokens
      .filter((t) => (t.priceChange24h ?? 0) > 0)
      .sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0));
    return res.json({ tokens: sorted.slice(0, FEED_LIMIT) });
  }),
);

router.get(
  "/markets/volume",
  asyncHandler(async (_req, res) => {
    const tokens = dedupe(await getTrendingTokens());
    const sorted = tokens
      .filter((t) => (t.volume24hUsd ?? 0) > 0)
      .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
    return res.json({ tokens: sorted.slice(0, FEED_LIMIT) });
  }),
);

router.get(
  "/markets/new",
  asyncHandler((_req, res) => {
    return res.json({ tokens: pumpportal.getNewTokens(40) });
  }),
);

router.get(
  "/markets/migrated",
  asyncHandler((_req, res) => {
    return res.json({ tokens: pumpportal.getMigrations(40) });
  }),
);

router.get(
  "/markets/status",
  asyncHandler((_req, res) => {
    return res.json(getMarketStatus());
  }),
);

export default router;
