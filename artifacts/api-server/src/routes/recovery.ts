import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAdmin, sessionFromRequest } from "../lib/auth.js";
import { dbAll, dbGet, dbRun } from "../lib/database.js";
import { getTokenMetadataBatch } from "../lib/helius.js";

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
 * Sanitize a list of confirmed tx signatures from the client into a JSON string
 * (or null). Solana signatures are base58 and ~64–96 chars; anything that does
 * not look like a signature is dropped. Capped so a hostile client cannot bloat
 * the row. This is public, non-sensitive data (a signature is already on-chain).
 */
function sanitizeSignatures(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const sigs = v
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => /^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(s))
    .slice(0, 100);
  return sigs.length > 0 ? JSON.stringify(sigs) : null;
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

    // V2 capture: confirmed signatures + fee/net breakdown (cleanup only). The
    // BlackPebble platform fee is forced to 0 here — fees are inert scaffolding,
    // never trusted or charged from the client.
    const txSignatures =
      eventType === "cleanup" ? sanitizeSignatures(body.txSignatures) : null;
    const networkFeeSol =
      eventType === "cleanup" ? clampNum(body.networkFeeSol) : 0;
    const bpFeeSol = 0;
    const netSol = eventType === "cleanup" ? clampNum(body.netSol) : 0;

    await dbRun(
      `INSERT INTO recovery_events
         (event_type, wallet, x_user_id, x_username, accounts_found,
          accounts_closed, recoverable_sol, recovered_sol, status, error_message,
          tx_signatures, network_fee_sol, bp_fee_sol, net_sol)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
        txSignatures,
        networkFeeSol,
        bpFeeSol,
        netSol,
      ],
    );

    return res.json({ ok: true });
  }),
);

/**
 * Batch token-metadata lookup for the recovery account list. Public (recovery
 * works for guest wallets too). Accepts a list of mint addresses and returns a
 * mint -> {symbol,name,logo} map, each field nullable. This is purely a display
 * enrichment — it never touches scanning or the close/recovery transaction flow.
 */
router.post(
  "/recovery/token-metadata",
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(body.mints) ? body.mints : [];
    const mints = raw
      .filter((m): m is string => typeof m === "string")
      .map((m) => m.trim())
      // Solana mints are base58, 32–44 chars; drop anything that is not.
      .filter((m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m))
      .slice(0, 100);

    if (mints.length === 0) return res.json({ tokens: {} });

    const tokens = await getTokenMetadataBatch(mints);
    return res.json({ tokens });
  }),
);

/** Parse the stored tx_signatures JSON column back into a string[] (best-effort). */
function parseSignatures(v: unknown): string[] {
  if (typeof v !== "string" || v.length === 0) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr)
      ? arr.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Per-wallet Recovery History + lifetime metrics, derived entirely from the
 * stored recovery_events captured during recovery (Phase A). Public — recovery
 * works for guest wallets and a wallet address is public on-chain data. Returns
 * ONLY real persisted cleanups: nothing is fabricated, sampled, or estimated.
 * Lifetime metrics are aggregated from the same rows so the history is the
 * single source of truth for a wallet's recovery totals.
 */
router.get(
  "/recovery/history/:wallet",
  asyncHandler(async (req, res) => {
    const wallet = String(req.params.wallet ?? "").trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      return res.status(400).json({ error: "valid wallet is required" });
    }

    const rows = await dbAll<Record<string, unknown>>(
      `SELECT created_at, accounts_closed, recovered_sol, network_fee_sol,
              bp_fee_sol, net_sol, status, tx_signatures, error_message
       FROM recovery_events
       WHERE event_type = 'cleanup' AND wallet = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [wallet],
    );

    const events = rows.map((r) => ({
      created_at: Number(r.created_at ?? 0),
      accounts_closed: Number(r.accounts_closed ?? 0),
      recovered_sol: Number(r.recovered_sol ?? 0),
      network_fee_sol: Number(r.network_fee_sol ?? 0),
      // The BlackPebble fee is inert scaffolding — always 0, never charged.
      bp_fee_sol: 0,
      net_sol: Number(r.net_sol ?? 0),
      status: String(r.status ?? ""),
      signatures: parseSignatures(r.tx_signatures),
      error_message: r.error_message ? String(r.error_message) : null,
    }));

    const ltRow = await dbGet<Record<string, number>>(
      `SELECT
         COALESCE(SUM(accounts_closed) FILTER (WHERE status = 'success'), 0)::int AS accounts_closed,
         COALESCE(SUM(recovered_sol) FILTER (WHERE status = 'success'), 0) AS sol_recovered,
         COALESCE(SUM(network_fee_sol) FILTER (WHERE status = 'success'), 0) AS total_network_fees,
         COALESCE(SUM(net_sol) FILTER (WHERE status = 'success'), 0) AS total_net,
         COALESCE(MAX(recovered_sol) FILTER (WHERE status = 'success'), 0) AS largest_recovery,
         count(*) FILTER (WHERE status = 'success')::int AS successful_cleanups,
         count(*) FILTER (WHERE status = 'failed')::int AS failed_cleanups
       FROM recovery_events
       WHERE event_type = 'cleanup' AND wallet = $1`,
      [wallet],
    );
    const lt = ltRow ?? {};
    const successful = Number(lt.successful_cleanups ?? 0);
    const solRecovered = Number(lt.sol_recovered ?? 0);

    const lifetime = {
      sol_recovered: solRecovered,
      accounts_closed: Number(lt.accounts_closed ?? 0),
      largest_recovery: Number(lt.largest_recovery ?? 0),
      avg_recovered: successful > 0 ? solRecovered / successful : 0,
      successful_cleanups: successful,
      failed_cleanups: Number(lt.failed_cleanups ?? 0),
      total_network_fees: Number(lt.total_network_fees ?? 0),
      total_bp_fees: 0,
      total_net: Number(lt.total_net ?? 0),
    };

    return res.json({ wallet, events, lifetime });
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
         count(DISTINCT wallet) FILTER (WHERE event_type = 'cleanup' AND status = 'success')::int AS recovery_users,
         COALESCE(SUM(accounts_closed) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0)::int AS accounts_closed,
         COALESCE(SUM(recovered_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0) AS sol_recovered,
         count(*) FILTER (WHERE event_type = 'cleanup' AND status = 'success')::int AS successful_cleanups,
         count(*) FILTER (WHERE event_type = 'cleanup' AND status = 'failed')::int AS failed_cleanups,
         COALESCE(MAX(recovered_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0) AS largest_recovery,
         COALESCE(SUM(network_fee_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0) AS total_network_fees,
         COALESCE(SUM(bp_fee_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0) AS total_bp_fees,
         COALESCE(SUM(net_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success'), 0) AS total_net
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
      `SELECT created_at, wallet, accounts_closed, recovered_sol, status,
              x_username, net_sol, network_fee_sol
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
