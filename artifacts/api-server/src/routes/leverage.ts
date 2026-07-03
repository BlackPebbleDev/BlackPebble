import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireOwnership } from "../lib/auth.js";
import { getSolPriceUsd } from "../lib/prices.js";
import { getFeatureFlags } from "../lib/featureFlags.js";
import {
  openLeverage,
  closeLeverage,
  valueLeveragePositions,
  getLeverageHistory,
  getClosedLeveragePositions,
  getRecentLeverageFills,
  getLeverageExitOrders,
  createLeverageExitOrder,
  updateLeverageExitOrder,
  cancelLeverageExitOrder,
  type LeverageExitOrderRow,
  type ValuedLeveragePosition,
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
    const direction = b.direction === "short" ? "short" : "long";
    const result = await openLeverage({
      wallet,
      mint,
      marginSol,
      leverage: Number(b.leverage),
      direction,
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
    // Optional partial close: percent of the remaining notional (1..100).
    // Omitted / null defaults to a full (100%) close — behavior unchanged.
    const percent = b.percent != null ? Number(b.percent) : 100;
    const result = await closeLeverage(wallet, id, percent);
    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

// ── Manageable exit orders (take-profit / stop-loss) ────────────────────────
router.post(
  "/leverage/orders",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    // Flag gates NEW risk (like open). Close / cancel stay available so users
    // can always exit existing positions even if perps is turned off.
    const flags = await getFeatureFlags();
    if (!flags.leverage) {
      return res.status(403).json({ ok: false, error: "Perps trading is not enabled." });
    }
    const b = req.body ?? {};
    const result = await createLeverageExitOrder({
      wallet: String(b.wallet || "").trim(),
      positionId: Number(b.positionId),
      kind: b.kind,
      triggerMc: Number(b.triggerMc),
      percent: Number(b.percent),
    });
    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

router.post(
  "/leverage/orders/update",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const result = await updateLeverageExitOrder({
      wallet: String(b.wallet || "").trim(),
      orderId: Number(b.orderId),
      triggerMc: b.triggerMc != null ? Number(b.triggerMc) : undefined,
      percent: b.percent != null ? Number(b.percent) : undefined,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

router.post(
  "/leverage/orders/cancel",
  requireOwnership((req) => String(req.body?.wallet || "").trim()),
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const wallet = String(b.wallet || "").trim();
    const orderId = Number(b.orderId);
    if (!wallet || !Number.isInteger(orderId) || orderId <= 0) {
      return res
        .status(400)
        .json({ ok: false, error: "wallet and a valid order id are required" });
    }
    const result = await cancelLeverageExitOrder(wallet, orderId);
    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

router.get(
  "/leverage/positions/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    // Read-only: liquidation / TP / SL evaluation runs on the background sweep
    // cron, not here — a public GET must never mutate positions. Recent fills
    // (from the sweep or manual closes elsewhere) are attached so the owner's
    // client can announce them; the client dedupes by tradeId.
    const positions = await valueLeveragePositions(wallet);
    const solUsd = await getSolPriceUsd();
    const fills = await getRecentLeverageFills(wallet);
    // Attach each position's active exit orders (no extra external calls).
    const exitOrders = await getLeverageExitOrders(wallet);
    const ordersByPosition = new Map<number, LeverageExitOrderRow[]>();
    for (const o of exitOrders) {
      const list = ordersByPosition.get(o.position_id) ?? [];
      list.push(o);
      ordersByPosition.set(o.position_id, list);
    }
    const withOrders = positions.map(
      (p: ValuedLeveragePosition) => ({
        ...p,
        exitOrders: ordersByPosition.get(p.id) ?? [],
      }),
    );
    return res.json({ positions: withOrders, solUsd, fills });
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

// Closed / liquidated position snapshots (entry → exit, realized P&L, close
// reason, timestamps) — the auditable per-position record behind the history.
router.get(
  "/leverage/closed/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const positions = await getClosedLeveragePositions(wallet);
    return res.json({ positions });
  }),
);

export default router;
