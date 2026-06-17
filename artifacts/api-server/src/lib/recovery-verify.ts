/**
 * Recovery Verification Hardening.
 *
 * Recovery feed events, history totals, admin headline metrics and (future)
 * recovery achievements must only ever reflect REAL, on-chain-proven recovery.
 * The public `POST /recovery/events` beacon is fire-and-forget telemetry and is
 * NOT trusted: the numbers it carries are stored only as unverified telemetry
 * (client_* columns). The canonical accounts_closed / recovered_sol columns are
 * recomputed here from the on-chain transaction(s) before a row is ever marked
 * `verified` and allowed to surface publicly.
 *
 * This module:
 *   • bootstraps the verification columns + the signature-uniqueness table
 *     (ensureRecoverySchema), idempotently, so prod / fresh envs converge;
 *   • fetches each submitted signature from Helius RPC and proves it is a real,
 *     successful SPL-Token CloseAccount transaction belonging to the wallet;
 *   • recomputes accounts_closed (instruction count) and recovered_sol (rent
 *     lamports returned, from tx pre-balances) server-side, discarding the
 *     client's claimed figures for verified rows;
 *   • credits each signature at most once (replay / double-credit protection).
 *
 * It performs NO trading / reputation / ranking work and writes only to
 * recovery_events + recovery_credited_signatures.
 */

import axios from "axios";
import { dbGet, dbRun, withTx } from "./database.js";
import { hasHelius, heliusRpcUrl } from "./helius.js";
import { logger } from "./logger.js";

/** SPL Token + Token-2022 program ids (jsonParsed reports these as programs). */
const SPL_TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

const LAMPORTS_PER_SOL = 1_000_000_000;

/** Verification outcome stored on a recovery_events row. */
export type VerificationStatus =
  | "pending"
  | "verified"
  | "verified_partial"
  | "failed";

export interface VerificationResult {
  verified: boolean;
  status: VerificationStatus;
  accountsClosed: number;
  /** Number of SPL burn instructions signed by the wallet, proven on-chain. */
  tokensBurned: number;
  recoveredSol: number;
  networkFeeSol: number;
  netSol: number;
  error: string | null;
}

let schemaReady: Promise<void> | null = null;

/**
 * Idempotently ensure the verification columns, supporting indexes and the
 * signature-uniqueness table exist. Mirrors the runtime CREATE TABLE IF NOT
 * EXISTS convention used elsewhere in this codebase so prod and fresh dev
 * environments self-heal. Data-preserving: only ADD COLUMN IF NOT EXISTS.
 */
