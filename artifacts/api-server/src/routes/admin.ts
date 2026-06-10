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
import { ensureAnalyticsTable } from "./analytics.js";

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
  "/admin/leverage-stats",
  asyncHandler(async (_req, res) => {
    const agg = await dbGet<Record<string, number>>(
      `SELECT
         (SELECT count(*)::int FROM paper_leverage_positions) AS "totalPositions",
         (SELECT count(*)::int FROM paper_leverage_positions WHERE status IN ('open','closing')) AS "openPositions",
         (SELECT count(*)::int FROM paper_leverage_positions WHERE status = 'liquidated') AS "liquidations",
         (SELECT COALESCE(SUM(notional_sol),0) FROM paper_leverage_trades WHERE action = 'open') AS "totalVolumeSol",
         (SELECT COALESCE(SUM(margin_sol),0) FROM paper_leverage_trades WHERE action = 'open') AS "totalMarginSol",
         (SELECT COALESCE(SUM(pnl_sol),0) FROM paper_leverage_trades WHERE action IN ('close','liquidated')) AS "realizedPnlSol",
         (SELECT count(DISTINCT wallet)::int FROM paper_leverage_positions) AS "uniqueTraders"`,
    );
    const topUsers = await dbAll<Record<string, unknown>>(
      `SELECT t.wallet,
              x.x_username,
              count(*) FILTER (WHERE t.action = 'open')::int AS positions,
              COALESCE(SUM(t.notional_sol) FILTER (WHERE t.action = 'open'),0) AS volume_sol,
              COALESCE(SUM(t.pnl_sol) FILTER (WHERE t.action IN ('close','liquidated')),0) AS realized_pnl_sol
       FROM paper_leverage_trades t
       LEFT JOIN user_identities w
         ON w.provider = 'wallet' AND w.provider_user_id = t.wallet
       LEFT JOIN user_identities x
         ON x.user_id = w.user_id AND x.provider = 'x'
       GROUP BY t.wallet, x.x_username
       ORDER BY volume_sol DESC
       LIMIT 10`,
    );
    return res.json({
      totalPositions: agg?.totalPositions ?? 0,
      openPositions: agg?.openPositions ?? 0,
      liquidations: agg?.liquidations ?? 0,
      totalVolumeSol: agg?.totalVolumeSol ?? 0,
      totalMarginSol: agg?.totalMarginSol ?? 0,
      realizedPnlSol: agg?.realizedPnlSol ?? 0,
      uniqueTraders: agg?.uniqueTraders ?? 0,
      topUsers,
    });
  }),
);

router.get(
  "/admin/stats",
  asyncHandler(async (_req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;
    // Funnel/activity beacons live in analytics_events (created lazily); make
    // sure it exists so a fresh deploy returns zeros rather than erroring.
    await ensureAnalyticsTable();
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
         (SELECT count(DISTINCT wallet)::int FROM trades WHERE side='sell') AS leaderboard_users,
         (SELECT count(*)::int FROM trades) AS spot_trades,
         (SELECT count(*)::int FROM paper_leverage_trades WHERE action='open') AS leverage_trades,
         (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_created') AS guest_created,
         (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_first_trade') AS guest_traded,
         (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_converted') AS guest_converted,
         (SELECT count(*)::int FROM analytics_events WHERE event_type='portfolio_view') AS portfolio_views,
         (SELECT count(*)::int FROM analytics_events WHERE event_type='leaderboard_view') AS leaderboard_views`,
      [dayAgo],
    );
    // Most-traded tokens (spot), by trade count.
    const topTokens = await dbAll<{
      token_symbol: string | null;
      token_mint: string;
      trades: number;
    }>(
      `SELECT token_symbol, token_mint, count(*)::int AS trades
       FROM trades
       GROUP BY token_symbol, token_mint
       ORDER BY trades DESC
       LIMIT 8`,
    );
    return res.json({ stats: row ?? {}, topTokens, generatedAt: now });
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
    clearLeverage: o.clearLeverage === true,
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
