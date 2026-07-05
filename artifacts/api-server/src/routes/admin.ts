import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  requireAdmin,
  sessionFromRequest,
  isAdmin,
} from "../lib/auth.js";
import { dbAll, dbGet, pool } from "../lib/database.js";
import { getMarketStatus, forceRefreshTrending } from "../lib/prices.js";
import { getSparklineDiagnostics } from "../lib/sparklines.js";
import { getPriceHistoryDiagnostics } from "../lib/priceHistory.js";
import { pumpportal } from "../lib/pumpportal.js";
import { getFeatureFlags, setFeatureFlag } from "../lib/featureFlags.js";
import {
  adminReset,
  deleteCalloutAdmin,
  deleteThesisAdmin,
  fullReset,
  resetJournal,
  resetSocial,
  resetTestData,
  type ResetOptions,
} from "../lib/adminActions.js";
import {
  assignOfficialBadge,
  removeOfficialBadge,
  OFFICIAL_BADGE_TYPES,
  type OfficialBadgeType,
  BADGE_DEFINITIONS,
  NON_FEED_BADGE_KEYS,
  evaluateBadges,
  ensureBadgesSchema,
  type BadgeMetrics,
} from "../lib/badges.js";
import {
  bulkTagTest,
  deleteJournalAdmin,
  listAdminCallouts,
  listAdminJournal,
  listAdminTheses,
  setHiddenFlag,
  setTestFlag,
  socialOverview,
  type TestFilter,
} from "../lib/adminSocial.js";
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

/**
 * Sparkline subsystem diagnostics (admin only): cache hit rate, OHLCV fetch
 * counts, pool-resolve / OHLCV failures, missing-history counts and fetch
 * timing (incl. how many fetches exceeded the slow threshold). Lets an admin
 * see at a glance whether token-card sparklines are healthy without exposing
 * any of it publicly.
 */
router.get(
  "/admin/sparkline-diagnostics",
  asyncHandler((_req, res) => {
    return res.json({
      ...getSparklineDiagnostics(),
      snapshotStore: getPriceHistoryDiagnostics(),
    });
  }),
);

/**
 * Achievement integrity audit. Read-only. Confirms the badge catalogue is sound:
 *   • every defined badge has an evaluator (an unlock path) - no orphans;
 *   • every evaluator key maps to a defined badge - no dangling logic;
 *   • each badge's feed eligibility, rarity, hidden flag and live holder count.
 * This is the machine-checkable backbone of the Task #55 integrity report.
 */
