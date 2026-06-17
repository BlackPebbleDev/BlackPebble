import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAdmin, sessionFromRequest } from "../lib/auth.js";
import { dbAll, dbGet, dbRun } from "../lib/database.js";
import { getTokenMetadataBatch } from "../lib/helius.js";
import { getTokenIntelBatch } from "../lib/recovery-intel.js";
import {
  ensureRecoverySchema,
  verifyRecoveryEvent,
} from "../lib/recovery-verify.js";
import {
  calculateRecoveryFee,
  getRecoveryFeeStatus,
} from "../lib/recovery-fee.js";
import { logger } from "../lib/logger.js";

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
 * Sanitize a list of confirmed tx signatures from the client into a base58
 * string[]. Anything that does not look like a Solana signature is dropped and
 * the list is capped so a hostile client cannot bloat the row. The signatures
 * are only a *pointer* to on-chain data — they are independently verified server
 * side before any value is credited (see recovery-verify.ts).
 */
function sanitizeSignatures(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => /^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(s))
    .slice(0, 100);
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
    const sigList =
      eventType === "cleanup" ? sanitizeSignatures(body.txSignatures) : [];
    const txSignatures = sigList.length > 0 ? JSON.stringify(sigList) : null;
    const networkFeeSol =
      eventType === "cleanup" ? clampNum(body.networkFeeSol) : 0;
    // BlackPebble platform fee is computed via the central fee helper, which
    // returns 0 while fees are disabled (the current state). Routing it through
    // the helper means the "fee is 0" guarantee lives in ONE place and the
    // recovery payout (netSol below) is provably unchanged.
    const { bpFeeSol } = calculateRecoveryFee(clampNum(body.recoveredSol));
    const netSol = eventType === "cleanup" ? clampNum(body.netSol) : 0;

    // Client-reported counts are stored as UNVERIFIED telemetry only. The
    // canonical accounts_closed / recovered_sol start as the client values but
    // a row is never publicly visible until verification overwrites them with
    // on-chain truth and flips `verified` (see recovery-verify.ts). The mirror
    // client_* columns preserve the original claim for admin/debug review.
    const clientAccountsClosed = clampInt(body.accountsClosed);
    const clientRecoveredSol = clampNum(body.recoveredSol);
    const clientTokensBurned = clampInt(body.tokensBurned);

    await ensureRecoverySchema();

    const inserted = await dbGet<{ id: number }>(
      `INSERT INTO recovery_events
         (event_type, wallet, x_user_id, x_username, accounts_found,
          accounts_closed, recoverable_sol, recovered_sol, status, error_message,
          tx_signatures, network_fee_sol, bp_fee_sol, net_sol,
          client_accounts_closed, client_recovered_sol, client_tokens_burned,
          verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18)
       RETURNING id`,
      [
        eventType,
        wallet,
        xUserId,
        xUsername,
        clampInt(body.accountsFound),
        clientAccountsClosed,
        clampNum(body.recoverableSol),
        clientRecoveredSol,
        status,
        errorMessage,
        txSignatures,
        networkFeeSol,
        bpFeeSol,
        netSol,
        clientAccountsClosed,
        clientRecoveredSol,
        clientTokensBurned,
        eventType === "cleanup" && status === "success" ? "pending" : "n/a",
      ],
    );

    // Only successful cleanups carry on-chain proof worth verifying. Scans and
    // failed cleanups stay verified=false (they never surface as public truth).
    // Verification is identity-independent, so it runs for guests too — the X
    // identity (resolved server-side above) only governs feed attribution.
    let verification: { verified: boolean; status: string } | null = null;
    if (
      inserted?.id != null &&
      eventType === "cleanup" &&
      status === "success"
    ) {
      try {
        const r = await verifyRecoveryEvent(inserted.id, wallet, sigList);
        verification = { verified: r.verified, status: r.status };
      } catch (e) {
        logger.warn({ err: e, eventId: inserted.id }, "recovery verify failed");
        await dbRun(
          `UPDATE recovery_events
              SET verified = false,
                  verification_status = 'failed',
                  verification_error = $2
            WHERE id = $1`,
          [inserted.id, "verification error"],
        );
        verification = { verified: false, status: "failed" };
      }
    }

    return res.json({ ok: true, verification });
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

