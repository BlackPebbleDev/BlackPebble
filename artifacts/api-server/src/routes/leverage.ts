import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireOwnership } from "../lib/auth.js";
import { getSolPriceUsd } from "../lib/prices.js";
import { getFeatureFlags } from "../lib/featureFlags.js";
import {
  openLeverage,
  closeLeverage,
  valueLeveragePositions,
  evaluateLeverage,
  getLeverageHistory,
} from "../lib/leverage.js";

const router: IRouter = Router();

router.post(
  "/leverage/open",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const flags = await getFeatureFlags();
    if (!flags.leverage) {
      return res.status(403).json({ ok: false, error: "Leverage trading is not enabled." });
    }
    const b = req.body ?? {};
    const wallet = String(b.wallet || "").trim();
    const mint = String(b.mint || "").trim();
    if (!wallet || !mint) {
      return res.status(400).json({ ok: false, error: "wallet and mint are required" });
    }
    // USD-sized margin carries the raw marginUsd; convert to SOL here with the
    // server's authoritative SOL price so margin sizing never depends on the
    // client's (possibly stale) per-token rate. SOL-sized margin is unchanged.
    let marginSol = Number(b.marginSol);
    if (b.marginUsd != null) {
      const usd = Number(b.marginUsd);
      const solPrice = await getSolPriceUsd();
      if (!Number.isFinite(usd) || usd <= 0 || !solPrice || solPrice <= 0) {
        return res
          .status(400)
          .json({ ok: false, error: "SOL price unavailable; try again." });
      }
      marginSol = usd / solPrice;
    }
    const result = await openLeverage({
      wallet,
      mint,
      marginSol,
      leverage: Number(b.leverage),
      meta: { name: b.name ?? null, symbol: b.symbol ?? null, logo: b.logo ?? null },
      tpTriggerMc: b.tpTriggerMc != null ? Number(b.tpTriggerMc) : null,
      slTriggerMc: b.slTriggerMc != null ? Number(b.slTriggerMc) : null,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

router.post(
  "/leverage/close",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const wallet = String(b.wallet || "").trim();
    const id = Number(b.id);
    if (!wallet || !Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "wallet and a valid position id are required" });
    }
    const result = await closeLeverage(wallet, id);
    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

router.get(
  "/leverage/positions/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const positions = await valueLeveragePositions(wallet);
    const solUsd = await getSolPriceUsd();
    // Evaluate liquidation / TP / SL against the values we just fetched (no new
    // external calls). Never let an eval error break the positions response.
    let fills: Awaited<ReturnType<typeof evaluateLeverage>> = [];
    try {
      fills = await evaluateLeverage(wallet, positions);
    } catch {
      fills = [];
    }
    // Re-value after any closes so the client sees the post-close set.
    const finalPositions =
      fills.length > 0 ? await valueLeveragePositions(wallet) : positions;
    return res.json({ positions: finalPositions, solUsd, fills });
  }),
);

router.get(
  "/leverage/history/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const trades = await getLeverageHistory(wallet);
    return res.json({ trades });
  }),
);

export default router;