export function ensureRecoverySchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      // V2 capture columns that POST /recovery/events writes. Added here too
      // (idempotently) so a fresh / un-migrated environment self-heals and the
      // insert never fails on a missing column.
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS tx_signatures TEXT`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS network_fee_sol DOUBLE PRECISION DEFAULT 0`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS bp_fee_sol DOUBLE PRECISION DEFAULT 0`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS net_sol DOUBLE PRECISION DEFAULT 0`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS verification_error TEXT`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS client_accounts_closed INTEGER`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS client_recovered_sol DOUBLE PRECISION`,
      );
      // Wallet Cleanup V1: count of SPL tokens burned in a cleanup. The
      // canonical column is only ever written from on-chain-proven burns; the
      // client_* mirror preserves the unverified client claim for debug review.
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS tokens_burned INTEGER DEFAULT 0`,
      );
      await dbRun(
        `ALTER TABLE recovery_events
           ADD COLUMN IF NOT EXISTS client_tokens_burned INTEGER`,
      );
      await dbRun(
        `CREATE INDEX IF NOT EXISTS idx_recovery_events_verified
           ON recovery_events (event_type, status, verified)`,
      );
      await dbRun(
        `CREATE TABLE IF NOT EXISTS recovery_credited_signatures (
           signature TEXT PRIMARY KEY,
           event_id INTEGER NOT NULL,
           wallet TEXT NOT NULL,
           credited_at BIGINT NOT NULL DEFAULT (EXTRACT(epoch FROM now()))::bigint
         )`,
      );
    })().catch((e) => {
      // Reset so a later call can retry rather than caching a failed bootstrap.
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/** A single proven CloseAccount within a transaction. */
interface ClosedAccount {
  account: string;
  /** Rent lamports returned (from pre-balance), or null if not resolvable. */
  lamports: number | null;
}

/** Fetch a transaction from Helius RPC (jsonParsed). Returns null on any miss. */
async function fetchTransaction(signature: string): Promise<any | null> {
  try {
    const res = await axios.post(
      heliusRpcUrl(),
      {
        jsonrpc: "2.0",
        id: "rec-verify",
        method: "getTransaction",
        params: [
          signature,
          {
            encoding: "jsonParsed",
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          },
        ],
      },
      { timeout: 10_000 },
    );
    return res.data?.result ?? null;
  } catch (e) {
    logger.warn({ err: e, signature }, "recovery: getTransaction failed");
    return null;
  }
}

/** Index of an account pubkey within the flat accountKeys list, or -1. */
function accountIndex(accountKeys: any[], pubkey: string): number {
  return accountKeys.findIndex((k) => {
    const key = typeof k === "string" ? k : k?.pubkey;
    return key === pubkey;
  });
}

/**
 * Extract every CloseAccount instruction (top-level + inner CPI) from a parsed
 * transaction and resolve the rent lamports each one returned. A close is only
 * credited to `wallet` when its rent `destination` IS that wallet — i.e. the
 * recovered SOL provably landed in the claimed wallet. Paying the network fee
 * for a tx (being its fee payer) is deliberately NOT sufficient, since rent can
 * be routed to a different account.
 */
function extractClosesForWallet(tx: any, wallet: string): ClosedAccount[] {
  const message = tx?.transaction?.message;
  const meta = tx?.meta;
  if (!message || !meta) return [];

  const accountKeys: any[] = message.accountKeys ?? [];

  const preBalances: number[] = Array.isArray(meta.preBalances)
    ? meta.preBalances
    : [];

  const top: any[] = Array.isArray(message.instructions)
    ? message.instructions
    : [];
  const inner: any[] = Array.isArray(meta.innerInstructions)
    ? meta.innerInstructions.flatMap((g: any) =>
        Array.isArray(g?.instructions) ? g.instructions : [],
      )
    : [];

  const closes: ClosedAccount[] = [];
  for (const ix of [...top, ...inner]) {
    const program = ix?.program;
    const programId = ix?.programId;
    const isSplToken =
      program === "spl-token" ||
      program === "spl-token-2022" ||
      SPL_TOKEN_PROGRAMS.has(programId);
    if (!isSplToken) continue;
    const parsed = ix?.parsed;
    if (!parsed || parsed.type !== "closeAccount") continue;

    const info = parsed.info ?? {};
    const account: string | undefined = info.account;
    const destination: string | undefined = info.destination;
    if (!account) continue;

    // Only credit closes whose rent provably landed in the claimed wallet.
    if (destination !== wallet) continue;

    const idx = accountIndex(accountKeys, account);
    const lamports =
      idx >= 0 && idx < preBalances.length ? Number(preBalances[idx]) : null;
    closes.push({ account, lamports });
  }
  return closes;
}

/**
 * Count every SPL burn instruction (top-level + inner CPI) in a parsed
 * transaction whose burn `authority` IS the claimed wallet. A burn is only
 * credited when the wallet provably signed it as the token authority — burns by
 * any other authority are ignored. Covers both `burn` and `burnChecked`.
 */
function extractBurnsForWallet(tx: any, wallet: string): number {
  const message = tx?.transaction?.message;
  const meta = tx?.meta;
  if (!message || !meta) return 0;

  const top: any[] = Array.isArray(message.instructions)
    ? message.instructions
    : [];
  const inner: any[] = Array.isArray(meta.innerInstructions)
    ? meta.innerInstructions.flatMap((g: any) =>
        Array.isArray(g?.instructions) ? g.instructions : [],
      )
    : [];

  let burns = 0;
  for (const ix of [...top, ...inner]) {
    const program = ix?.program;
    const programId = ix?.programId;
    const isSplToken =
      program === "spl-token" ||
      program === "spl-token-2022" ||
      SPL_TOKEN_PROGRAMS.has(programId);
    if (!isSplToken) continue;
    const parsed = ix?.parsed;
    if (!parsed || (parsed.type !== "burn" && parsed.type !== "burnChecked")) {
      continue;
    }
    const info = parsed.info ?? {};
    // Only credit burns the wallet itself authorized.
    if (info.authority !== wallet) continue;
    burns += 1;
  }
  return burns;
}

/**
 * Verify a recovery cleanup event against the chain and persist the verified,
 * recomputed figures. Idempotent per signature via recovery_credited_signatures.
 *
 * @param eventId    recovery_events.id of the row being verified
 * @param wallet     the claimed recovery wallet (base58)
 * @param signatures confirmed close-tx signatures submitted by the client
 */
export async function verifyRecoveryEvent(
  eventId: number,
  wallet: string,
  signatures: string[],
): Promise<VerificationResult> {
  await ensureRecoverySchema();

  const fail = async (error: string): Promise<VerificationResult> => {
    await dbRun(
      `UPDATE recovery_events
          SET verified = false,
              verification_status = 'failed',
              verification_error = $2,
              verified_at = NULL
        WHERE id = $1`,
      [eventId, error.slice(0, 500)],
    );
    return {
      verified: false,
      status: "failed",
      accountsClosed: 0,
      tokensBurned: 0,
      recoveredSol: 0,
      networkFeeSol: 0,
      netSol: 0,
      error,
    };
  };

  if (!hasHelius()) {
    // Cannot prove anything without an RPC — leave pending for later backfill.
    await dbRun(
      `UPDATE recovery_events
          SET verification_status = 'pending',
              verification_error = $2
        WHERE id = $1`,
      [eventId, "no RPC configured; awaiting verification"],
    );
    return {
      verified: false,
      status: "pending",
      accountsClosed: 0,
      tokensBurned: 0,
      recoveredSol: 0,
      networkFeeSol: 0,
      netSol: 0,
      error: "no RPC configured",
    };
  }

  const sigs = [...new Set(signatures)].filter((s) => s.length > 0);
  if (sigs.length === 0) {
    return fail("no transaction signatures to verify");
  }

  // ── Phase 1: network only (no DB writes) ──────────────────────────────────
  // Fetch + validate every signature on-chain first. We deliberately do NOT
  // touch the database here so a slow RPC never holds a transaction open, and a
  // mid-flight failure leaves no partial state to clean up.
  interface ProvenSig {
    sig: string;
    closes: ClosedAccount[];
    burns: number;
    feeLamports: number;
  }
  const proven: ProvenSig[] = [];
  const problems: string[] = [];

  for (const sig of sigs) {
    const tx = await fetchTransaction(sig);
    if (!tx) {
      problems.push(`${sig.slice(0, 8)}: not found/confirmed`);
      continue;
    }
    if (tx.meta?.err) {
      problems.push(`${sig.slice(0, 8)}: tx failed on-chain`);
      continue;
    }
    const closes = extractClosesForWallet(tx, wallet);
    const burns = extractBurnsForWallet(tx, wallet);
    if (closes.length === 0 && burns === 0) {
      problems.push(`${sig.slice(0, 8)}: no close/burn for wallet`);
      continue;
    }
    const txFee = Number(tx.meta?.fee ?? 0);
    proven.push({
      sig,
      closes,
      burns,
      feeLamports: Number.isFinite(txFee) ? txFee : 0,
    });
  }

  if (proven.length === 0) {
    return fail(
      problems.length > 0
        ? `no creditable signatures (${problems.join("; ")})`
        : "no creditable signatures",
    );
  }

  // ── Phase 2: single transaction (credit signatures + update row atomically) ─
  // Signature claims and the verified row update commit together, so a crash can
  // never consume a signature without recording the verification (which would
  // otherwise permanently block a legitimate retry).
  return withTx(async (client) => {
    let accountsClosed = 0;
    let tokensBurned = 0;
    let recoveredLamports = 0;
    let feeLamports = 0;
    let anyCredited = false;
    let anyUnresolvedRent = false;

    for (const p of proven) {
      // Claim the signature for THIS event. ON CONFLICT keeps it owned by its
      // original event_id; the RETURNING tells us whether we just inserted it.
      const claimed = await dbGet<{ event_id: number }>(
        `INSERT INTO recovery_credited_signatures (signature, event_id, wallet)
         VALUES ($1, $2, $3)
         ON CONFLICT (signature) DO NOTHING
         RETURNING event_id`,
        [p.sig, eventId, wallet],
        client,
      );

      let mine = claimed != null;
      if (!mine) {
        // Already credited. If it belongs to this same event (an earlier
        // partially-applied attempt), it is still ours and idempotently counts;
        // if it belongs to another event, it is a replay and is skipped.
        const owner = await dbGet<{ event_id: number }>(
          `SELECT event_id FROM recovery_credited_signatures WHERE signature = $1`,
          [p.sig],
          client,
        );
        if (owner && Number(owner.event_id) === eventId) {
          mine = true;
        } else {
          problems.push(`${p.sig.slice(0, 8)}: already credited`);
          continue;
        }
      }

      anyCredited = anyCredited || mine;
      accountsClosed += p.closes.length;
      tokensBurned += p.burns;
      for (const c of p.closes) {
        if (c.lamports == null) anyUnresolvedRent = true;
        else recoveredLamports += c.lamports;
      }
      feeLamports += p.feeLamports;
    }

    if (!anyCredited) {
      // Every proven signature was already credited to a different event (a
      // duplicate beacon). Mark this row failed; nothing was newly claimed.
      const dupError = `no creditable signatures (${problems.join("; ")})`;
      await dbRun(
        `UPDATE recovery_events
            SET verified = false,
                verification_status = 'failed',
                verification_error = $2,
                verified_at = NULL
          WHERE id = $1`,
        [eventId, dupError.slice(0, 500)],
        client,
      );
      return {
        verified: false,
        status: "failed" as VerificationStatus,
        accountsClosed: 0,
        tokensBurned: 0,
        recoveredSol: 0,
        networkFeeSol: 0,
        netSol: 0,
        error: dupError,
      };
    }

    const recoveredSol = recoveredLamports / LAMPORTS_PER_SOL;
    const networkFeeSol = feeLamports / LAMPORTS_PER_SOL;
    const netSol = Math.max(0, recoveredSol - networkFeeSol);

    // Partial when some closed accounts' rent could not be resolved on-chain:
    // accounts_closed is proven, but the SOL total is understated, so it must
    // not be presented as an exact public truth.
    const status: VerificationStatus = anyUnresolvedRent
      ? "verified_partial"
      : "verified";
    const error = anyUnresolvedRent
      ? `rent not resolvable for some accounts; SOL total is a verified lower bound${
          problems.length ? ` (${problems.join("; ")})` : ""
        }`
      : problems.length
        ? problems.join("; ")
        : null;

    await dbRun(
      `UPDATE recovery_events
          SET verified = true,
              verification_status = $2,
              verification_error = $3,
              verified_at = now(),
              accounts_closed = $4,
              recovered_sol = $5,
              network_fee_sol = $6,
              net_sol = $7,
              tokens_burned = $8
        WHERE id = $1`,
      [
        eventId,
        status,
        error ? error.slice(0, 500) : null,
        accountsClosed,
        recoveredSol,
        networkFeeSol,
        netSol,
        tokensBurned,
      ],
      client,
    );

    return {
      verified: true,
      status,
      accountsClosed,
      tokensBurned,
      recoveredSol,
      networkFeeSol,
      netSol,
      error,
    };
  });
}