router.get(
  "/admin/achievements/audit",
  asyncHandler(async (_req, res) => {
    await ensureBadgesSchema();

    // evaluateBadges is pure and returns the same key set regardless of inputs,
    // so a zeroed metrics object enumerates every reachable unlock path.
    const zeroMetrics: BadgeMetrics = {
      userId: 0,
      closedTrades: 0,
      realizedPnlSol: 0,
      roiPercent: 0,
      traderRank: null,
      callsMade: 0,
      bestMultiple: null,
      callerRank: null,
      hitRate: 0,
      gradedCalls: 0,
      thesisCount: 0,
      watchlistCount: 0,
      followers: 0,
      hasBio: false,
      hasAvatar: false,
      recoveryAccountsClosed: 0,
      recoverySolRecovered: 0,
      recoveryCleanups: 0,
      recoveryTokensBurned: 0,
      realTradesAnalyzed: 0,
      hasVerifiedWalletAnalysis: false,
    };
    const evaluatorKeys = new Set(Object.keys(evaluateBadges(zeroMetrics)));
    const definedKeys = new Set(BADGE_DEFINITIONS.map((d) => d.key));

    const [holderRows, totalUsersRow] = await Promise.all([
      dbAll<{ badge_key: string; holders: number; first_earned: number }>(
        `SELECT badge_key,
                COUNT(DISTINCT user_id)::int AS holders,
                MIN(earned_at)::bigint AS first_earned
           FROM user_achievements GROUP BY badge_key`,
      ).catch(() => []),
      dbGet<{ count: number }>(`SELECT COUNT(*)::int AS count FROM users`).catch(
        () => ({ count: 0 }),
      ),
    ]);
    const holderMap = new Map(
      holderRows.map((r) => [r.badge_key, r]),
    );
    const totalUsers = totalUsersRow?.count ?? 0;

    const badges = BADGE_DEFINITIONS.map((d) => {
      const h = holderMap.get(d.key);
      const holders = h?.holders ?? 0;
      return {
        key: d.key,
        name: d.name,
        category: d.category,
        rarity: d.rarity ?? "common",
        hidden: d.hidden === true,
        feedEligible: !NON_FEED_BADGE_KEYS.includes(d.key),
        hasUnlockPath: evaluatorKeys.has(d.key),
        holders,
        globalEarnedPercent:
          totalUsers > 0 ? Math.round((holders / totalUsers) * 1000) / 10 : null,
        firstEarnedAt: h?.first_earned ?? null,
      };
    });

    // Integrity violations - both should always be empty in a healthy catalogue.
    const definitionsWithoutPath = badges
      .filter((b) => !b.hasUnlockPath)
      .map((b) => b.key);
    const evaluatorsWithoutDefinition = [...evaluatorKeys].filter(
      (k) => !definedKeys.has(k),
    );

    return res.json({
      generatedAt: Math.floor(Date.now() / 1000),
      totalUsers,
      summary: {
        totalBadges: BADGE_DEFINITIONS.length,
        feedEligible: badges.filter((b) => b.feedEligible).length,
        nonFeed: NON_FEED_BADGE_KEYS.length,
        hidden: badges.filter((b) => b.hidden).length,
        everEarned: badges.filter((b) => b.holders > 0).length,
        neverEarned: badges.filter((b) => b.holders === 0).length,
      },
      integrity: {
        ok:
          definitionsWithoutPath.length === 0 &&
          evaluatorsWithoutDefinition.length === 0,
        definitionsWithoutPath,
        evaluatorsWithoutDefinition,
      },
      badges,
    });
  }),
);

/** Map a window key to a unix-second cutoff, or null for "all time". */
function windowSince(window: string, now: number): number | null {
  switch (window) {
    case "7d":
      return now - 7 * 86_400;
    case "30d":
      return now - 30 * 86_400;
    case "all":
      return null;
    case "24h":
    default:
      return now - 86_400;
  }
}

