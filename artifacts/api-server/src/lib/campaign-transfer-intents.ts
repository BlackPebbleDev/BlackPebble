/**
 * Community Campaigns - durable outbound transfer intents (Phase 2).
 *
 * Closes the Phase 1 "crash after send, before ledger write" gap as far as is
 * possible without an on-chain program. Every outbound escrow transfer (payout,
 * platform fee, excess refund, failure refund) is first persisted as an intent
 * with a deterministic UNIQUE `operation_key`. On any retry or restart we look
 * the intent up by that key and inspect on-chain state BEFORE ever signing a new
 * transaction, so a transfer is never duplicated.
 *
 * The escrow service owns signing/sending and RPC confirmation; this module
 * owns the durable intent record and its state. Kept free of Solana imports so
 * the decision helpers stay pure and unit-testable.
 */

import { dbAll, dbGet, dbRun, type Queryable } from "./database.js";
import {
  nextIntentAction,
  operationKey,
  type IntentAction,
  type IntentKind,
  type IntentState,
} from "./campaign-transfer-intents.pure.js";

export {
  nextIntentAction,
  operationKey,
  type IntentAction,
  type IntentKind,
  type IntentState,
};

export interface TransferIntent {
  id: number;
  operation_key: string;
  campaign_id: number;
  contribution_id: number | null;
  kind: IntentKind;
  destination: string;
  lamports: number;
  state: IntentState;
  tx_signature: string | null;
  recent_blockhash: string | null;
  last_valid_block_height: number | null;
  attempt_count: number;
  error_code: string | null;
  error_message: string | null;
  correlation_id: string | null;
  created_at: number;
  submitted_at: number | null;
  confirmed_at: number | null;
  recorded_at: number | null;
  updated_at: number;
}

// ── DB accessors ─────────────────────────────────────────────────────────────

/**
 * Create the intent if it does not exist, otherwise return the existing one
 * (retry-safe). Increments attempt_count on re-entry. Assumes the caller holds
 * the campaign advisory lock so concurrent workers cannot race the same key.
 */
export async function beginIntent(
  opts: {
    operationKey: string;
    campaignId: number;
    contributionId?: number | null;
    kind: IntentKind;
    destination: string;
    lamports: number;
    correlationId?: string | null;
  },
  client?: Queryable,
): Promise<TransferIntent> {
  const now = Math.floor(Date.now() / 1000);
  const row = await dbGet<TransferIntent>(
    `INSERT INTO campaign_transfer_intents
       (operation_key, campaign_id, contribution_id, kind, destination,
        lamports, state, attempt_count, correlation_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'planned',1,$7,$8,$8)
     ON CONFLICT (operation_key) DO UPDATE
       SET attempt_count = campaign_transfer_intents.attempt_count + 1,
           updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      opts.operationKey,
      opts.campaignId,
      opts.contributionId ?? null,
      opts.kind,
      opts.destination,
      opts.lamports,
      opts.correlationId ?? null,
      now,
    ],
    client,
  );
  return row!;
}

export async function setIntentState(
  operationKey: string,
  state: IntentState,
  fields: Partial<{
    tx_signature: string | null;
    recent_blockhash: string | null;
    last_valid_block_height: number | null;
    error_code: string | null;
    error_message: string | null;
    submitted_at: number | null;
    confirmed_at: number | null;
    recorded_at: number | null;
  }> = {},
  client?: Queryable,
): Promise<void> {
  const sets: string[] = ["state = $2", "updated_at = $3"];
  const params: unknown[] = [operationKey, state, Math.floor(Date.now() / 1000)];
  for (const [k, v] of Object.entries(fields)) {
    params.push(v);
    sets.push(`${k} = $${params.length}`);
  }
  await dbRun(
    `UPDATE campaign_transfer_intents SET ${sets.join(", ")}
      WHERE operation_key = $1`,
    params,
    client,
  );
}

export async function getIntentByKey(
  operationKey: string,
  client?: Queryable,
): Promise<TransferIntent | undefined> {
  return dbGet<TransferIntent>(
    `SELECT * FROM campaign_transfer_intents WHERE operation_key = $1`,
    [operationKey],
    client,
  );
}

/** Intents that never reached a settled state (recorded/failed/manual_review). */
export async function listIncompleteIntents(
  limit = 200,
): Promise<TransferIntent[]> {
  return dbAll<TransferIntent>(
    `SELECT * FROM campaign_transfer_intents
      WHERE state IN ('planned','signing','submitted','confirmed')
      ORDER BY updated_at ASC
      LIMIT $1`,
    [limit],
  );
}

export async function listCampaignIntents(
  campaignId: number,
): Promise<TransferIntent[]> {
  return dbAll<TransferIntent>(
    `SELECT * FROM campaign_transfer_intents
      WHERE campaign_id = $1 ORDER BY created_at ASC`,
    [campaignId],
  );
}
