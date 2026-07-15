/**
 * Community Campaigns - escrow service (Phase A: transparent custodial).
 *
 * THE ONLY MODULE THAT HOLDS KEYS OR MOVES FUNDS.
 *
 * - One deterministic keypair per campaign, derived with HMAC-SHA512 from the
 *   CAMPAIGN_ESCROW_SEED env secret and the campaign's public id. No key
 *   material is ever stored; the keypair is re-derived on demand. Rotating the
 *   seed would orphan existing escrows, so the seed must be treated like a
 *   wallet secret and never changed while campaigns hold funds.
 * - Deposits are discovered by incremental signature scanning against the
 *   escrow address (cursor per campaign) and credited exactly once via the
 *   ledger's unique (campaign_id, kind, tx_signature) index.
 * - Every credit/debit is an append-only campaign_ledger row carrying the tx
 *   signature. The invariant `on-chain balance >= ledger remaining` is checked
 *   after every sweep and before every send; a violation freezes the campaign
 *   so no further money moves until an admin investigates.
 *
 * The public interface (deriveEscrowAddress / sweepDeposits / sendFromEscrow /
 * verifyInvariant) is implementation-agnostic so a Phase-B on-chain escrow
 * program can replace this file without touching the engine or routes.
 */

import { createHmac } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { dbAll, dbGet, dbRun, pool, withTx } from "./database.js";
import { hasHelius, heliusRpcUrl } from "./helius.js";
import { logger } from "./logger.js";
import { summarizeLedger, type LedgerRow } from "./campaign-math.js";
import {
  classifyRefundRisk,
  depositFailureAction,
  MAX_SWEEP_PAGES,
  NETWORK_FEE_LAMPORTS,
  type RefundRisk,
} from "./campaign-recon.js";
import { recordCampaignEvent } from "./campaign-audit.js";
import {
  beginIntent,
  getIntentByKey,
  listIncompleteIntents,
  nextIntentAction,
  setIntentState,
  type TransferIntent,
} from "./campaign-transfer-intents.js";

const ESCROW_SEED = process.env["CAMPAIGN_ESCROW_SEED"];

/**
 * Known custodial / exchange hot wallets. A refund to one of these may never
 * reach the human contributor, so contributions from them are flagged. Left
 * intentionally conservative: the reliable automated signal is program-owned
 * detection (below); ops can extend this set with verified labels.
 */
const KNOWN_EXCHANGE_WALLETS = new Set<string>([]);

/** Advisory-lock namespace for per-campaign money serialization. */
const CAMPAIGN_LOCK_NS = 4207;

export function escrowConfigured(): boolean {
  return Boolean(ESCROW_SEED && ESCROW_SEED.length >= 32);
}

let connection: Connection | null = null;

function rpc(): Connection {
  if (!connection) {
    const url = hasHelius()
      ? heliusRpcUrl()
      : process.env["SOLANA_RPC_URL"] || "https://api.mainnet-beta.solana.com";
    connection = new Connection(url, "confirmed");
  }
  return connection;
}

// ── Per-campaign serialization ───────────────────────────────────────────────

/**
 * Run `fn` while holding a Postgres session advisory lock keyed to the
 * campaign. This serializes ALL money operations for a campaign across workers
 * AND API instances (cron sweep vs admin retry vs settle), which is what makes
 * settlement and refunds exactly-once under concurrency. The lock is held on a
 * dedicated client across on-chain sends and released in `finally`.
 *
 * IMPORTANT: never nest this for the same campaign on different clients - it
 * would self-deadlock. Internal helpers assume the caller already holds it.
 */
export async function withCampaignLock<T>(
  campaignId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1, $2)", [
      CAMPAIGN_LOCK_NS,
      campaignId,
    ]);
    return await fn();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [
        CAMPAIGN_LOCK_NS,
        campaignId,
      ]);
    } catch {
      // Unlock failure is non-fatal; the lock releases when the session ends.
    }
    client.release();
  }
}

// ── Key derivation ───────────────────────────────────────────────────────────

function deriveKeypair(publicId: string): Keypair {
  if (!escrowConfigured()) {
    throw new Error("CAMPAIGN_ESCROW_SEED is not configured");
  }
  const seed = createHmac("sha512", ESCROW_SEED!)
    .update(`blackpebble:campaign-escrow:${publicId}`)
    .digest()
    .subarray(0, 32);
  return Keypair.fromSeed(seed);
}

