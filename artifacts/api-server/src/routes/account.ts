import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireOwnership } from "../lib/auth.js";
import {
  ensureAccount,
  getAccount,
  resetAccount,
  getClosedTradeStats,
} from "../lib/trading.js";

const router: IRouter = Router();

async function shape(wallet: string) {
  const a = await ensureAccount(wallet);
  // Derive closed-trade stats from the trades table so trade count, win rate
  // and best trade stay accurate and consistent with the Portfolio page.
  const cs = await getClosedTradeStats(wallet);
  return {
    ...a,
    total_trades: cs.closedTrades,
    winning_trades: cs.winningTrades,
    best_trade: cs.bestTrade,
    worst_trade: cs.worstTrade,
    realized_pnl: cs.realizedPnl,
    total_pnl: cs.realizedPnl,
    win_rate: cs.winRate,
  };
}

router.post(
  "/account/create",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const wallet = String(req.body?.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    return res.json(await shape(wallet));
  }),
);

router.get(
  "/account/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    return res.json(await shape(wallet));
  }),
);

router.post(
  "/account/reset",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const wallet = String(req.body?.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const result = await resetAccount(wallet);
    if (!result.ok) return res.status(400).json(result);
    return res.json({ ...result, account: await getAccount(wallet) });
  }),
);

export default router;
