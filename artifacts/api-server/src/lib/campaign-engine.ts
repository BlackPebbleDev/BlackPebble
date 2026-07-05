/**
 * Community Campaigns - engine (Phase 1: goal campaigns).
 *
 * Orchestrates the campaign lifecycle over the pure math (campaign-math.ts)
 * and the escrow service (campaign-escrow.ts). This module never moves funds
 * itself and never re-implements accounting - it sequences them.
 *
 * Lifecycle (goal campaigns):
 *   live ──(deposits ≥ goal)──▶ funded ──(admin fulfills)──▶ settled
 *     └──(deadline, < goal)──▶ failed ──(refunds sent)──▶ refunded
 *   any ──(invariant breach)──▶ frozen (admin investigates)
 */

import { randomUUID } from "node:crypto";
import { dbAll, dbGet, dbRun } from "./database.js";
import { logger } from "./logger.js";
import { getProfile } from "./profiles.js";
import { getCallerStats } from "./callers.js";
import {
  computeTrustScore,
  getUserBadges,
  type BadgeStatsInput,
} from "./badges.js";
import {
  canTransition,
  computeCampaignTrustScore,
  dueTransition,
  getCampaignTypeDef,
  planFailureRefunds,
  planExcessRefunds,
  planSettlement,
  resolveGoalLamports,
  validateCampaignInput,
  type CampaignState,
  type ContributionLike,
} from "./campaign-math.js";
import { validateCampaignToken } from "./campaign-token.js";
import { getSolPriceUsd } from "./prices.js";
import {
  deriveEscrowAddress,
  escrowConfigured,
  getEscrowBalance,
  getLedgerSummary,
  sendFromEscrow,
  sweepDeposits,
  verifyInvariant,
} from "./campaign-escrow.js";
import { ensureCampaignSchema } from "./campaign-schema.js";

const FEE_BPS = Math.min(
  2_000,
  Math.max(0, Number(process.env["CAMPAIGN_FEE_BPS"] ?? 300)),
);
const FEE_DESTINATION = process.env["CAMPAIGN_FEE_WALLET"] ?? null;

// ── Row / API shapes ─────────────────────────────────────────────────────────

interface CampaignRow {
  id: number;
  public_id: string;
  kind: string;
  type_key: string;
  creator_user_id: number;
  title: string;
  brief: string;
  token_mint: string | null;
  image_url: string | null;
  banner_url: string | null;
  link_url: string | null;
  goal_lamports: number;
  goal_usd: number | null;
  goal_label: string | null;
  deadline_at: number;
  state: CampaignState;
  trust_score: number;
  escrow_address: string;
  fulfillment_note: string | null;
  fulfillment_url: string | null;
  frozen_reason: string | null;
  created_at: number;
  funded_at: number | null;
  settled_at: number | null;
}

export interface CampaignSummary {
  publicId: string;
  kind: string;
  typeKey: string;
  title: string;
  brief: string;
  tokenMint: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  linkUrl: string | null;
  goalLamports: number;
  goalUsd: number | null;
  goalLabel: string | null;
  deadlineAt: number;
  state: CampaignState;
  trustScore: number;
  escrowAddress: string;
  createdAt: number;
  fundedAt: number | null;
  settledAt: number | null;
  fulfillmentNote: string | null;
  fulfillmentUrl: string | null;
  creator: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  accounting: {
    depositedLamports: number;
    paidOutLamports: number;
    refundedLamports: number;
    feeLamports: number;
    remainingLamports: number;
    contributorCount: number;
    progress: number;
  };
}

export interface CampaignLedgerEntry {
  kind: string;
  lamports: number;
  txSignature: string | null;
  counterparty: string | null;
  note: string | null;
  createdAt: number;
}

// ── Creation ─────────────────────────────────────────────────────────────────