export function deriveEscrowAddress(publicId: string): string {
  return deriveKeypair(publicId).publicKey.toBase58();
}

// ── Balance / ledger ─────────────────────────────────────────────────────────

export async function getEscrowBalance(address: string): Promise<number> {
  return rpc().getBalance(new PublicKey(address), "confirmed");
}

export async function getLedgerSummary(campaignId: number) {
  const rows = await dbAll<LedgerRow>(
    `SELECT kind, lamports FROM campaign_ledger WHERE campaign_id = $1`,
    [campaignId],
  );
  return summarizeLedger(rows);
}

/**
 * Verify `on-chain balance >= ledger remaining`. The balance may legitimately
 * exceed the ledger (deposits not yet swept), but must never be below it —
 * that would mean funds left escrow without a ledger row. Returns true when
 * healthy; freezes the campaign and returns false otherwise.
 */
export async function verifyInvariant(
  campaignId: number,
  escrowAddress: string,
): Promise<boolean> {
  const [summary, balance] = await Promise.all([
    getLedgerSummary(campaignId),
    getEscrowBalance(escrowAddress),
  ]);
  if (balance >= summary.remaining) return true;

  logger.error(
    { campaignId, escrowAddress, balance, remaining: summary.remaining },
    "ESCROW INVARIANT VIOLATION - freezing campaign",
  );
  await dbRun(
    `UPDATE campaigns SET state = 'frozen', frozen_reason = $2 WHERE id = $1`,
    [
      campaignId,
      `Ledger expects ${summary.remaining} lamports but escrow holds ${balance}`,
    ],
  );
  return false;
}

// ── Deposit sweeping ─────────────────────────────────────────────────────────

export interface SweepResult {
  credited: number;
  lamports: number;
  /** Signatures newly flagged as unparseable this sweep. */
  flagged: number;
}

async function saveCursor(campaignId: number, sig: string): Promise<void> {
  await dbRun(
    `INSERT INTO campaign_sync_cursors (campaign_id, last_sig, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (campaign_id) DO UPDATE
       SET last_sig = EXCLUDED.last_sig, updated_at = EXCLUDED.updated_at`,
    [campaignId, sig, Math.floor(Date.now() / 1000)],
  );
}

/**
 * Walk backwards through the full signature history newer than `untilSig`,
 * paging past the 100-signature RPC limit so a burst of deposits can never be
 * skipped. Returns signatures newest-first (as the RPC does).
 */
async function collectNewSignatures(
  conn: Connection,
  escrowKey: PublicKey,
  untilSig: string | undefined,
) {
  const all: Awaited<ReturnType<Connection["getSignaturesForAddress"]>> = [];
  let before: string | undefined;
  for (let page = 0; page < MAX_SWEEP_PAGES; page++) {
    const batch = await conn.getSignaturesForAddress(escrowKey, {
      until: untilSig,
      before,
      limit: 100,
    });
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    before = batch[batch.length - 1]!.signature;
  }
  return all;
}

/** Best-effort refund-safety classification of a first-seen contributor. */
async function classifyContributor(address: string): Promise<RefundRisk> {
  if (KNOWN_EXCHANGE_WALLETS.has(address)) return "exchange";
  try {
    const info = await rpc().getAccountInfo(new PublicKey(address), "confirmed");
    // A missing account (info === null) is a normal, never-funded wallet.
    const isSystemOwned =
      info === null ? true : info.owner.equals(SystemProgram.programId);
    return classifyRefundRisk({ isSystemOwned, isKnownExchange: false });
  } catch {
    return classifyRefundRisk({ isSystemOwned: null, isKnownExchange: false });
  }
}

/**
 * Incrementally scan the escrow address for new inbound SOL transfers and
 * credit each exactly once (contribution row + ledger deposit row). The sender
 * is taken as the transaction fee payer, which is correct for simple wallet
 * transfers and gives us the refund destination.
 *
 * Reliability guarantees:
 *  - Pages past 100 signatures so a burst of deposits is never skipped.
 *  - The cursor only advances past signatures that were credited, determined to
 *    be non-deposits, or permanently flagged - a transient parse/RPC failure
 *    stops the cursor so the signature is retried next sweep.
 *  - A signature that fails to parse repeatedly is recorded in
 *    campaign_deposit_failures and, past the retry ceiling, stepped over (still
 *    unresolved) so it cannot poison newer deposits; reconciliation surfaces it.
 *
 * Assumes the caller holds the campaign lock (see withCampaignLock).
 */