router.get(
  "/admin/stats",
  asyncHandler(async (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const requested = String(req.query.window ?? "24h");
    const window = ["24h", "7d", "30d", "all"].includes(requested)
      ? requested
      : "24h";
    const since = windowSince(window, now);
    // Funnel/activity beacons live in analytics_events (created lazily); make
    // sure it exists so a fresh deploy returns zeros rather than erroring.
    await ensureAnalyticsTable();

    // A single `since` param ($1, null for "all time"). Each windowed predicate
    // is `($1::bigint IS NULL OR col > $1)` so the same query serves every
    // window without string-building.
    const p = [since];

    const [
      userRow,
      tradingRow,
      feedRow,
      tokens,
      tokensByVolume,
      tokensByBuys,
      tokensBySells,
      funnelRow,
      totalsRow,
    ] = await Promise.all([
      dbGet<Record<string, number>>(
        `SELECT
           (SELECT count(*)::int FROM users WHERE ($1::bigint IS NULL OR created_at > $1)) AS new_users,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_created' AND ($1::bigint IS NULL OR created_at > $1)) AS guest_users,
           (SELECT count(*)::int FROM user_identities WHERE provider='x' AND ($1::bigint IS NULL OR created_at > $1)) AS x_users,
           (SELECT count(*)::int FROM accounts WHERE ($1::bigint IS NULL OR last_active > $1)) AS active_users,
           (SELECT count(*)::int FROM accounts WHERE ($1::bigint IS NULL OR last_active > $1) AND ($1::bigint IS NULL OR created_at <= $1)) AS returning_users`,
        p,
      ),
      dbGet<Record<string, number>>(
        `SELECT
           (SELECT count(*)::int FROM trades WHERE ($1::bigint IS NULL OR executed_at > $1)) AS spot_trades,
           (SELECT count(*)::int FROM paper_leverage_trades WHERE action='open' AND ($1::bigint IS NULL OR executed_at > $1)) AS leverage_trades,
           (SELECT COALESCE(SUM(sol_amount),0)::float8 FROM trades WHERE ($1::bigint IS NULL OR executed_at > $1)) AS volume_sol,
           (SELECT count(*)::int FROM trades WHERE side='buy' AND ($1::bigint IS NULL OR executed_at > $1)) AS buys,
           (SELECT count(*)::int FROM trades WHERE side='sell' AND ($1::bigint IS NULL OR executed_at > $1)) AS sells,
           (SELECT COALESCE(MAX(sol_amount),0)::float8 FROM trades WHERE ($1::bigint IS NULL OR executed_at > $1)) AS largest_trade,
           (SELECT count(*)::int FROM (
              SELECT wallet FROM trades WHERE ($1::bigint IS NULL OR executed_at > $1)
              UNION
              SELECT wallet FROM paper_leverage_trades WHERE action='open' AND ($1::bigint IS NULL OR executed_at > $1)
            ) u) AS unique_traders`,
        p,
      ),
      dbGet<Record<string, number>>(
        `SELECT
           (SELECT count(*)::int FROM analytics_events WHERE event_type='feed_view' AND ($1::bigint IS NULL OR created_at > $1)) AS feed_views,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='profile_view' AND ($1::bigint IS NULL OR created_at > $1)) AS profile_views,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='follow_created' AND ($1::bigint IS NULL OR created_at > $1)) AS follows`,
        p,
      ),
      // Most-traded tokens (spot) for the window, by trade count, with volume.
      dbAll<{
        token_symbol: string | null;
        token_mint: string;
        trades: number;
        volume_sol: number;
      }>(
        `SELECT token_symbol, token_mint,
                count(*)::int AS trades,
                COALESCE(SUM(sol_amount),0)::float8 AS volume_sol
         FROM trades
         WHERE ($1::bigint IS NULL OR executed_at > $1)
         GROUP BY token_symbol, token_mint
         ORDER BY trades DESC
         LIMIT 8`,
        p,
      ),
      // Highest-volume tokens (spot) for the window, by SOL volume.
      dbAll<{
        token_symbol: string | null;
        token_mint: string;
        trades: number;
        volume_sol: number;
      }>(
        `SELECT token_symbol, token_mint,
                count(*)::int AS trades,
                COALESCE(SUM(sol_amount),0)::float8 AS volume_sol
         FROM trades
         WHERE ($1::bigint IS NULL OR executed_at > $1)
         GROUP BY token_symbol, token_mint
         ORDER BY volume_sol DESC
         LIMIT 8`,
        p,
      ),
      // Most-bought tokens (spot buys) for the window, by buy count.
      dbAll<{
        token_symbol: string | null;
        token_mint: string;
        trades: number;
        volume_sol: number;
      }>(
        `SELECT token_symbol, token_mint,
                count(*)::int AS trades,
                COALESCE(SUM(sol_amount),0)::float8 AS volume_sol
         FROM trades
         WHERE side='buy' AND ($1::bigint IS NULL OR executed_at > $1)
         GROUP BY token_symbol, token_mint
         ORDER BY trades DESC
         LIMIT 8`,
        p,
      ),
      // Most-sold tokens (spot sells) for the window, by sell count.
      dbAll<{
        token_symbol: string | null;
        token_mint: string;
        trades: number;
        volume_sol: number;
      }>(
        `SELECT token_symbol, token_mint,
                count(*)::int AS trades,
                COALESCE(SUM(sol_amount),0)::float8 AS volume_sol
         FROM trades
         WHERE side='sell' AND ($1::bigint IS NULL OR executed_at > $1)
         GROUP BY token_symbol, token_mint
         ORDER BY trades DESC
         LIMIT 8`,
        p,
      ),
      // Windowed guest funnel: each stage is a first-touch-per-device beacon,
      // so counts are monotonic and conversion/dropoff are well-defined. Same
      // `$1` cutoff as everything else ("all" → null → lifetime).
      dbGet<Record<string, number>>(
        `SELECT
           (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_created' AND ($1::bigint IS NULL OR created_at > $1)) AS guest_sessions,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='wallet_search' AND ($1::bigint IS NULL OR created_at > $1)) AS wallet_searches,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='token_view' AND ($1::bigint IS NULL OR created_at > $1)) AS token_views,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_first_trade' AND ($1::bigint IS NULL OR created_at > $1)) AS first_trade,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_second_trade' AND ($1::bigint IS NULL OR created_at > $1)) AS second_trade,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='x_connect' AND ($1::bigint IS NULL OR created_at > $1)) AS x_connect,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_converted' AND ($1::bigint IS NULL OR created_at > $1)) AS registration`,
        p,
      ),
      // Lifetime snapshot (not windowed) for structural counts + the guest funnel.
      dbGet<Record<string, number>>(
        `SELECT
           (SELECT count(*)::int FROM accounts) AS accounts,
           (SELECT count(*)::int FROM users) AS users,
           (SELECT count(*)::int FROM user_identities WHERE provider='wallet') AS wallet_links,
           (SELECT count(*)::int FROM user_identities WHERE provider='x') AS x_links,
           (SELECT count(*)::int FROM positions) AS positions,
           (SELECT count(*)::int FROM paper_orders WHERE status IN ('pending','filling')) AS active_orders,
           (SELECT count(DISTINCT wallet)::int FROM trades WHERE side='sell') AS leaderboard_users,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_created') AS guest_created,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_first_trade') AS guest_traded,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='guest_converted') AS guest_converted,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='portfolio_view') AS portfolio_views,
           (SELECT count(*)::int FROM analytics_events WHERE event_type='leaderboard_view') AS leaderboard_views`,
      ),
    ]);

    const spotTrades = tradingRow?.spot_trades ?? 0;
    const leverageTrades = tradingRow?.leverage_trades ?? 0;
    const volumeSol = Number(tradingRow?.volume_sol ?? 0);
    const tradesExecuted = spotTrades + leverageTrades;
    const avgTradeSize = spotTrades > 0 ? volumeSol / spotTrades : 0;

    return res.json({
      window,
      generatedAt: now,
      users: {
        new_users: userRow?.new_users ?? 0,
        guest_users: userRow?.guest_users ?? 0,
        x_users: userRow?.x_users ?? 0,
        returning_users: userRow?.returning_users ?? 0,
        active_users: userRow?.active_users ?? 0,
      },
      trading: {
        trades: tradesExecuted,
        spot_trades: spotTrades,
        leverage_trades: leverageTrades,
        volume_sol: volumeSol,
        avg_trade_size: avgTradeSize,
        buys: tradingRow?.buys ?? 0,
        sells: tradingRow?.sells ?? 0,
        unique_traders: tradingRow?.unique_traders ?? 0,
        largest_trade: Number(tradingRow?.largest_trade ?? 0),
      },
      tokens,
      tokens_by_volume: tokensByVolume,
      tokens_by_buys: tokensByBuys,
      tokens_by_sells: tokensBySells,
      feed: {
        feed_views: feedRow?.feed_views ?? 0,
        profile_views: feedRow?.profile_views ?? 0,
        follows: feedRow?.follows ?? 0,
      },
      funnel: {
        guest_sessions: funnelRow?.guest_sessions ?? 0,
        wallet_searches: funnelRow?.wallet_searches ?? 0,
        token_views: funnelRow?.token_views ?? 0,
        first_trade: funnelRow?.first_trade ?? 0,
        second_trade: funnelRow?.second_trade ?? 0,
        x_connect: funnelRow?.x_connect ?? 0,
        registration: funnelRow?.registration ?? 0,
      },
      totals: totalsRow ?? {},
    });
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

/** Cancel any pending/filling order (admin override - not wallet-scoped). */
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

// ── Social Control Center ──────────────────────────────────────────────────

function listOpts(req: { query: Record<string, unknown> }): {
  filter: TestFilter;
  token?: string;
  user?: string;
  limit?: number;
} {
  const f = String(req.query.filter ?? "all");
  const filter: TestFilter = (
    ["all", "test", "real", "hidden"].includes(f) ? f : "all"
  ) as TestFilter;
  const token = String(req.query.token ?? "").trim() || undefined;
  const user = String(req.query.user ?? "").trim() || undefined;
  const limit = parseInt(String(req.query.limit ?? ""), 10);
  return {
    filter,
    token,
    user,
    limit: Number.isFinite(limit) ? limit : undefined,
  };
}

router.get(
  "/admin/social/overview",
  asyncHandler(async (_req, res) => {
    return res.json({ overview: await socialOverview() });
  }),
);

router.get(
  "/admin/social/callouts",
  asyncHandler(async (req, res) => {
    return res.json({ callouts: await listAdminCallouts(listOpts(req)) });
  }),
);

router.get(
  "/admin/social/theses",
  asyncHandler(async (req, res) => {
    return res.json({ theses: await listAdminTheses(listOpts(req)) });
  }),
);

router.get(
  "/admin/social/journal",
  asyncHandler(async (req, res) => {
    return res.json({ journal: await listAdminJournal(listOpts(req)) });
  }),
);

/** Parse `{ id, value }` body for a moderation toggle. */
function modBody(body: unknown): { id: number; value: boolean } | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, value: b.value === true };
}

router.post(
  "/admin/social/callouts/test",
  asyncHandler(async (req, res) => {
    const m = modBody(req.body);
    if (!m) return res.status(400).json({ error: "valid id is required" });
    const ok = await setTestFlag("callouts", m.id, m.value);
    if (!ok) return res.status(404).json({ error: "Callout not found" });
    return res.json({ ok: true });
  }),
);

router.post(
  "/admin/social/callouts/hide",
  asyncHandler(async (req, res) => {
    const m = modBody(req.body);
    if (!m) return res.status(400).json({ error: "valid id is required" });
    const ok = await setHiddenFlag("callouts", m.id, m.value);
    if (!ok) return res.status(404).json({ error: "Callout not found" });
    return res.json({ ok: true });
  }),
);

router.post(
  "/admin/social/callouts/delete",
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "valid id is required" });
    }
    return res.json(await deleteCalloutAdmin(id));
  }),
);

