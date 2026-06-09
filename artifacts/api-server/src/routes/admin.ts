import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  requireAdmin,
  sessionFromRequest,
  isAdmin,
} from "../lib/auth.js";
import { dbAll, dbGet, pool } from "../lib/database.js";
import { getMarketStatus, forceRefreshTrending } from "../lib/prices.js";
import { pumpportal } from "../lib/pumpportal.js";
import { getFeatureFlags, setFeatureFlag } from "../lib/featureFlags.js";
import { adminReset, type ResetOptions } from "../lib/adminActions.js";

const router: IRouter = Router();

/**
 * Admin self-check. NOT gated (returns admin:false for everyone else) so the
 * frontend can decide whether to render the dashboard / nav link.
 */
router.get(
  "/admin/me",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    const admin = isAdmin(session);
    return res.json({
      admin,
      x_username: admin ? session?.x_username ?? null : null,
    });
  }),
);

// Everything below requires an approved admin X session.
router.use("/admin", requireAdmin);

router.get(
  "/admin/stats",
  asyncHandler(async (_req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;
    const row = await dbGet<Record<string, number>>(
      `SELECT
         (SELECT count(*)::int FROM accounts) AS accounts,
         (SELECT count(*)::int FROM accounts WHERE last_active > $1) AS dau,
         (SELECT count(*)::int FROM users) AS users,
         (SELECT count(*)::int FROM user_identities WHERE provider='wallet') AS wallet_links,
         (SELECT count(*)::int FROM user_identities WHERE provider='x') AS x_links,
         (SELECT count(*)::int FROM trades) AS trades,
         (SELECT count(*)::int FROM trades WHERE side='buy') AS buys,
         (SELECT count(*)::int FROM trades WHERE side='sell') AS sells,
         (SELECT COALESCE(SUM(sol_amount),0) FROM trades) AS volume_sol,
         (SELECT count(*)::int FROM positions) AS positions,
         (SELECT count(DISTINCT wallet)::int FROM positions) AS traders_with_positions,
         (SELECT count(*)::int FROM paper_orders WHERE status IN ('pending','filling')) AS active_orders,
         (SELECT count(DISTINCT wallet)::int FROM trades WHERE side='sell') AS leaderboard_users`,
      [dayAgo],
    );
    return res.json({ stats: row ?? {}, generatedAt: now });
  }),
);

/** Active orders with optional token / user filters, for the order manager. */
router.get(
  "/admin/orders",
  asyncHandler(async (req, res) => {
    const token = String(req.query.token ?? "").trim();
    const user = String(req.query.user ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1),
      500,
    );

    const where: string[] = [];
    const params: unknown[] = [];
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    } else {
      where.push(`status IN ('pending', 'filling')`);
    }
    if (token) {
      params.push(`%${token}%`);
      const i = params.length;
      where.push(
        `(token_mint ILIKE $${i} OR token_symbol ILIKE $${i} OR token_name ILIKE $${i})`,
      );
    }
    if (user) {
      params.push(`%${user}%`);
      where.push(`wallet ILIKE $${params.length}`);
    }
    params.push(limit);
    const orders = await dbAll(
      `SELECT * FROM paper_orders
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return res.json({ orders });
  }),
);

/** Cancel any pending/filling order (admin override — not wallet-scoped). */
router.post(
  "/admin/orders/cancel",
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "valid order id is required" });
    }
    const row = await dbGet<{ id: number }>(
      `UPDATE paper_orders
         SET status = 'canceled', updated_at = EXTRACT(EPOCH FROM NOW())::bigint,
             fill_reason = 'admin_canceled'
       WHERE id = $1 AND status IN ('pending', 'filling')
       RETURNING id`,
      [id],
    );
    if (!row) {
      return res
        .status(404)
        .json({ error: "Order not found or not cancellable" });
    }
    return res.json({ ok: true });
  }),
);

router.post(
  "/admin/market/refresh",
  asyncHandler(async (_req, res) => {
    const tokens = await forceRefreshTrending();
    return res.json({ ok: true, tokenCount: tokens.length, status: getMarketStatus() });
  }),
);

router.get(
  "/admin/health",
  asyncHandler(async (_req, res) => {
    let dbOk = false;
    let dbLatencyMs: number | null = null;
    try {
      const t = Date.now();
      await pool.query("SELECT 1");
      dbLatencyMs = Date.now() - t;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const mem = process.memoryUsage();
    return res.json({
      api: { ok: true, uptimeSeconds: Math.floor(process.uptime()), node: process.version },
      db: { ok: dbOk, latencyMs: dbLatencyMs },
      market: { ...getMarketStatus(), pumpportalConnected: pumpportal.isConnected() },
      memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576) },
    });
  }),
);

router.get(
  "/admin/feature-flags",
  asyncHandler(async (_req, res) => {
    return res.json({ flags: await getFeatureFlags() });
  }),
);

router.post(
  "/admin/feature-flags",
  asyncHandler(async (req, res) => {
    const key = String(req.body?.key ?? "").trim();
    const enabled = Boolean(req.body?.enabled);
    const result = await setFeatureFlag(key, enabled);
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  }),
);

function parseOptions(body: unknown): ResetOptions {
  const o = (body ?? {}) as Record<string, unknown>;
  return {
    resetBalance: o.resetBalance !== false,
    clearPositions: o.clearPositions !== false,
    clearOrders: o.clearOrders !== false,
    clearTrades: o.clearTrades === true,
    resetLeaderboard: o.resetLeaderboard === true,
    clearWatchlist: o.clearWatchlist === true,
  };
}

router.post(
  "/admin/reset-user",
  asyncHandler(async (req, res) => {
    const wallet = String(req.body?.wallet ?? "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const result = await adminReset("user", wallet, parseOptions(req.body?.options));
    return res.json(result);
  }),
);

router.post(
  "/admin/reset-all",
  asyncHandler(async (req, res) => {
    const result = await adminReset("all", null, parseOptions(req.body?.options));
    return res.json(result);
  }),
);

export default router;