export interface CreateCampaignInput {
  creatorUserId: number;
  typeKey: string;
  title: string;
  brief: string;
  /** Preset types: must be one of the type's USD goal options. */
  goalUsd?: number | null;
  /** Custom types: creator-chosen SOL goal. */
  goalSol?: number | null;
  durationSec: number;
  tokenMint?: string | null;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  linkUrl?: string | null;
}

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<{ ok: true; campaign: CampaignSummary } | { ok: false; error: string }> {
  await ensureCampaignSchema();

  if (!escrowConfigured()) {
    return {
      ok: false,
      error: "Campaign escrow is not configured on this server",
    };
  }

  const typeDef = getCampaignTypeDef(input.typeKey);
  if (!typeDef) return { ok: false, error: "Unknown campaign type" };

  // Token-oriented campaign types require a validated, safe token.
  let tokenMint: string | null = null;
  let tokenImage: string | null = null;
  if (typeDef.requiresToken) {
    const mint = input.tokenMint?.trim() ?? "";
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      return {
        ok: false,
        error: "A valid token contract address is required for this campaign type",
      };
    }
    const token = await validateCampaignToken(mint);
    if (token.safety === "danger") {
      return {
        ok: false,
        error: "This token failed the safety scan and cannot be campaigned",
      };
    }
    if (!token.valid) {
      return {
        ok: false,
        error: "Token not recognized, check the contract address",
      };
    }
    tokenMint = mint;
    tokenImage = token.logo;
  }

  // Fulfillment assets: types that need a banner cannot launch without one.
  const bannerUrl = input.bannerUrl?.trim() || null;
  if (typeDef.requiredAssets.includes("banner") && !bannerUrl) {
    return {
      ok: false,
      error: "This campaign type requires a custom banner image URL (3:1 ratio)",
    };
  }

  // Preset goals are pegged in USD and converted at the live SOL price so the
  // on-chain target always reflects the real service cost.
  const solPriceUsd = await getSolPriceUsd().catch(() => 0);
  const goal = resolveGoalLamports({
    typeKey: input.typeKey,
    goalUsd: input.goalUsd ?? null,
    goalSol: input.goalSol ?? null,
    solPriceUsd,
  });
  if ("error" in goal) return { ok: false, error: goal.error };

  const validationError = validateCampaignInput({
    title: input.title,
    brief: input.brief,
    typeKey: input.typeKey,
    goalLamports: goal.lamports,
    durationSec: input.durationSec,
  });
  if (validationError) return { ok: false, error: validationError };

  // One live campaign per creator at a time keeps spam low in Phase 1.
  const existing = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns
      WHERE creator_user_id = $1 AND state IN ('live', 'funded')
      LIMIT 1`,
    [input.creatorUserId],
  );
  if (existing) {
    return { ok: false, error: "You already have an active campaign" };
  }

  // The token's own logo is the natural campaign image when none is given.
  const imageUrl = input.imageUrl?.trim() || tokenImage || null;
  const trustScore = await computeCreatorCampaignTrust({
    ...input,
    imageUrl,
  });

  const publicId = randomUUID();
  const escrowAddress = deriveEscrowAddress(publicId);
  const now = Math.floor(Date.now() / 1000);

  const goalOption =
    typeDef.goalOptions?.find((o) => o.usd === input.goalUsd) ?? null;

  await dbRun(
    `INSERT INTO campaigns
       (public_id, kind, type_key, creator_user_id, title, brief, token_mint,
        image_url, banner_url, link_url, goal_lamports, goal_usd, goal_label,
        deadline_at, state, trust_score, escrow_address, created_at)
     VALUES ($1, 'goal', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             'live', $14, $15, $16)`,
    [
      publicId,
      input.typeKey,
      input.creatorUserId,
      input.title.trim(),
      input.brief.trim(),
      tokenMint,
      imageUrl,
      bannerUrl,
      input.linkUrl ?? null,
      goal.lamports,
      goalOption?.usd ?? null,
      goalOption?.label ?? null,
      now + input.durationSec,
      trustScore,
      escrowAddress,
      now,
    ],
  );
  await recordEvent(publicId, "launched");

  const campaign = await getCampaign(publicId);
  if (!campaign) return { ok: false, error: "Campaign creation failed" };
  logger.info(
    { publicId, creator: input.creatorUserId, goal: goal.lamports },
    "Campaign created",
  );
  return { ok: true, campaign };
}

/** Campaign trust score v0 from the creator's existing platform reputation. */
async function computeCreatorCampaignTrust(
  input: CreateCampaignInput,
): Promise<number> {
  let creatorTrust = 0;
  let accountAgeDays = 0;
  try {
    const profile = await getProfile(String(input.creatorUserId), null);
    if (profile) {
      const caller = await getCallerStats(profile.user_id);
      const stats: BadgeStatsInput = {
        closedTrades: profile.stats.spotClosedTrades,
        realizedPnlSol: profile.stats.realizedPnlSol,
        roiPercent: profile.stats.spotRoiPercent,
        traderRank: profile.rank,
        callsMade: caller?.callsMade ?? 0,
        bestMultiple: caller?.bestMultiple ?? null,
        callerRank: caller?.rank ?? null,
        hitRate: caller?.hitRate ?? 0,
        gradedCalls: caller?.gradedCalls ?? 0,
        callerScore: caller?.callerScore ?? 0,
      };
      const { earnedCount } = await getUserBadges(profile.user_id, stats);
      creatorTrust = computeTrustScore(stats, earnedCount).score;
      const createdAt = profile.xReputation.accountCreatedAt;
      if (createdAt) {
        accountAgeDays = Math.max(
          0,
          (Date.now() / 1000 - createdAt) / 86_400,
        );
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "Creator trust lookup failed - defaulting to 0");
  }

  const history = await dbGet<{ settled: number; failed: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE state = 'settled')::int AS settled,
       COUNT(*) FILTER (WHERE state IN ('failed', 'refunded', 'frozen'))::int AS failed
     FROM campaigns WHERE creator_user_id = $1`,
    [input.creatorUserId],
  );

  return computeCampaignTrustScore({
    creatorTrustScore: creatorTrust,
    creatorAccountAgeDays: accountAgeDays,
    creatorSettledCampaigns: history?.settled ?? 0,
    creatorFailedCampaigns: history?.failed ?? 0,
    hasCompleteBrief: input.brief.trim().length >= 100,
    hasImage: Boolean(input.imageUrl),
    hasLink: Boolean(input.linkUrl),
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function toSummary(row: CampaignRow): Promise<CampaignSummary> {
  const [summary, contribCount, creator] = await Promise.all([
    getLedgerSummary(row.id),
    dbGet<{ n: number }>(
      `SELECT COUNT(DISTINCT contributor)::int AS n
         FROM campaign_contributions WHERE campaign_id = $1`,
      [row.id],
    ),
    dbGet<{
      x_username: string | null;
      x_display_name: string | null;
      x_avatar_url: string | null;
    }>(
      `SELECT xi.x_username AS x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url
         FROM users u
         LEFT JOIN user_identities xi
           ON xi.user_id = u.id AND xi.provider = 'x'
        WHERE u.id = $1`,
      [row.creator_user_id],
    ),
  ]);

  return {
    publicId: row.public_id,
    kind: row.kind,
    typeKey: row.type_key,
    title: row.title,
    brief: row.brief,
    tokenMint: row.token_mint,
    imageUrl: row.image_url,
    bannerUrl: row.banner_url,
    linkUrl: row.link_url,
    goalLamports: row.goal_lamports,
    goalUsd: row.goal_usd,
    goalLabel: row.goal_label,
    deadlineAt: row.deadline_at,
    state: row.state,
    trustScore: row.trust_score,
    escrowAddress: row.escrow_address,
    createdAt: row.created_at,
    fundedAt: row.funded_at,
    settledAt: row.settled_at,
    fulfillmentNote: row.fulfillment_note,
    fulfillmentUrl: row.fulfillment_url,
    creator: {
      username: creator?.x_username ?? null,
      displayName: creator?.x_display_name ?? null,
      avatarUrl: creator?.x_avatar_url ?? null,
    },
    accounting: {
      depositedLamports: summary.deposited,
      paidOutLamports: summary.paidOut,
      refundedLamports: summary.refunded,
      feeLamports: summary.fees,
      remainingLamports: summary.remaining,
      contributorCount: contribCount?.n ?? 0,
      progress:
        row.goal_lamports > 0 ? summary.deposited / row.goal_lamports : 0,
    },
  };
}

export async function listCampaigns(
  stateFilter?: string,
): Promise<CampaignSummary[]> {
  await ensureCampaignSchema();
  const params: unknown[] = [];
  let where = "";
  if (stateFilter && stateFilter !== "all") {
    params.push(stateFilter);
    where = "WHERE state = $1";
  }
  const rows = await dbAll<CampaignRow>(
    `SELECT * FROM campaigns ${where} ORDER BY created_at DESC LIMIT 100`,
    params,
  );
  return Promise.all(rows.map(toSummary));
}

export async function getCampaign(
  publicId: string,
): Promise<CampaignSummary | null> {
  await ensureCampaignSchema();
  const row = await dbGet<CampaignRow>(
    `SELECT * FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  return row ? toSummary(row) : null;
}

export async function getCampaignLedger(
  publicId: string,
): Promise<CampaignLedgerEntry[] | null> {
  await ensureCampaignSchema();
  const row = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!row) return null;
  const entries = await dbAll<{
    kind: string;
    lamports: number;
    tx_signature: string | null;
    counterparty: string | null;
    note: string | null;
    created_at: number;
  }>(
    `SELECT kind, lamports, tx_signature, counterparty, note, created_at
       FROM campaign_ledger WHERE campaign_id = $1
      ORDER BY created_at ASC, id ASC`,
    [row.id],
  );
  return entries.map((e) => ({
    kind: e.kind,
    lamports: e.lamports,
    txSignature: e.tx_signature,
    counterparty: e.counterparty,
    note: e.note,
    createdAt: e.created_at,
  }));
}

// ── Sweep + lifecycle (cron) ─────────────────────────────────────────────────

let sweeping = false;

/**
 * Sweep every campaign that can still receive or owe money: credit new
 * deposits, apply due state transitions, process failure refunds, and verify
 * the escrow invariant. Guarded against overlapping runs.
 */
export async function sweepAllCampaigns(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    await ensureCampaignSchema();
    if (!escrowConfigured()) return;

    const rows = await dbAll<CampaignRow>(
      `SELECT * FROM campaigns WHERE state IN ('live', 'funded', 'failed')`,
    );
    for (const row of rows) {
      try {
        await sweepOne(row);
      } catch (e) {
        logger.warn(
          { err: e, publicId: row.public_id },
          "Campaign sweep failed",
        );
      }
    }
  } finally {
    sweeping = false;
  }
}

async function sweepOne(row: CampaignRow): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  if (row.state === "live" || row.state === "funded") {
    await sweepDeposits(row.id, row.public_id, row.escrow_address);
    const healthy = await verifyInvariant(row.id, row.escrow_address);
    if (!healthy) return;
  }

  if (row.state === "live") {
    const summary = await getLedgerSummary(row.id);
    const next = dueTransition(
      row.state,
      summary.deposited,
      row.goal_lamports,
      row.deadline_at,
      now,
    );
    if (next && canTransition(row.state, next)) {
      await dbRun(
        `UPDATE campaigns
            SET state = $2, funded_at = CASE WHEN $2 = 'funded' THEN $3 ELSE funded_at END
          WHERE id = $1 AND state = 'live'`,
        [row.id, next, now],
      );
      await recordEvent(row.public_id, next === "funded" ? "funded" : "failed");
      logger.info(
        { publicId: row.public_id, from: row.state, to: next },
        "Campaign state transition",
      );
      row.state = next;
    }
  }

  if (row.state === "failed") {
    await processFailureRefunds(row);
  }
}

/** Send owed refunds for a failed campaign; mark refunded when all done. */
async function processFailureRefunds(row: CampaignRow): Promise<void> {
  const contributions = await dbAll<ContributionLike & { refund_sig: string | null }>(
    `SELECT id, contributor, lamports, refunded, refund_sig
       FROM campaign_contributions WHERE campaign_id = $1
      ORDER BY id ASC`,
    [row.id],
  );
  const plan = planFailureRefunds(contributions);

  for (const refund of plan) {
    try {
      const sig = await sendFromEscrow({
        campaignId: row.id,
        publicId: row.public_id,
        kind: "refund",
        destination: refund.destination,
        lamports: refund.lamports,
        note: "Campaign failed - automatic full refund (network fee only)",
      });
      await dbRun(
        `UPDATE campaign_contributions
            SET refunded = TRUE, refund_sig = $2 WHERE id = $1`,
        [refund.contributionId, sig],
      );
    } catch (e) {
      logger.warn(
        { err: e, publicId: row.public_id, contributionId: refund.contributionId },
        "Refund send failed - will retry next sweep",
      );
      return; // retry remaining refunds next sweep
    }
  }

  const owed = await dbGet<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM campaign_contributions
      WHERE campaign_id = $1 AND refunded = FALSE
        AND lamports > 10000`,
    [row.id],
  );
  if ((owed?.n ?? 0) === 0 && canTransition(row.state, "refunded")) {
    await dbRun(
      `UPDATE campaigns SET state = 'refunded', settled_at = $2
        WHERE id = $1 AND state = 'failed'`,
      [row.id, Math.floor(Date.now() / 1000)],
    );
    logger.info({ publicId: row.public_id }, "Campaign fully refunded");
  }
}

// ── Admin settlement ─────────────────────────────────────────────────────────

/**
 * Settle a funded campaign: pay the fulfillment destination, take the
 * platform fee, refund any overfunded excess pro-rata, attach proof. Admin
 * only - Phase 1 fulfillment is a human action with a receipt.
 */
export async function settleCampaign(opts: {
  publicId: string;
  payoutDestination: string;
  fulfillmentNote: string;
  fulfillmentUrl?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureCampaignSchema();
  const row = await dbGet<CampaignRow>(
    `SELECT * FROM campaigns WHERE public_id = $1`,
    [opts.publicId],
  );
  if (!row) return { ok: false, error: "Campaign not found" };
  if (row.state !== "funded") {
    return { ok: false, error: `Cannot settle a ${row.state} campaign` };
  }
  if (!opts.fulfillmentNote.trim()) {
    return { ok: false, error: "Fulfillment proof note is required" };
  }

  // Catch any last-minute deposits before splitting funds.
  await sweepDeposits(row.id, row.public_id, row.escrow_address);
  const summary = await getLedgerSummary(row.id);
  const plan = planSettlement(summary.deposited, row.goal_lamports, FEE_BPS);

  await sendFromEscrow({
    campaignId: row.id,
    publicId: row.public_id,
    kind: "payout",
    destination: opts.payoutDestination,
    lamports: plan.payoutLamports,
    note: opts.fulfillmentNote.trim(),
  });

  if (plan.feeLamports > 0 && FEE_DESTINATION) {
    await sendFromEscrow({
      campaignId: row.id,
      publicId: row.public_id,
      kind: "fee",
      destination: FEE_DESTINATION,
      lamports: plan.feeLamports,
      note: `Platform fee (${FEE_BPS} bps of goal)`,
    });
  }

  // Overfunding goes BACK to contributors pro-rata - never kept.
  if (plan.excessLamports > 0) {
    const contributions = await dbAll<ContributionLike>(
      `SELECT id, contributor, lamports, refunded
         FROM campaign_contributions WHERE campaign_id = $1`,
      [row.id],
    );
    for (const refund of planExcessRefunds(contributions, plan.excessLamports)) {
      try {
        await sendFromEscrow({
          campaignId: row.id,
          publicId: row.public_id,
          kind: "refund",
          destination: refund.destination,
          lamports: refund.lamports,
          note: "Overfunding returned pro-rata",
        });
      } catch (e) {
        logger.warn(
          { err: e, publicId: row.public_id },
          "Excess refund failed - continuing settlement",
        );
      }
    }
  }

  await dbRun(
    `UPDATE campaigns
        SET state = 'settled', settled_at = $2,
            fulfillment_note = $3, fulfillment_url = $4
      WHERE id = $1 AND state = 'funded'`,
    [
      row.id,
      Math.floor(Date.now() / 1000),
      opts.fulfillmentNote.trim(),
      opts.fulfillmentUrl ?? null,
    ],
  );
  await recordEvent(row.public_id, "completed");
  logger.info({ publicId: row.public_id }, "Campaign settled");
  return { ok: true };
}

// ── Events ───────────────────────────────────────────────────────────────────

async function recordEvent(publicId: string, eventKey: string): Promise<void> {
  const row = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!row) return;
  await dbRun(
    `INSERT INTO campaign_events (campaign_id, event_key, created_at)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [row.id, eventKey, Math.floor(Date.now() / 1000)],
  );
}