export async function sweepDeposits(
  campaignId: number,
  publicId: string,
  escrowAddress: string,
): Promise<SweepResult> {
  const conn = rpc();
  const escrowKey = new PublicKey(escrowAddress);

  const cursor = await dbGet<{ last_sig: string | null }>(
    `SELECT last_sig FROM campaign_sync_cursors WHERE campaign_id = $1`,
    [campaignId],
  );
  const untilSig = cursor?.last_sig ?? undefined;

  const sigs = await collectNewSignatures(conn, escrowKey, untilSig);
  if (sigs.length === 0) return { credited: 0, lamports: 0, flagged: 0 };

  let credited = 0;
  let creditedLamports = 0;
  let flagged = 0;
  const now = Math.floor(Date.now() / 1000);
  // The newest signature we can safely persist as processed. Starts at the
  // existing cursor (or the oldest sig's predecessor is unknown, so we only
  // advance on confirmed progress).
  let advanceTo: string | undefined = untilSig;

  // Oldest first so the cursor only ever advances past processed signatures.
  for (const sig of [...sigs].reverse()) {
    // A transaction that failed on-chain moved no funds; safe to step past.
    if (sig.err) {
      advanceTo = sig.signature;
      continue;
    }
    try {
      const tx = await conn.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (!tx?.meta) throw new Error("transaction not yet available");

      const keys = tx.transaction.message.accountKeys;
      const escrowIdx = keys.findIndex((k) => k.pubkey.equals(escrowKey));
      if (escrowIdx < 0) {
        advanceTo = sig.signature;
        continue;
      }

      const delta =
        (tx.meta.postBalances[escrowIdx] ?? 0) -
        (tx.meta.preBalances[escrowIdx] ?? 0);
      // Only inbound transfers count as deposits. Outbound moves are written to
      // the ledger by sendFromEscrow at send time, never inferred here.
      if (delta <= 0) {
        advanceTo = sig.signature;
        continue;
      }

      const sender = keys[0]?.pubkey.toBase58() ?? "unknown";
      if (sender === escrowAddress) {
        advanceTo = sig.signature;
        continue;
      }

      const blockTime = sig.blockTime ?? now;
      const inserted = await dbGet<{ id: number }>(
        `INSERT INTO campaign_contributions
           (campaign_id, contributor, lamports, tx_signature, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (campaign_id, tx_signature) DO NOTHING
         RETURNING id`,
        [campaignId, sender, delta, sig.signature, blockTime],
      );
      await dbRun(
        `INSERT INTO campaign_ledger
           (campaign_id, kind, lamports, tx_signature, counterparty, created_at)
         VALUES ($1, 'deposit', $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [campaignId, delta, sig.signature, sender, blockTime],
      );

      // Only classify + audit the first time we credit a given signature.
      if (inserted) {
        const risk = await classifyContributor(sender);
        if (risk !== "ok") {
          await dbRun(
            `UPDATE campaign_contributions SET refund_risk = $2
              WHERE id = $1`,
            [inserted.id, risk],
          );
          await recordCampaignEvent({
            campaignId,
            publicId,
            event: "contribution_flagged",
            wallet: sender,
            txSignature: sig.signature,
            lamports: delta,
            result: "warning",
            detail: `Refund-risk: ${risk}. An automatic refund to this wallet may not reach the contributor.`,
          });
        }
        await recordCampaignEvent({
          campaignId,
          publicId,
          event: "contribution_credited",
          wallet: sender,
          txSignature: sig.signature,
          lamports: delta,
        });
        credited += 1;
        creditedLamports += delta;
      }

      // Any prior failure record for this signature is now resolved.
      await dbRun(
        `UPDATE campaign_deposit_failures SET resolved = TRUE, updated_at = $3
          WHERE campaign_id = $1 AND tx_signature = $2 AND resolved = FALSE`,
        [campaignId, sig.signature, now],
      );
      advanceTo = sig.signature;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const row = await dbGet<{ attempts: number }>(
        `INSERT INTO campaign_deposit_failures
           (campaign_id, tx_signature, attempts, last_error, created_at, updated_at)
         VALUES ($1, $2, 1, $3, $4, $4)
         ON CONFLICT (campaign_id, tx_signature) DO UPDATE
           SET attempts = campaign_deposit_failures.attempts + 1,
               last_error = EXCLUDED.last_error,
               updated_at = EXCLUDED.updated_at
         RETURNING attempts`,
        [campaignId, sig.signature, message.slice(0, 500), now],
      );
      const attempts = row?.attempts ?? 1;

      if (depositFailureAction(attempts) === "retry") {
        // Do NOT advance past this signature: persist progress up to the last
        // good one and retry this signature (and everything newer) next sweep.
        logger.warn(
          { err: e, campaignId, sig: sig.signature, attempts },
          "Deposit parse failed - will retry next sweep",
        );
        if (advanceTo) await saveCursor(campaignId, advanceTo);
        return { credited, lamports: creditedLamports, flagged };
      }

      // Exceeded the retry ceiling: flag it (still unresolved) and step over it
      // so it cannot block newer deposits. Reconciliation will surface it.
      logger.error(
        { err: e, campaignId, sig: sig.signature, attempts },
        "Deposit parse failed repeatedly - flagging and stepping over",
      );
      await recordCampaignEvent({
        campaignId,
        publicId,
        event: "deposit_parse_failed",
        txSignature: sig.signature,
        result: "warning",
        detail: `Unparseable after ${attempts} attempts: ${message.slice(0, 200)}`,
      });
      flagged += 1;
      advanceTo = sig.signature;
    }
  }

  if (advanceTo) await saveCursor(campaignId, advanceTo);

  if (credited > 0) {
    logger.info(
      { campaignId, publicId, credited, creditedLamports, flagged },
      "Campaign deposits credited",
    );
  }
  return { credited, lamports: creditedLamports, flagged };
}

// ── Outbound transfers ───────────────────────────────────────────────────────

export type OutboundKind = "payout" | "refund" | "fee";

/**
 * Persist the ledger rows for a confirmed outbound transfer and mark its intent
 * `recorded`, all in one DB transaction. Idempotent: the unique
 * (campaign_id, kind, tx_signature) index means a retry/reconcile writes nothing
 * the second time. The network fee the escrow paid is recorded as its own row
 * keyed by `${signature}:netfee` so it dedupes and never collides with the main
 * transfer or a platform-fee transfer.
 */
async function recordTransfer(intent: TransferIntent, signature: string) {
  const ts = Math.floor(Date.now() / 1000);
  await withTx(async (client) => {
    await dbRun(
      `INSERT INTO campaign_ledger
         (campaign_id, kind, lamports, tx_signature, counterparty, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (campaign_id, kind, tx_signature) DO NOTHING`,
      [
        intent.campaign_id,
        intent.kind,
        intent.lamports,
        signature,
        intent.destination,
        null,
        ts,
      ],
      client,
    );
    await dbRun(
      `INSERT INTO campaign_ledger
         (campaign_id, kind, lamports, tx_signature, counterparty, note, created_at)
       VALUES ($1, 'fee', $2, $3, $4, $5, $6)
       ON CONFLICT (campaign_id, kind, tx_signature) DO NOTHING`,
      [
        intent.campaign_id,
        NETWORK_FEE_LAMPORTS,
        `${signature}:netfee`,
        intent.destination,
        "Network fee",
        ts,
      ],
      client,
    );
    await setIntentState(
      intent.operation_key,
      "recorded",
      { tx_signature: signature, recorded_at: ts },
      client,
    );
  });
}

/** Confirmed | failed (dropped/expired) | unknown (still pending). */
type SigStatus = "confirmed" | "failed" | "unknown";

async function checkSignature(signature: string): Promise<SigStatus> {
  try {
    const res = await rpc().getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    const v = res.value;
    if (!v) return "unknown";
    if (v.err) return "failed";
    if (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized") {
      return "confirmed";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Send lamports out of a campaign escrow through a durable transfer intent, then
 * record the ledger rows. Idempotent and crash-safe: the SAME operationKey is
 * reused on any retry, and a previously submitted signature is checked on-chain
 * BEFORE a new transaction is ever signed, so a transfer can never be duplicated.
 *
 * Callers MUST hold the campaign advisory lock. Returns the tx signature.
 */
export async function sendFromEscrow(opts: {
  campaignId: number;
  publicId: string;
  kind: OutboundKind;
  destination: string;
  lamports: number;
  operationKey: string;
  contributionId?: number | null;
  correlationId?: string | null;
  note?: string;
}): Promise<string> {
  const { campaignId, publicId, kind, destination, lamports } = opts;
  if (!Number.isInteger(lamports) || lamports <= 0) {
    throw new Error(`Invalid outbound amount: ${lamports}`);
  }

  const intent = await beginIntent({
    operationKey: opts.operationKey,
    campaignId,
    contributionId: opts.contributionId ?? null,
    kind,
    destination,
    lamports,
    correlationId: opts.correlationId ?? null,
  });

  // Reuse / verify an existing intent before considering a fresh send.
  const action = nextIntentAction(intent.state, Boolean(intent.tx_signature));
  if (action === "done" && intent.tx_signature) return intent.tx_signature;
  if (action === "verify" && intent.tx_signature) {
    const status = await checkSignature(intent.tx_signature);
    if (status === "confirmed") {
      await recordTransfer(intent, intent.tx_signature);
      return intent.tx_signature;
    }
    if (status === "unknown") {
      // A previous transaction may still land; do NOT resend while it could be
      // valid. Leave for the reconciliation worker / next retry.
      throw new Error(
        `Transfer ${opts.operationKey} still pending on-chain (${intent.tx_signature})`,
      );
    }
    // status === "failed": the previous tx is dead, fall through and resend.
  }

  const campaign = await dbGet<{ state: string; escrow_address: string }>(
    `SELECT state, escrow_address FROM campaigns WHERE id = $1`,
    [campaignId],
  );
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.state === "frozen") {
    throw new Error("Campaign is frozen - funds are locked");
  }

  const summary = await getLedgerSummary(campaignId);
  if (lamports > summary.remaining) {
    throw new Error(
      `Refusing send: ${lamports} exceeds ledger remaining ${summary.remaining}`,
    );
  }
  const healthy = await verifyInvariant(campaignId, campaign.escrow_address);
  if (!healthy) throw new Error("Escrow invariant violated - campaign frozen");

  const keypair = deriveKeypair(publicId);
  const conn = rpc();
  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(destination),
      lamports,
    }),
  );
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = keypair.publicKey;

  await setIntentState(opts.operationKey, "signing", {});

  // sendTransaction returns the signature immediately (before confirmation) so
  // we can persist it BEFORE the network could confirm the transfer. This is the
  // crux of crash safety: if we die after this, reconciliation finds the intent
  // and the on-chain signature and never double-sends.
  const signature = await conn.sendTransaction(tx, [keypair], {
    preflightCommitment: "confirmed",
  });
  await setIntentState(opts.operationKey, "submitted", {
    tx_signature: signature,
    recent_blockhash: blockhash,
    last_valid_block_height: lastValidBlockHeight,
    submitted_at: Math.floor(Date.now() / 1000),
  });

  await conn.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  await setIntentState(opts.operationKey, "confirmed", {
    confirmed_at: Math.floor(Date.now() / 1000),
  });

  const fresh = await getIntentByKey(opts.operationKey);
  await recordTransfer(fresh ?? intent, signature);

  logger.info(
    { campaignId, kind, destination, lamports, signature, opKey: opts.operationKey },
    "Escrow outbound transfer",
  );
  return signature;
}

/**
 * Reconcile intents that never reached `recorded`. For each, if a signature was
 * persisted, check the chain: confirmed -> record the ledger row; dead -> mark
 * failed so a retry may resend. Never assumes a missing ledger row means no
 * transfer happened. Runs under the campaign lock per intent.
 */
export async function reconcileTransferIntents(): Promise<{
  checked: number;
  recorded: number;
  failed: number;
}> {
  const intents = await listIncompleteIntents();
  let recorded = 0;
  let failed = 0;
  for (const intent of intents) {
    try {
      await withCampaignLock(intent.campaign_id, async () => {
        const cur = await getIntentByKey(intent.operation_key);
        if (!cur || cur.state === "recorded") return;
        if (!cur.tx_signature) return; // never sent; a later send will handle it
        const status = await checkSignature(cur.tx_signature);
        if (status === "confirmed") {
          await recordTransfer(cur, cur.tx_signature);
          recorded += 1;
        } else if (status === "failed") {
          await setIntentState(cur.operation_key, "failed", {
            error_code: "TX_FAILED",
            error_message: "Prior transaction dropped or expired",
          });
          failed += 1;
        }
      });
    } catch (e) {
      logger.warn(
        { err: e, opKey: intent.operation_key },
        "Transfer intent reconciliation error",
      );
    }
  }
  if (recorded > 0 || failed > 0) {
    logger.info(
      { checked: intents.length, recorded, failed },
      "Transfer intent reconciliation pass",
    );
  }
  return { checked: intents.length, recorded, failed };
}

/**
 * Verify an inbound SOL transfer to this campaign's escrow and return the
 * credited details, or a typed reason it cannot be credited. Used by the
 * creator opening-contribution and public-contribution submit flows. The sender
 * is the fee payer and the amount is the escrow's balance delta, both taken from
 * the confirmed on-chain transaction (never trusted from the client).
 */
export type IncomingVerify =
  | { ok: true; sender: string; lamports: number; blockTime: number }
  | { ok: false; reason: "not_found" | "unconfirmed" | "wrong_destination" | "no_credit" };

export async function verifyIncomingTransfer(opts: {
  escrowAddress: string;
  signature: string;
}): Promise<IncomingVerify> {
  const conn = rpc();
  const status = await checkSignature(opts.signature);
  if (status === "unknown") return { ok: false, reason: "unconfirmed" };
  if (status === "failed") return { ok: false, reason: "not_found" };

  const parsed = await conn.getParsedTransaction(opts.signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!parsed || !parsed.meta) return { ok: false, reason: "not_found" };

  const keys = parsed.transaction.message.accountKeys;
  const idx = keys.findIndex((k) => k.pubkey.toBase58() === opts.escrowAddress);
  if (idx < 0) return { ok: false, reason: "wrong_destination" };

  const pre = parsed.meta.preBalances[idx] ?? 0;
  const post = parsed.meta.postBalances[idx] ?? 0;
  const delta = post - pre;
  if (delta <= 0) return { ok: false, reason: "no_credit" };

  const sender = keys[0]?.pubkey.toBase58() ?? "unknown";
  const blockTime = parsed.blockTime ?? Math.floor(Date.now() / 1000);
  return { ok: true, sender, lamports: delta, blockTime };
}

/**
 * Credit a verified inbound transfer exactly once (contribution + ledger rows),
 * classify its refund risk, and emit the credited/flagged audit events. Returns
 * the contribution id when newly credited, or null if the signature was already
 * credited. Assumes the caller holds the campaign lock.
 */
export async function creditContribution(opts: {
  campaignId: number;
  publicId: string;
  sender: string;
  lamports: number;
  signature: string;
  blockTime: number;
}): Promise<number | null> {
  const { campaignId, publicId, sender, lamports, signature, blockTime } = opts;
  const inserted = await dbGet<{ id: number }>(
    `INSERT INTO campaign_contributions
       (campaign_id, contributor, lamports, tx_signature, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (campaign_id, tx_signature) DO NOTHING
     RETURNING id`,
    [campaignId, sender, lamports, signature, blockTime],
  );
  await dbRun(
    `INSERT INTO campaign_ledger
       (campaign_id, kind, lamports, tx_signature, counterparty, created_at)
     VALUES ($1, 'deposit', $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [campaignId, lamports, signature, sender, blockTime],
  );
  if (!inserted) return null;

  const risk = await classifyContributor(sender);
  if (risk !== "ok") {
    await dbRun(
      `UPDATE campaign_contributions SET refund_risk = $2 WHERE id = $1`,
      [inserted.id, risk],
    );
    await recordCampaignEvent({
      campaignId,
      publicId,
      event: "contribution_flagged",
      wallet: sender,
      txSignature: signature,
      lamports,
      result: "warning",
      detail: `Refund-risk: ${risk}. An automatic refund to this wallet may not reach the contributor.`,
    });
  }
  await recordCampaignEvent({
    campaignId,
    publicId,
    event: "contribution_credited",
    wallet: sender,
    txSignature: signature,
    lamports,
  });
  return inserted.id;
}
