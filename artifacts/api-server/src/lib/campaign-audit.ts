/**
 * Community Campaigns - money-event audit trail.
 *
 * Records EVERY consequential money event for a campaign (both system-driven
 * and admin-driven) into `campaign_audit_log`, so the full life of every
 * lamport is answerable from one append-only place. This complements, and does
 * not replace, `admin_audit_log` (operator actions) and `campaign_ledger`
 * (on-chain fund movements).
 *
 * Recording is best-effort and NEVER throws: an audit write failure must not
 * break the money operation it describes.
 */

import { dbAll, dbRun, type Queryable } from "./database.js";
import { logger } from "./logger.js";

export type CampaignAuditEvent =
  | "campaign_created"
  | "campaign_activated"
  | "campaign_expired"
  | "campaign_cancelled"
  | "contribution_detected"
  | "contribution_credited"
  | "contribution_flagged"
  | "deposit_parse_failed"
  | "campaign_funded"
  | "campaign_failed"
  | "milestone_reached"
  | "fulfillment_queued"
  | "execution_started"
  | "execution_failed"
  | "execution_sla_breached"
  | "settlement_started"
  | "settlement_payout"
  | "settlement_fee"
  | "settlement_excess_refund"
  | "settlement_completed"
  | "refund_started"
  | "refund_sent"
  | "refund_completed"
  | "campaign_frozen"
  | "campaign_unfrozen"
  | "manual_rescan"
  | "manual_retry_settlement"
  | "manual_retry_refunds"
  | "manual_begin_refund"
  | "manual_expire_activation"
  | "manual_retry_intent"
  | "reconciliation_warning"
  | "admin_override"
  // Generic lifecycle transition marker (state_<name>) from the central helper.
  | `state_${string}`;

export type CampaignAuditResult = "ok" | "error" | "warning" | "skipped";

export interface CampaignAuditInput {
  campaignId?: number | null;
  publicId?: string | null;
  event: CampaignAuditEvent;
  /** 'system' | 'cron' | an admin handle / x_id. */
  actor?: string;
  wallet?: string | null;
  txSignature?: string | null;
  lamports?: number | null;
  result?: CampaignAuditResult;
  detail?: string | null;
  correlationId?: string | null;
  /** Optional tx client so the write can join an existing transaction. */
  client?: Queryable;
}

/** Record a campaign money event. Best-effort: never throws. */
export async function recordCampaignEvent(
  input: CampaignAuditInput,
): Promise<void> {
  try {
    await dbRun(
      `INSERT INTO campaign_audit_log
         (campaign_id, public_id, event, actor, wallet, tx_signature,
          lamports, result, detail, correlation_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        input.campaignId ?? null,
        input.publicId ?? null,
        input.event,
        input.actor ?? "system",
        input.wallet ?? null,
        input.txSignature ?? null,
        input.lamports ?? null,
        input.result ?? "ok",
        input.detail ?? null,
        input.correlationId ?? null,
        Math.floor(Date.now() / 1000),
      ],
      input.client,
    );
  } catch (err) {
    logger.error(
      { err, event: input.event, campaignId: input.campaignId ?? null },
      "campaign audit write failed",
    );
  }
}

export interface CampaignAuditEntry {
  id: number;
  campaign_id: number | null;
  public_id: string | null;
  event: string;
  actor: string;
  wallet: string | null;
  tx_signature: string | null;
  lamports: number | null;
  result: string;
  detail: string | null;
  correlation_id: string | null;
  created_at: number;
}

/**
 * List money events newest-first. Scoped to one campaign when `campaignId` is
 * given, otherwise a platform-wide tail (used by the admin dashboard).
 */
export async function listCampaignAudit(opts: {
  campaignId?: number | null;
  result?: CampaignAuditResult;
  limit?: number;
}): Promise<CampaignAuditEntry[]> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.campaignId != null) {
    params.push(opts.campaignId);
    where.push(`campaign_id = $${params.length}`);
  }
  if (opts.result) {
    params.push(opts.result);
    where.push(`result = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit);
  return dbAll<CampaignAuditEntry>(
    `SELECT id, campaign_id, public_id, event, actor, wallet, tx_signature,
            lamports, result, detail, correlation_id, created_at
       FROM campaign_audit_log
       ${whereSql}
       ORDER BY id DESC
       LIMIT $${params.length}`,
    params,
  );
}
