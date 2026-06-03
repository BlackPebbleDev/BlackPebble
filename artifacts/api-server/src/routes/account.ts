import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ensureAccount, getAccount, resetAccount } from "../lib/trading.js";

const router: IRouter = Router();

function shape(wallet: string) {
  const a = ensureAccount(wallet);
  const winRate = a.total_trades > 0 ? (a.winning_trades / a.total_trades) * 100 : 0;
  return { ...a, win_rate: winRate };
}

router.post(
  "/account/create",
  asyncHandler((req, res) => {
    const wallet = String(req.body?.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    return res.json(shape(wallet));
  }),
);

router.get(
  "/account/:wallet",
  asyncHandler((req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    return res.json(shape(wallet));
  }),
);

router.post(
  "/account/reset",
  asyncHandler((req, res) => {
    const wallet = String(req.body?.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const result = resetAccount(wallet);
    if (!result.ok) return res.status(400).json(result);
    return res.json({ ...result, account: getAccount(wallet) });
  }),
);

export default router;