router.post(
  "/admin/social/theses/test",
  asyncHandler(async (req, res) => {
    const m = modBody(req.body);
    if (!m) return res.status(400).json({ error: "valid id is required" });
    const ok = await setTestFlag("token_theses", m.id, m.value);
    if (!ok) return res.status(404).json({ error: "Thesis not found" });
    return res.json({ ok: true });
  }),
);

router.post(
  "/admin/social/theses/hide",
  asyncHandler(async (req, res) => {
    const m = modBody(req.body);
    if (!m) return res.status(400).json({ error: "valid id is required" });
    const ok = await setHiddenFlag("token_theses", m.id, m.value);
    if (!ok) return res.status(404).json({ error: "Thesis not found" });
    return res.json({ ok: true });
  }),
);

router.post(
  "/admin/social/theses/delete",
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "valid id is required" });
    }
    return res.json(await deleteThesisAdmin(id));
  }),
);

router.post(
  "/admin/social/journal/test",
  asyncHandler(async (req, res) => {
    const m = modBody(req.body);
    if (!m) return res.status(400).json({ error: "valid id is required" });
    const ok = await setTestFlag("journal_entries", m.id, m.value);
    if (!ok) return res.status(404).json({ error: "Entry not found" });
    return res.json({ ok: true });
  }),
);

