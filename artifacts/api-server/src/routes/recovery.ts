import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAdmin, sessionFromRequest } from "../lib/auth.js";
import { dbAll, dbGet, dbRun } from "../lib/database.js";

const router: IRouter = Router();

/** Coerce to a finite, non-negative number clamped to a sane ceiling. */
function clampNum(v: unknown, max = 1e9): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

function clampInt(v: unknown, max = 1_000_000): number {
  return Math.round(clampNum(v, max));
}

/**
 * Public usage tracking for the SOL Recovery tool. Recovery works for guests
 * (unlinked wallets) too, so this endpoint is intentionally NOT admin-gated.
 * We only persist public, non-sensitive analytics: a public wallet address,
 * counts, SOL amounts, and the linked X identity resolved from the session
 * server-side (never trusted from the client). No private keys / signing data.
 *
 * Tracking is best-effort: the client fires these after the recovery logic has
 * already run, so a failure here can never affect the on-chain flow.
 */
router.post(
  "/recovery/events",
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const eventType = String(body.eventType ?? "").trim();
    if (eventType !== "scan" && eventType !== "cleanup") {
      return res.status(400).json({ error: "invalid eventType" });
    }

    // Solana addresses are base58 and 32–44 chars; reject anything else so
    // bogus strings cannot pollute the analytics.
    const wallet = String(body.wallet ?? "").trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      return res.status(400).json({ error: "valid wallet is required" });
    }

    // Normalise status: scans are always 'completed'; cleanups are
    // 'success' | 'failed' (anything else is treated as a failure).
    let status: string;
    if (eventType === "scan") {
      status = "completed";
    } else {
      const s = String(body.status ?? "").trim();
      status = s === "success" ? "success" : "failed";
    }

    // Identity comes from the verified session cookie, not the request body.
    const session = await sessionFromRequest(req);
    const xUserId = session?.x_id ?? null;
    const xUsername = session?.x_username ?? null;

    const errorMessage = body.error
      ? String(body.error).slice(0, 500)
      : null;

    await dbRun(
      `INSERT INTO recovery_events
         (event_type, wallet, x_user_id, x_username, accounts_found,
          accounts_closed, recoverable_sol, recovered_sol, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        eventType,
        wallet,
        xUserId,
        xUsername,
        clampInt(body.accountsFound),
        clampInt(body.accountsClosed),
        clampNum(body.recoverableSol),
        clampNum(body.recoveredSol),
        status,
        errorMessage,
      ],
    );

    return res.json({ ok: true });
  }),
);

/** Aggregate recovery stats for an optional time window (since = unix seconds). */
async function windowStats(
  since: number | null,
): Promise<Record<string, number>> {
  const where = since != null ? "WHERE created_at > $1" : "";
  const params = since != null ? [since] : [];
  const row = await dbGet<Record<string, number>>(
    `SELECT
       count(*) FILTER (WHERE event_type = 'scan')::int AS scans,
       count(DISTINCT wallet) FILTER (WHERE event_type = 'scan')::int AS unique_wallets,
       COALESCE(SUM(accounts_closed) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0)::int AS accounts_closed,
       COALESCE(SUM(recovered_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0) AS sol_recovered,
       count(*) FILTER (WHERE event_type = 'cleanup' AND status = 'success')::int AS successful_cleanups
     FROM recovery_events ${where}`,
    params,
  );
  return row ?? {};
}

/**
 * SOL Recovery analytics for the admin dashboard. Admin-gated via requireAdmin
 * (this router is not under the blanket /admin guard in admin.ts, so the
 * middleware is applied per route).
 */
router.get(
  "/admin/recovery-stats",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const day = now - 86_400;
    const week = now - 7 * 86_400;
    const month = now - 30 * 86_400;

    const lifetimeRow = await dbGet<Record<string, number>>(
      `SELECT
         count(*) FILTER (WHERE event_type = 'scan')::int AS scans,
         count(DISTINCT wallet) FILTER (WHERE event_type = 'scan')::int AS unique_wallets,
         COALESCE(SUM(accounts_closed) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0)::int AS accounts_closed,
         COALESCE(SUM(recovered_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0) AS sol_recovered,
         count(*) FILTER (WHERE event_type = 'cleanup' AND status = 'success')::int AS successful_cleanups,
         count(*) FILTER (WHERE event_type = 'cleanup' AND status = 'failed')::int AS failed_cleanups,
         COALESCE(MAX(recovered_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0) AS largest_recovery
       FROM recovery_events`,
    );
    const lifetime = lifetimeRow ?? {};
    const successful = Number(lifetime.successful_cleanups ?? 0);
    const avgRecovered =
      successful > 0 ? Number(lifetime.sol_recovered ?? 0) / successful : 0;

    const [day24, days7, days30] = await Promise.all([
      windowStats(day),
      windowStats(week),
      windowStats(month),
    ]);

    const recent = await dbAll<Record<string, unknown>>(
      `SELECT created_at, wallet, accounts_closed, recovered_sol, status, x_username
       FROM recovery_events
       WHERE event_type = 'cleanup'
       ORDER BY created_at DESC
       LIMIT 25`,
    );

    const topUsers = await dbAll<Record<string, unknown>>(
      `SELECT wallet,
              MAX(x_username) AS x_username,
              COALESCE(SUM(recovered_sol), 0) AS total_recovered,
              COALESCE(SUM(accounts_closed), 0)::int AS total_closed
       FROM recovery_events
       WHERE event_type = 'cleanup' AND status = 'success'
       GROUP BY wallet
       ORDER BY total_recovered DESC
       LIMIT 10`,
    );

    return res.json({
      generatedAt: now,
      lifetime: { ...lifetime, avg_recovered: avgRecovered },
      windows: { day: day24, week: days7, month: days30 },
      recent,
      topUsers,
    });
  }),
);

export default router;