/**
 * Batch token-intelligence lookup for the wallet-cleanup suite. Public (recovery
 * works for guest wallets). Accepts a list of mints and returns a mint -> intel
 * map carrying live market signals (price, liquidity, market cap, market/sell
 * route) and on-chain authority signals (mint/freeze authority, mutable
 * metadata) plus a conservative, position-independent risk classification. It is
 * strictly read-only and never fabricates a signal it cannot resolve.
 */
router.post(
  "/recovery/token-intel",
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(body.mints) ? body.mints : [];
    const mints = raw
      .filter((m): m is string => typeof m === "string")
      .map((m) => m.trim())
      .filter((m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m))
      .slice(0, 100);

    if (mints.length === 0) return res.json({ intel: {} });

    const intel = await getTokenIntelBatch(mints);
    return res.json({ intel });
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

    await ensureRecoverySchema();

    // History is public truth → only verified on-chain cleanups are returned.
    const rows = await dbAll<Record<string, unknown>>(
      `SELECT created_at, accounts_closed, tokens_burned, recovered_sol,
              network_fee_sol, bp_fee_sol, net_sol, status, tx_signatures,
              error_message, verification_status
       FROM recovery_events
       WHERE event_type = 'cleanup' AND wallet = $1 AND verified = true
       ORDER BY created_at DESC
       LIMIT 200`,
      [wallet],
    );

    const events = rows.map((r) => ({
      created_at: Number(r.created_at ?? 0),
      accounts_closed: Number(r.accounts_closed ?? 0),
      tokens_burned: Number(r.tokens_burned ?? 0),
      recovered_sol: Number(r.recovered_sol ?? 0),
      network_fee_sol: Number(r.network_fee_sol ?? 0),
      // The BlackPebble fee is inert scaffolding — always 0, never charged.
      bp_fee_sol: 0,
      net_sol: Number(r.net_sol ?? 0),
      status: String(r.status ?? ""),
      verification_status: String(r.verification_status ?? "verified"),
      signatures: parseSignatures(r.tx_signatures),
      error_message: r.error_message ? String(r.error_message) : null,
    }));

    // Lifetime totals also reflect verified rows only.
    const ltRow = await dbGet<Record<string, number>>(
      `SELECT
         COALESCE(SUM(accounts_closed) FILTER (WHERE status = 'success' AND verified), 0)::int AS accounts_closed,
         COALESCE(SUM(tokens_burned) FILTER (WHERE status = 'success' AND verified), 0)::int AS tokens_burned,
         COALESCE(SUM(recovered_sol) FILTER (WHERE status = 'success' AND verified), 0) AS sol_recovered,
         COALESCE(SUM(network_fee_sol) FILTER (WHERE status = 'success' AND verified), 0) AS total_network_fees,
         COALESCE(SUM(net_sol) FILTER (WHERE status = 'success' AND verified), 0) AS total_net,
         COALESCE(MAX(recovered_sol) FILTER (WHERE status = 'success' AND verified), 0) AS largest_recovery,
         count(*) FILTER (WHERE status = 'success' AND verified)::int AS successful_cleanups,
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
      tokens_burned: Number(lt.tokens_burned ?? 0),
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
       COALESCE(SUM(accounts_closed) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0)::int AS accounts_closed,
       COALESCE(SUM(tokens_burned) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0)::int AS tokens_burned,
       COALESCE(SUM(recovered_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0) AS sol_recovered,
       count(*) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified)::int AS successful_cleanups
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

    await ensureRecoverySchema();

    // Headline metrics are public truth → verified rows only. A pending count is
    // surfaced separately so admins can see the unverified review backlog.
    const lifetimeRow = await dbGet<Record<string, number>>(
      `SELECT
         count(*) FILTER (WHERE event_type = 'scan')::int AS scans,
         count(DISTINCT wallet) FILTER (WHERE event_type = 'scan')::int AS unique_wallets,
         count(DISTINCT wallet) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified)::int AS recovery_users,
         COALESCE(SUM(accounts_closed) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0)::int AS accounts_closed,
         COALESCE(SUM(tokens_burned) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0)::int AS tokens_burned,
         COALESCE(SUM(recovered_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0) AS sol_recovered,
         count(*) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified)::int AS successful_cleanups,
         count(*) FILTER (WHERE event_type = 'cleanup' AND status = 'failed')::int AS failed_cleanups,
         count(*) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND NOT verified)::int AS unverified_cleanups,
         COALESCE(MAX(recovered_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0) AS largest_recovery,
         COALESCE(SUM(network_fee_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0) AS total_network_fees,
         COALESCE(SUM(bp_fee_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0) AS total_bp_fees,
         COALESCE(SUM(net_sol) FILTER (WHERE event_type = 'cleanup' AND status = 'success' AND verified), 0) AS total_net
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

    // Recent feed is for admin review, so it intentionally shows ALL cleanups
    // (verified + unverified) along with their verification state.
    const recent = await dbAll<Record<string, unknown>>(
      `SELECT created_at, wallet, accounts_closed, recovered_sol, status,
              x_username, net_sol, network_fee_sol, verified,
              verification_status, client_accounts_closed, client_recovered_sol
       FROM recovery_events
       WHERE event_type = 'cleanup'
       ORDER BY created_at DESC
       LIMIT 25`,
    );

    // Public leaderboard → verified rows only.
    const topUsers = await dbAll<Record<string, unknown>>(
      `SELECT wallet,
              MAX(x_username) AS x_username,
              COALESCE(SUM(recovered_sol), 0) AS total_recovered,
              COALESCE(SUM(accounts_closed), 0)::int AS total_closed
       FROM recovery_events
       WHERE event_type = 'cleanup' AND status = 'success' AND verified = true
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
      // Disabled future-fee architecture status (Phase G). Always reports the
      // fee system as off — see recovery-fee.ts.
      feeStatus: getRecoveryFeeStatus(),
    });
  }),
);

/**
 * Admin-only backfill: re-run on-chain verification for not-yet-verified
 * successful cleanups that carry signatures. This NEVER fabricates verification
 * — each row still has to pass the same on-chain proof, so historical rows are
 * only promoted to verified when the chain confirms them. Bounded per call.
 */
router.post(
  "/admin/recovery-verify-pending",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await ensureRecoverySchema();
    const limit = Math.min(Math.max(clampInt((req.body ?? {}).limit) || 25, 1), 100);

    const rows = await dbAll<Record<string, unknown>>(
      `SELECT id, wallet, tx_signatures
         FROM recovery_events
        WHERE event_type = 'cleanup' AND status = 'success'
          AND verified = false
          AND tx_signatures IS NOT NULL
        ORDER BY created_at ASC
        LIMIT ${limit}`,
    );

    let verified = 0;
    let partial = 0;
    let failed = 0;
    for (const r of rows) {
      const id = Number(r.id);
      const wallet = String(r.wallet ?? "");
      const sigs = parseSignatures(r.tx_signatures);
      try {
        const result = await verifyRecoveryEvent(id, wallet, sigs);
        if (result.status === "verified") verified += 1;
        else if (result.status === "verified_partial") partial += 1;
        else failed += 1;
      } catch (e) {
        logger.warn({ err: e, eventId: id }, "recovery backfill verify failed");
        failed += 1;
      }
    }

    return res.json({ processed: rows.length, verified, partial, failed });
  }),
);

export default router;