router.post(
  "/admin/social/journal/delete",
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "valid id is required" });
    }
    const ok = await deleteJournalAdmin(id);
    if (!ok) return res.status(404).json({ error: "Entry not found" });
    return res.json({ ok: true });
  }),
);

/** Bulk-tag every row of a content type as test (or untag). */
router.post(
  "/admin/social/bulk-tag-test",
  asyncHandler(async (req, res) => {
    const type = String(req.body?.type ?? "");
    const value = req.body?.value === true;
    const table =
      type === "callouts"
        ? "callouts"
        : type === "theses"
          ? "token_theses"
          : type === "journal"
            ? "journal_entries"
            : null;
    if (!table) return res.status(400).json({ error: "invalid type" });
    const tagged = await bulkTagTest(table, value);
    return res.json({ ok: true, tagged });
  }),
);

// ── Reset controls (typed-confirmation gated) ──────────────────────────────

/** Require an exact typed confirmation phrase before a destructive reset. */
function confirmed(body: unknown, phrase: string): boolean {
  const b = (body ?? {}) as Record<string, unknown>;
  return String(b.confirm ?? "").trim() === phrase;
}

router.post(
  "/admin/reset-test-data",
  asyncHandler(async (req, res) => {
    if (!confirmed(req.body, "RESET")) {
      return res.status(400).json({ error: 'Type "RESET" to confirm' });
    }
    return res.json(await resetTestData());
  }),
);

