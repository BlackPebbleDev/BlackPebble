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
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { dbAll, dbGet, dbRun } from "./database.js";
import { hasHelius, heliusRpcUrl } from "./helius.js";
import { logger } from "./logger.js";
import { summarizeLedger, type LedgerRow } from "./campaign-math.js";

const ESCROW_SEED = process.env["CAMPAIGN_ESCROW_SEED"];

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
}

/**
 * Incrementally scan the escrow address for new inbound SOL transfers and
 * credit each exactly once (contribution row + ledger deposit row). The
 * sender is taken as the transaction fee payer, which is correct for simple
 * wallet transfers and gives us the refund destination.
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

  const sigs = await conn.getSignaturesForAddress(escrowKey, {
    until: cursor?.last_sig ?? undefined,
    limit: 100,
  });
  if (sigs.length === 0) return { credited: 0, lamports: 0 };

  let credited = 0;
  let creditedLamports = 0;
  const now = Math.floor(Date.now() / 1000);

  // Oldest first so the cursor only advances past processed signatures.
  for (const sig of [...sigs].reverse()) {
    if (sig.err) continue;
    try {
      const tx = await conn.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (!tx?.meta) continue;

      const keys = tx.transaction.message.accountKeys;
      const escrowIdx = keys.findIndex((k) =>
        k.pubkey.equals(escrowKey),
      );
      if (escrowIdx < 0) continue;

      const delta =
        (tx.meta.postBalances[escrowIdx] ?? 0) -
        (tx.meta.preBalances[escrowIdx] ?? 0);
      // Only inbound transfers count as deposits. Outbound moves are written
      // to the ledger by sendFromEscrow at send time, never inferred here.
      if (delta <= 0) continue;

      const sender = keys[0]?.pubkey.toBase58() ?? "unknown";
      if (sender === escrowAddress) continue;

      await dbRun(
        `INSERT INTO campaign_contributions
           (campaign_id, contributor, lamports, tx_signature, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (campaign_id, tx_signature) DO NOTHING`,
        [campaignId, sender, delta, sig.signature, sig.blockTime ?? now],
      );
      await dbRun(
        `INSERT INTO campaign_ledger
           (campaign_id, kind, lamports, tx_signature, counterparty, created_at)
         VALUES ($1, 'deposit', $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [campaignId, delta, sig.signature, sender, sig.blockTime ?? now],
      );
      credited += 1;
      creditedLamports += delta;
    } catch (e) {
      logger.warn(
        { err: e, campaignId, sig: sig.signature },
        "Deposit parse failed - will retry next sweep",
      );
      // Stop here WITHOUT advancing the cursor past this signature, so the
      // failed transaction is re-examined on the next sweep.
      await dbRun(
        `INSERT INTO campaign_sync_cursors (campaign_id, last_sig, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (campaign_id) DO UPDATE
           SET last_sig = EXCLUDED.last_sig, updated_at = EXCLUDED.updated_at`,
        [campaignId, sig.signature, now],
      );
      return { credited, lamports: creditedLamports };
    }
  }

  // Newest signature becomes the cursor.
  await dbRun(
    `INSERT INTO campaign_sync_cursors (campaign_id, last_sig, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (campaign_id) DO UPDATE
       SET last_sig = EXCLUDED.last_sig, updated_at = EXCLUDED.updated_at`,
    [campaignId, sigs[0].signature, now],
  );

  if (credited > 0) {
    logger.info(
      { campaignId, publicId, credited, creditedLamports },
      "Campaign deposits credited",
    );
  }
  return { credited, lamports: creditedLamports };
}

// ── Outbound transfers ───────────────────────────────────────────────────────

export type OutboundKind = "payout" | "refund" | "fee";

/**
 * Send lamports out of a campaign escrow and record the ledger row in the
 * same call. Refuses to send if it would breach the ledger invariant or if
 * the campaign is frozen. Returns the tx signature.
 */
export async function sendFromEscrow(opts: {
  campaignId: number;
  publicId: string;
  kind: OutboundKind;
  destination: string;
  lamports: number;
  note?: string;
}): Promise<string> {
  const { campaignId, publicId, kind, destination, lamports, note } = opts;
  if (!Number.isInteger(lamports) || lamports <= 0) {
    throw new Error(`Invalid outbound amount: ${lamports}`);
  }

  const campaign = await dbGet<{ state: string; escrow_address: string }>(
    `SELECT state, escrow_address FROM campaigns WHERE id = $1`,
    [campaignId],
  );
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.state === "frozen") {
    throw new Error("Campaign is frozen - funds are locked");
  }

  // Never send more than the ledger says remains.
  const summary = await getLedgerSummary(campaignId);
  if (lamports > summary.remaining) {
    throw new Error(
      `Refusing send: ${lamports} exceeds ledger remaining ${summary.remaining}`,
    );
  }
  const healthy = await verifyInvariant(campaignId, campaign.escrow_address);
  if (!healthy) throw new Error("Escrow invariant violated - campaign frozen");

  const keypair = deriveKeypair(publicId);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(destination),
      lamports,
    }),
  );
  const signature = await sendAndConfirmTransaction(rpc(), tx, [keypair], {
    commitment: "confirmed",
  });

  await dbRun(
    `INSERT INTO campaign_ledger
       (campaign_id, kind, lamports, tx_signature, counterparty, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      campaignId,
      kind,
      lamports,
      signature,
      destination,
      note ?? null,
      Math.floor(Date.now() / 1000),
    ],
  );
  logger.info(
    { campaignId, kind, destination, lamports, signature },
    "Escrow outbound transfer",
  );
  return signature;
}
