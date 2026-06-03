import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { pumpportal } from "../lib/pumpportal.js";

const router: IRouter = Router();

router.get(
  "/live/trades/:mint",
  asyncHandler((req, res) => {
    const mint = String(req.params.mint || "").trim();
    if (!mint) return res.status(400).json({ error: "mint is required" });
    pumpportal.subscribeToken(mint);
    return res.json({
      trades: pumpportal.getTrades(mint, 40),
      connected: pumpportal.isConnected(),
    });
  }),
);

router.get(
  "/live/new-tokens",
  asyncHandler((_req, res) => {
    return res.json({
      tokens: pumpportal.getNewTokens(40),
      connected: pumpportal.isConnected(),
    });
  }),
);

router.get(
  "/live/migrations",
  asyncHandler((_req, res) => {
    return res.json({
      migrations: pumpportal.getMigrations(40),
      connected: pumpportal.isConnected(),
    });
  }),
);

export default router;