router.post(
  "/admin/reset-social",
  asyncHandler(async (req, res) => {
    if (!confirmed(req.body, "RESET")) {
      return res.status(400).json({ error: 'Type "RESET" to confirm' });
    }
    return res.json(await resetSocial());
  }),
);

router.post(
  "/admin/reset-journal",
  asyncHandler(async (req, res) => {
    if (!confirmed(req.body, "RESET")) {
      return res.status(400).json({ error: 'Type "RESET" to confirm' });
    }
    return res.json(await resetJournal());
  }),
);

router.post(
  "/admin/full-reset",
  asyncHandler(async (req, res) => {
    if (!confirmed(req.body, "FULL RESET")) {
      return res.status(400).json({ error: 'Type "FULL RESET" to confirm' });
    }
    return res.json(await fullReset());
  }),
);

const VALID_OFFICIAL_BADGE_TYPES: OfficialBadgeType[] = OFFICIAL_BADGE_TYPES;
const BADGE_TYPE_ERROR = `badge_type must be one of: ${OFFICIAL_BADGE_TYPES.join(", ")}`;

router.post(
  "/admin/official-badges/assign",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    const { x_handle, badge_type } = req.body ?? {};
    if (!x_handle || typeof x_handle !== "string") {
      return res.status(400).json({ error: "x_handle is required" });
    }
    if (!VALID_OFFICIAL_BADGE_TYPES.includes(badge_type as OfficialBadgeType)) {
      return res.status(400).json({ error: BADGE_TYPE_ERROR });
    }
    const handle = x_handle.trim().replace(/^@+/, "").toLowerCase();
    const user = await dbGet<{ user_id: number; x_username: string }>(
      `SELECT ui.user_id, ui.x_username
         FROM user_identities ui
        WHERE ui.provider = 'x' AND LOWER(ui.x_username) = $1
        LIMIT 1`,
      [handle],
    );
    if (!user) {
      return res.status(404).json({ error: "No BlackPebble user found with that X handle." });
    }
    await assignOfficialBadge(
      user.user_id,
      badge_type as OfficialBadgeType,
      session?.x_username ?? null,
    );
    return res.json({ ok: true, user_id: user.user_id, x_username: user.x_username });
  }),
);

router.post(
  "/admin/official-badges/remove",
  asyncHandler(async (req, res) => {
    const { x_handle, badge_type } = req.body ?? {};
    if (!x_handle || typeof x_handle !== "string") {
      return res.status(400).json({ error: "x_handle is required" });
    }
    if (!VALID_OFFICIAL_BADGE_TYPES.includes(badge_type as OfficialBadgeType)) {
      return res.status(400).json({ error: BADGE_TYPE_ERROR });
    }
    const handle = x_handle.trim().replace(/^@+/, "").toLowerCase();
    const user = await dbGet<{ user_id: number; x_username: string }>(
      `SELECT ui.user_id, ui.x_username
         FROM user_identities ui
        WHERE ui.provider = 'x' AND LOWER(ui.x_username) = $1
        LIMIT 1`,
      [handle],
    );
    if (!user) {
      return res.status(404).json({ error: "No BlackPebble user found with that X handle." });
    }
    await removeOfficialBadge(user.user_id, badge_type as OfficialBadgeType);
    return res.json({ ok: true });
  }),
);

export default router;
