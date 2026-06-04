import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getTrendingTokens, getMarketStatus } from "../lib/prices.js";
import { pumpportal } from "../lib/pumpportal.js";

const router: IRouter = Router();

router.get(
  "/markets/trending",
  asyncHandler(async (_req, res) => {
    const tokens = await getTrendingTokens();
    return res.json({ tokens });
  }),
);

router.get(
  "/markets/gainers",
  asyncHandler(async (_req, res) => {
    const tokens = await getTrendingTokens();
    const sorted = [...tokens]
      .filter((t) => t.priceChange24h != null)
      .sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0));
    return res.json({ tokens: sorted });
  }),
);

router.get(
  "/markets/volume",
  asyncHandler(async (_req, res) => {
    const tokens = await getTrendingTokens();
    const sorted = [...tokens]
      .filter((t) => t.volume24hUsd != null)
      .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
    return res.json({ tokens: sorted });
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
