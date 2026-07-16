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
  computeCampaignTrustScore,
  getCampaignTypeDef,
  getExecutionPolicy,
  isValidDeadlineHours,
  MIN_OPENING_LAMPORTS,
  MAX_OPENING_LAMPORTS,
  planFailureRefunds,
  planExcessRefunds,
  planSettlement,
  resolveGoalLamports,
  SOL_QUOTE_MAX_AGE_SEC,
  validateCampaignInput,
  type ContributionLike,
} from "./campaign-math.js";
import {
  canTransition,
  dueFundingTransition,
  isRefundLocked,
  normalizeState,
  STATE_TIMESTAMP_COLUMN,
  type LifecycleState,
} from "./campaign-lifecycle.js";
import { CampaignError, fail, type CampaignResult } from "./campaign-errors.js";
import { validateCampaignToken } from "./campaign-token.js";
import { getSolPriceUsd, getTokenStatsBatch } from "./prices.js";
import { getTokenMetadataBatch } from "./helius.js";
import { applyTokenEnrichment } from "./campaign-token-enrichment.js";
import { isCacheFresh } from "./database.js";
import {
  creditContribution,
  deriveEscrowAddress,
  escrowConfigured,
  getEscrowBalance,
  getLedgerSummary,
  reconcileTransferIntents,
  sendFromEscrow,
  sweepDeposits,
  verifyIncomingTransfer,
  verifyInvariant,
  withCampaignLock,
} from "./campaign-escrow.js";
import {
  listCampaignIntents,
  operationKey,
} from "./campaign-transfer-intents.js";
import {
  milestonesCrossed,
  reconcileCampaign as computeReconciliation,
  resolveSettlementDestinations,
  type ReconReport,
} from "./campaign-recon.js";
import { recordCampaignEvent, type CampaignAuditEvent } from "./campaign-audit.js";
import { ensureCampaignSchema } from "./campaign-schema.js";

/** Platform fee in basis points of the GOAL, taken only at settlement. */
export const FEE_BPS = Math.min(
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
  token_name: string | null;
  token_symbol: string | null;
  image_url: string | null;
  banner_url: string | null;
  link_url: string | null;
  goal_lamports: number;
  goal_usd: number | null;
  goal_label: string | null;
  deadline_at: number;
  state: LifecycleState;
  trust_score: number;
  escrow_address: string;
  fulfillment_note: string | null;
  fulfillment_url: string | null;
  frozen_reason: string | null;
  created_at: number;
  funded_at: number | null;
  settled_at: number | null;
  // Phase 2 columns.
  published: boolean;
  creator_wallet: string | null;
  activated_at: number | null;
  expired_at: number | null;
  refunding_at: number | null;
  activation_price_usd: number | null;
  activation_quote_provider: string | null;
  activation_quote_at: number | null;
  duration_sec: number;
  execution_mode: string;
  provider_key: string | null;
  fulfillment_sla_seconds: number;
  execution_status: string;
  execution_attempt_count: number;
  execution_started_at: number | null;
  execution_deadline_at: number | null;
  execution_completed_at: number | null;
  execution_failure_reason: string | null;
  proof_type: string | null;
  proof_value: string | null;
}

export interface CampaignSummary {
  publicId: string;
  kind: string;
  typeKey: string;
  title: string;
  brief: string;
  tokenMint: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenMarketCapUsd: number | null;
  tokenMarketCapFetchedAt: number | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  linkUrl: string | null;
  goalLamports: number;
  goalUsd: number | null;
  goalLabel: string | null;
  deadlineAt: number;
  state: LifecycleState;
  trustScore: number;
  escrowAddress: string;
  createdAt: number;
  fundedAt: number | null;
  settledAt: number | null;
  fulfillmentNote: string | null;
  fulfillmentUrl: string | null;
  published: boolean;
  creatorWallet: string | null;
  activatedAt: number | null;
  activationPriceUsd: number | null;
  activationQuoteAt: number | null;
  durationSec: number;
  executionMode: string;
  providerKey: string | null;
  fulfillmentSlaSeconds: number;
  executionStatus: string;
  executionDeadlineAt: number | null;
  executionStartedAt: number | null;
  executionCompletedAt: number | null;
  executionFailureReason: string | null;
  proofType: string | null;
  proofValue: string | null;
  openingMinLamports: number;
  openingMaxLamports: number;
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
): Promise<CampaignResult<{ campaign: CampaignSummary }>> {
  await ensureCampaignSchema();

  // ── escrow_config ──
  if (!escrowConfigured()) {
    return fail(
      "ESCROW_NOT_CONFIGURED",
      "escrow_config",
      "Campaigns are temporarily unavailable. Please try again later.",
      true,
    );
  }

  // ── validation: campaign type ──
  const typeDef = getCampaignTypeDef(input.typeKey);
  if (!typeDef) {
    return fail("UNKNOWN_TYPE", "validation", "Unknown campaign type");
  }

  // ── token_verification ──
  let tokenMint: string | null = null;
  let tokenImage: string | null = null;
  let tokenName: string | null = null;
  let tokenSymbol: string | null = null;
  if (typeDef.requiresToken) {
    const mint = input.tokenMint?.trim() ?? "";
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      return fail(
        "TOKEN_INVALID",
        "token_verification",
        "A valid token contract address is required for this campaign type",
      );
    }
    const token = await validateCampaignToken(mint);
    if (token.safety === "danger") {
      return fail(
        "TOKEN_UNSAFE",
        "token_verification",
        "This token failed the safety scan and cannot be campaigned",
      );
    }
    if (!token.valid) {
      return fail(
        "TOKEN_INVALID",
        "token_verification",
        "Token not recognized, check the contract address",
      );
    }
    tokenMint = mint;
    tokenImage = token.logo;
    tokenName = token.name ?? null;
    tokenSymbol = token.symbol ?? null;
  }

  // ── validation: fulfillment assets ──
  const bannerUrl = input.bannerUrl?.trim() || null;
  if (typeDef.requiredAssets.includes("banner") && !bannerUrl) {
    return fail(
      "INVALID_INPUT",
      "validation",
      "This campaign type requires a custom banner image URL (3:1 ratio)",
    );
  }

  // ── validation: goal tier ──
  // The USD tier is fixed here, but the SOL goal is NOT locked until activation
  // (see activateCampaign). We compute a PROVISIONAL lamport goal only to
  // validate bounds; a missing/stale SOL price must NOT block creation.
  const livePrice = await getSolPriceUsd().catch(() => 0);
  const priceForBounds = livePrice > 0 ? livePrice : 150; // provisional only
  const goal = resolveGoalLamports({
    typeKey: input.typeKey,
    goalUsd: input.goalUsd ?? null,
    goalSol: input.goalSol ?? null,
    solPriceUsd: priceForBounds,
  });
  if ("error" in goal) {
    return fail("INVALID_INPUT", "validation", goal.error);
  }

  // ── validation: deadline policy ──
  const durationHours = Math.round(input.durationSec / 3600);
  if (!isValidDeadlineHours(durationHours)) {
    return fail(
      "INVALID_INPUT",
      "validation",
      "Choose a supported deadline: 12, 24, 48, or 72 hours",
    );
  }

  // ── validation: title / brief ──
  const validationError = validateCampaignInput({
    title: input.title,
    brief: input.brief,
    typeKey: input.typeKey,
    goalLamports: goal.lamports,
    durationSec: input.durationSec,
  });
  if (validationError) {
    return fail("INVALID_INPUT", "validation", validationError);
  }

  // ── duplicate_check + durable creation idempotency ──
  // An unactivated campaign is reused (retry-safe) rather than duplicated. A
  // campaign that has already launched blocks a new one (one active per creator).
  const existing = await dbGet<CampaignRow>(
    `SELECT * FROM campaigns
      WHERE creator_user_id = $1
        AND state IN ('awaiting_initial_contribution','live','funded','awaiting_execution','executing')
      ORDER BY created_at DESC
      LIMIT 1`,
    [input.creatorUserId],
  );
  if (existing) {
    if (normalizeState(existing.state) === "awaiting_initial_contribution") {
      const campaign = await getCampaign(existing.public_id);
      if (campaign) return { ok: true, campaign };
    }
    return fail(
      "DUPLICATE_ACTIVE_CAMPAIGN",
      "duplicate_check",
      "You already have an active campaign. Finish or resolve it before starting another.",
    );
  }

  // ── persistence ──
  const imageUrl = input.imageUrl?.trim() || tokenImage || null;
  const trustScore = await computeCreatorCampaignTrust({ ...input, imageUrl });
  const publicId = randomUUID();
  const escrowAddress = deriveEscrowAddress(publicId);
  const now = Math.floor(Date.now() / 1000);
  const goalOption =
    typeDef.goalOptions?.find((o) => o.usd === input.goalUsd) ?? null;
  const exec = getExecutionPolicy(input.typeKey);

  try {
    await dbRun(
      `INSERT INTO campaigns
         (public_id, kind, type_key, creator_user_id, title, brief, token_mint,
          token_name, token_symbol,
          image_url, banner_url, link_url, goal_lamports, goal_usd, goal_label,
          deadline_at, state, published, trust_score, escrow_address, created_at,
          duration_sec, execution_mode, provider_key, fulfillment_sla_seconds,
          execution_status)
       VALUES ($1, 'goal', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14, $15,
               'awaiting_initial_contribution', FALSE, $16, $17, $18,
               $19, $20, $21, $22, 'none')`,
      [
        publicId,
        input.typeKey,
        input.creatorUserId,
        input.title.trim(),
        input.brief.trim(),
        tokenMint,
        tokenName,
        tokenSymbol,
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
        input.durationSec,
        exec.mode,
        exec.providerKey,
        exec.fulfillmentSlaSeconds,
      ],
    );
  } catch (e) {
    logger.error({ err: e, publicId }, "Campaign persistence failed");
    return fail(
      "INTERNAL",
      "persistence",
      "Could not save the campaign. Please try again.",
      true,
    );
  }

  await recordEvent(publicId, "created");
  const campaign = await getCampaign(publicId);
  if (!campaign) {
    return fail("INTERNAL", "persistence", "Campaign creation failed", true);
  }
  await recordCampaignEvent({
    publicId,
    event: "campaign_created",
    actor: `user:${input.creatorUserId}`,
    detail: `${input.typeKey} tier $${input.goalUsd ?? "?"} awaiting opening contribution`,
  });
  logger.info(
    { publicId, creator: input.creatorUserId, tierUsd: input.goalUsd },
    "Campaign created (awaiting opening contribution)",
  );
  return { ok: true, campaign };
}

// ── Central transition helper ────────────────────────────────────────────────

/**
 * Apply a state transition atomically under the campaign lock (the CALLER must
 * already hold it). Validates the transition, stamps the appropriate timestamp
 * column, records the public + money-event audit rows, and is idempotent: a
 * no-op when the campaign is already in `to`. Returns whether it changed state.
 */
async function transitionState(opts: {
  row: CampaignRow;
  to: LifecycleState;
  actor?: string;
  reason?: string;
  correlationId?: string | null;
  publicEventKey?: string;
  eventName?: CampaignAuditEvent;
  extraSets?: Record<string, number | string | null>;
}): Promise<boolean> {
  const from = normalizeState(opts.row.state);
  if (from === opts.to) return false;
  if (!canTransition(from, opts.to)) {
    throw new CampaignError({
      code: "INVALID_TRANSITION",
      stage: "lifecycle_transition",
      message: `Illegal transition ${from} -> ${opts.to}`,
    });
  }
  const now = Math.floor(Date.now() / 1000);
  const sets: string[] = ["state = $2"];
  const params: unknown[] = [opts.row.id, opts.to];
  const tsCol = STATE_TIMESTAMP_COLUMN[opts.to];
  if (tsCol) {
    params.push(now);
    sets.push(`${tsCol} = $${params.length}`);
  }
  for (const [col, val] of Object.entries(opts.extraSets ?? {})) {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  }
  params.push(from);
  await dbRun(
    `UPDATE campaigns SET ${sets.join(", ")}
      WHERE id = $1 AND state = $${params.length}`,
    params,
  );
  opts.row.state = opts.to;
  if (opts.publicEventKey) await recordEvent(opts.row.public_id, opts.publicEventKey);
  await recordCampaignEvent({
    campaignId: opts.row.id,
    publicId: opts.row.public_id,
    event: opts.eventName ?? `state_${opts.to}`,
    actor: opts.actor,
    detail: opts.reason,
    correlationId: opts.correlationId ?? null,
  });
  logger.info(
    { publicId: opts.row.public_id, from, to: opts.to },
    "Campaign state transition",
  );
  return true;
}

// ── Opening contribution / activation ────────────────────────────────────────

/**
 * Verify the creator's opening contribution on-chain and, if valid, lock the
 * SOL goal at a fresh quote and publish the campaign (awaiting_initial_contribution
 * -> live). Idempotent: a campaign already live returns success. The sender and
 * amount are read from the confirmed transaction, never trusted from the client.
 */
export async function activateCampaign(opts: {
  publicId: string;
  creatorUserId: number;
  creatorWallet: string;
  txSignature: string;
}): Promise<CampaignResult<{ campaign: CampaignSummary }>> {
  await ensureCampaignSchema();
  const head = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [opts.publicId],
  );
  if (!head) return fail("NOT_FOUND", "activation_verification", "Campaign not found", false);

  return withCampaignLock(head.id, async () => {
    const row = await dbGet<CampaignRow>(`SELECT * FROM campaigns WHERE id = $1`, [
      head.id,
    ]);
    if (!row) return fail("NOT_FOUND", "activation_verification", "Campaign not found");
    if (row.creator_user_id !== opts.creatorUserId) {
      return fail("AUTH_REQUIRED", "authentication", "Only the creator can activate this campaign");
    }
    if (normalizeState(row.state) === "live") {
      const campaign = await getCampaign(row.public_id);
      return { ok: true as const, campaign: campaign! };
    }
    if (normalizeState(row.state) !== "awaiting_initial_contribution") {
      return fail("WRONG_STATE", "lifecycle_transition", `Campaign is ${row.state}, cannot activate`);
    }

    // Fresh, non-stale SOL quote or we do not activate (never guess the price).
    const price = await getSolPriceUsd().catch(() => 0);
    if (!(price > 0) || !isCacheFresh("sol_usd", SOL_QUOTE_MAX_AGE_SEC * 1000)) {
      return fail("PRICE_UNAVAILABLE", "pricing", "SOL price unavailable, try again shortly", true);
    }

    // Verify the opening transaction on-chain.
    const v = await verifyIncomingTransfer({
      escrowAddress: row.escrow_address,
      signature: opts.txSignature,
    });
    if (!v.ok) {
      if (v.reason === "unconfirmed") {
        return fail("ACTIVATION_TX_UNCONFIRMED", "activation_verification", "Transaction not confirmed yet, try again in a moment", true);
      }
      if (v.reason === "wrong_destination") {
        return fail("ACTIVATION_WRONG_DESTINATION", "activation_verification", "That transaction did not send SOL to this campaign's escrow");
      }
      return fail("ACTIVATION_TX_INVALID", "activation_verification", "Could not verify that transaction");
    }
    if (v.sender !== opts.creatorWallet) {
      return fail("ACTIVATION_WRONG_SENDER", "activation_verification", "The opening contribution must come from your connected wallet");
    }
    if (v.lamports < MIN_OPENING_LAMPORTS) {
      return fail("ACTIVATION_AMOUNT_TOO_LOW", "activation_verification", `Opening contribution must be at least ${MIN_OPENING_LAMPORTS / 1e9} SOL`);
    }

    // Credit the opening contribution exactly once.
    await creditContribution({
      campaignId: row.id,
      publicId: row.public_id,
      sender: v.sender,
      lamports: v.lamports,
      signature: opts.txSignature,
      blockTime: v.blockTime,
    });

    // Lock the SOL goal at this fresh quote.
    const lockedGoal = resolveGoalLamports({
      typeKey: row.type_key,
      goalUsd: row.goal_usd,
      goalSol: null,
      solPriceUsd: price,
    });
    const goalLamports = "error" in lockedGoal ? row.goal_lamports : lockedGoal.lamports;
    const now = Math.floor(Date.now() / 1000);
    const deadlineAt = now + row.duration_sec;

    await transitionState({
      row,
      to: "live",
      actor: `user:${opts.creatorUserId}`,
      reason: "Opening contribution confirmed",
      publicEventKey: "activated",
      eventName: "campaign_activated",
      extraSets: {
        creator_wallet: opts.creatorWallet,
        goal_lamports: goalLamports,
        deadline_at: deadlineAt,
        activation_price_usd: price,
        activation_quote_provider: "dexscreener",
        activation_quote_at: now,
      },
    });
    // published is a boolean; set separately to keep the generic helper untyped.
    await dbRun(`UPDATE campaigns SET published = TRUE WHERE id = $1`, [row.id]);
    await recordEvent(row.public_id, "opening_contribution");

    const campaign = await getCampaign(row.public_id);
    logger.info({ publicId: row.public_id, goalLamports }, "Campaign activated");
    return { ok: true as const, campaign: campaign! };
  });
}

/**
 * Verify and credit a PUBLIC contributor's SOL transfer (no BlackPebble account
 * required). The campaign must be live. Idempotent per signature. Emits funding
 * milestones and triggers the funded transition when the goal is reached.
 */
export async function submitPublicContribution(opts: {
  publicId: string;
  txSignature: string;
}): Promise<CampaignResult<{ campaign: CampaignSummary; credited: boolean }>> {
  await ensureCampaignSchema();
  const head = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [opts.publicId],
  );
  if (!head) return fail("NOT_FOUND", "contribution_verification", "Campaign not found");

  return withCampaignLock(head.id, async () => {
    const row = await dbGet<CampaignRow>(`SELECT * FROM campaigns WHERE id = $1`, [
      head.id,
    ]);
    if (!row) return fail("NOT_FOUND", "contribution_verification", "Campaign not found");
    if (normalizeState(row.state) !== "live") {
      return fail("CONTRIBUTION_CLOSED", "contribution_verification", "This campaign is not accepting contributions");
    }

    const v = await verifyIncomingTransfer({
      escrowAddress: row.escrow_address,
      signature: opts.txSignature,
    });
    if (!v.ok) {
      if (v.reason === "unconfirmed") {
        return fail("CONTRIBUTION_TX_UNCONFIRMED", "contribution_verification", "Transaction not confirmed yet, try again in a moment", true);
      }
      if (v.reason === "wrong_destination") {
        return fail("CONTRIBUTION_WRONG_DESTINATION", "contribution_verification", "That transaction did not send SOL to this campaign's escrow");
      }
      return fail("CONTRIBUTION_TX_INVALID", "contribution_verification", "Could not verify that transaction");
    }

    const before = await getLedgerSummary(row.id);
    const contributionId = await creditContribution({
      campaignId: row.id,
      publicId: row.public_id,
      sender: v.sender,
      lamports: v.lamports,
      signature: opts.txSignature,
      blockTime: v.blockTime,
    });
    const after = await getLedgerSummary(row.id);
    await emitMilestones(row, before.deposited, after.deposited);
    await maybeAdvanceFunding(row, Math.floor(Date.now() / 1000));

    const campaign = await getCampaign(row.public_id);
    return { ok: true as const, campaign: campaign!, credited: contributionId != null };
  });
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
    tokenName: row.token_name,
    tokenSymbol: row.token_symbol,
    tokenMarketCapUsd: null,
    tokenMarketCapFetchedAt: null,
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
    published: row.published,
    creatorWallet: row.creator_wallet,
    activatedAt: row.activated_at,
    activationPriceUsd: row.activation_price_usd,
    activationQuoteAt: row.activation_quote_at,
    durationSec: row.duration_sec,
    executionMode: row.execution_mode,
    providerKey: row.provider_key,
    fulfillmentSlaSeconds: row.fulfillment_sla_seconds,
    executionStatus: row.execution_status,
    executionDeadlineAt: row.execution_deadline_at,
    executionStartedAt: row.execution_started_at,
    executionCompletedAt: row.execution_completed_at,
    executionFailureReason: row.execution_failure_reason,
    proofType: row.proof_type,
    proofValue: row.proof_value,
    openingMinLamports: MIN_OPENING_LAMPORTS,
    openingMaxLamports: MAX_OPENING_LAMPORTS,
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

// In-memory market-cap cache so the campaign list/detail don't hammer the
// price provider on every load. Keyed by mint → { mc, fetchedAt }.
const MC_CACHE_TTL_MS = 60_000;
const mcCache = new Map<string, { mc: number | null; fetchedAt: number }>();

/**
 * Enrich a batch of summaries in place with token identity + market cap using
 * batched provider calls (no per-card / N+1 requests). Provider failures are
 * swallowed so campaign browsing never breaks. Also backfills legacy rows whose
 * token_name/token_symbol were never persisted (one-time UPDATE per row).
 */
async function enrichSummaries(summaries: CampaignSummary[]): Promise<void> {
  const mints = [
    ...new Set(
      summaries.map((s) => s.tokenMint).filter((m): m is string => !!m),
    ),
  ];
  if (mints.length === 0) return;

  // Only mints missing name/symbol need a metadata lookup for backfill.
  const needMeta = [
    ...new Set(
      summaries
        .filter((s) => s.tokenMint && (!s.tokenName || !s.tokenSymbol))
        .map((s) => s.tokenMint as string),
    ),
  ];

  // Market cap: reuse fresh cache, only fetch stale/missing mints.
  const now = Date.now();
  const staleMints = mints.filter((m) => {
    const c = mcCache.get(m);
    return !c || now - c.fetchedAt > MC_CACHE_TTL_MS;
  });

  const [meta, stats] = await Promise.all([
    needMeta.length
      ? getTokenMetadataBatch(needMeta).catch(() => ({}) as Record<string, { symbol: string | null; name: string | null; logo: string | null }>)
      : Promise.resolve({} as Record<string, { symbol: string | null; name: string | null; logo: string | null }>),
    staleMints.length
      ? getTokenStatsBatch(staleMints).catch(() => new Map())
      : Promise.resolve(new Map()),
  ]);

  for (const m of staleMints) {
    const st = stats.get(m);
    mcCache.set(m, { mc: st?.marketCapUsd ?? null, fetchedAt: now });
  }

  const backfill = applyTokenEnrichment(summaries, meta, mcCache);

  // Persist backfilled identity so future reads are instant (best-effort).
  for (const b of backfill) {
    if (!b.name && !b.symbol) continue;
    dbRun(
      `UPDATE campaigns
          SET token_name = COALESCE(token_name, $2),
              token_symbol = COALESCE(token_symbol, $3)
        WHERE public_id = $1
          AND (token_name IS NULL OR token_symbol IS NULL)`,
      [b.publicId, b.name, b.symbol],
    ).catch((e) => logger.warn({ err: e, publicId: b.publicId }, "Token identity backfill failed"));
  }
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
  const summaries = await Promise.all(rows.map(toSummary));
  await enrichSummaries(summaries).catch((e) =>
    logger.warn({ err: e }, "Campaign summary enrichment failed"),
  );
  return summaries;
}

/**
 * Duplicate detection: find an existing publicly-active campaign for the same
 * token + service (type key). Used before creation so the UI can offer
 * "Contribute instead" rather than silently spawning a competing campaign.
 * "Active" = accepting funds or mid-fulfillment (not terminal, not a private
 * pre-activation draft).
 */
export async function findActiveCampaignForToken(
  tokenMint: string,
  typeKey: string,
): Promise<CampaignSummary | null> {
  await ensureCampaignSchema();
  const row = await dbGet<CampaignRow>(
    `SELECT * FROM campaigns
       WHERE token_mint = $1 AND type_key = $2 AND published = TRUE
         AND state IN ('live','funded','awaiting_execution','executing')
       ORDER BY created_at DESC
       LIMIT 1`,
    [tokenMint, typeKey],
  );
  if (!row) return null;
  const summary = await toSummary(row);
  await enrichSummaries([summary]).catch(() => {});
  return summary;
}

export async function getCampaign(
  publicId: string,
): Promise<CampaignSummary | null> {
  await ensureCampaignSchema();
  const row = await dbGet<CampaignRow>(
    `SELECT * FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!row) return null;
  const summary = await toSummary(row);
  await enrichSummaries([summary]).catch((e) =>
    logger.warn({ err: e, publicId }, "Campaign detail enrichment failed"),
  );
  return summary;
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

export interface CampaignTimelineEntry {
  eventKey: string;
  createdAt: number;
}

/**
 * Public campaign timeline: launched / milestones / funded / failed / completed
 * events, oldest-first. Backed by the idempotent campaign_events table.
 */
export async function getCampaignTimeline(
  publicId: string,
): Promise<CampaignTimelineEntry[] | null> {
  await ensureCampaignSchema();
  const row = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!row) return null;
  const events = await dbAll<{ event_key: string; created_at: number }>(
    `SELECT event_key, created_at FROM campaign_events
      WHERE campaign_id = $1 ORDER BY created_at ASC, id ASC`,
    [row.id],
  );
  return events.map((e) => ({ eventKey: e.event_key, createdAt: e.created_at }));
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
      `SELECT * FROM campaigns
        WHERE state IN ('live','funded','awaiting_execution','executing',
                        'expired','execution_failed','refunding','failed')`,
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

/** Wraps sweepOne in the per-campaign lock so cron/manual/settle never overlap. */
async function sweepOne(row: CampaignRow): Promise<void> {
  await withCampaignLock(row.id, () => sweepOneLocked(row));
}

async function sweepOneLocked(row: CampaignRow): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  let state = normalizeState(row.state);

  // Credit any new / late deposits while funds can still arrive or must be
  // tracked for the invariant.
  if (state === "live" || state === "funded" || state === "awaiting_execution") {
    const before = await getLedgerSummary(row.id);
    await sweepDeposits(row.id, row.public_id, row.escrow_address);
    const after = await getLedgerSummary(row.id);
    if (state === "live") await emitMilestones(row, before.deposited, after.deposited);

    const healthy = await verifyInvariant(row.id, row.escrow_address);
    if (!healthy) {
      await recordCampaignEvent({
        campaignId: row.id,
        publicId: row.public_id,
        event: "campaign_frozen",
        result: "error",
        detail: "Escrow invariant breach detected during sweep.",
      });
      return;
    }
  }

  if (state === "live") {
    await maybeAdvanceFunding(row, now);
    state = normalizeState(row.state);
  }

  if (state === "funded") {
    await enterFulfillmentQueue(row, now);
    state = normalizeState(row.state);
  }

  if (state === "awaiting_execution" || state === "executing") {
    await maybeFailOverdueExecution(row, now);
    state = normalizeState(row.state);
  }

  // Funding-failed / execution-failed campaigns enter the refund lifecycle.
  if (state === "expired" || state === "execution_failed") {
    await transitionState({
      row,
      to: "refunding",
      reason:
        state === "expired"
          ? "Deadline passed below goal"
          : "Execution failed - starting refunds",
      publicEventKey: "refunding",
      eventName: "refund_started",
    });
    state = normalizeState(row.state);
  }

  if (state === "refunding") {
    await processFailureRefunds(row);
  }
}

/** live -> funded (goal reached) or live -> expired (deadline). */
async function maybeAdvanceFunding(
  row: CampaignRow,
  now: number,
): Promise<void> {
  const summary = await getLedgerSummary(row.id);
  const next = dueFundingTransition(
    row.state,
    summary.deposited,
    row.goal_lamports,
    row.deadline_at,
    now,
  );
  if (!next) return;
  await transitionState({
    row,
    to: next,
    reason:
      next === "funded"
        ? `Goal reached: ${summary.deposited} / ${row.goal_lamports} lamports`
        : `Deadline passed below goal: ${summary.deposited} / ${row.goal_lamports} lamports`,
    publicEventKey: next === "funded" ? "funded" : "expired",
    eventName: next === "funded" ? "campaign_funded" : "campaign_expired",
  });
}

/** funded -> awaiting_execution: queue for fulfillment and set the SLA deadline. */
async function enterFulfillmentQueue(
  row: CampaignRow,
  now: number,
): Promise<void> {
  const deadline = now + (row.fulfillment_sla_seconds || 24 * 3600);
  await transitionState({
    row,
    to: "awaiting_execution",
    reason: `Queued for ${row.execution_mode} fulfillment`,
    publicEventKey: "fulfillment_queued",
    eventName: "fulfillment_queued",
    extraSets: {
      execution_status: "queued",
      execution_deadline_at: deadline,
    },
  });
}

/** awaiting_execution/executing -> execution_failed when the SLA is exceeded. */
async function maybeFailOverdueExecution(
  row: CampaignRow,
  now: number,
): Promise<void> {
  if (isRefundLocked(row.state)) return;
  if (!row.execution_deadline_at || now < row.execution_deadline_at) return;
  await transitionState({
    row,
    to: "execution_failed",
    reason: "Fulfillment SLA exceeded",
    publicEventKey: "execution_failed",
    eventName: "execution_failed",
    extraSets: {
      execution_status: "failed",
      execution_failure_reason: "Fulfillment SLA exceeded",
    },
  });
  await recordCampaignEvent({
    campaignId: row.id,
    publicId: row.public_id,
    event: "execution_sla_breached",
    result: "error",
    detail: "Fulfillment deadline passed - campaign moved to refund lifecycle.",
  });
}

/** Emit any funding milestone events newly crossed (idempotent per event_key). */
async function emitMilestones(
  row: CampaignRow,
  beforeDeposited: number,
  afterDeposited: number,
): Promise<void> {
  if (row.goal_lamports <= 0) return;
  const crossed = milestonesCrossed(
    beforeDeposited / row.goal_lamports,
    afterDeposited / row.goal_lamports,
  );
  for (const m of crossed) {
    const key = `milestone_${m}`;
    // campaign_events has UNIQUE(campaign_id, event_key) - idempotent.
    const inserted = await dbGet<{ id: number }>(
      `INSERT INTO campaign_events (campaign_id, event_key, created_at)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`,
      [row.id, key, Math.floor(Date.now() / 1000)],
    );
    if (inserted) {
      await recordCampaignEvent({
        campaignId: row.id,
        publicId: row.public_id,
        event: "milestone_reached",
        detail: `${m}% funded`,
      });
    }
  }
}

/**
 * Send owed refunds for a FAILED campaign; mark refunded when all safe refunds
 * are done. Only refunds contributions whose sending wallet is safe
 * (refund_risk = 'ok'); exchange/program/unknown senders are left for admin
 * review so we never blindly refund to an address the contributor cannot
 * control. Assumes the caller holds the campaign lock (called from sweepOne or
 * an admin retry), which makes refunds exactly-once across workers/instances.
 */
async function processFailureRefunds(row: CampaignRow): Promise<void> {
  const contributions = await dbAll<
    ContributionLike & { refund_sig: string | null; refund_risk: string }
  >(
    `SELECT id, contributor, lamports, refunded, refund_sig, refund_risk
       FROM campaign_contributions
      WHERE campaign_id = $1 AND refunded = FALSE AND refund_risk = 'ok'
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
        operationKey: operationKey({
          kind: "refund",
          campaignId: row.id,
          purpose: "failure",
          contributionId: refund.contributionId,
        }),
        contributionId: refund.contributionId,
        note: "Campaign failed - automatic full refund (network fee only)",
      });
      await dbRun(
        `UPDATE campaign_contributions
            SET refunded = TRUE, refund_sig = $2 WHERE id = $1`,
        [refund.contributionId, sig],
      );
      await recordCampaignEvent({
        campaignId: row.id,
        publicId: row.public_id,
        event: "refund_sent",
        wallet: refund.destination,
        txSignature: sig,
        lamports: refund.lamports,
      });
    } catch (e) {
      logger.warn(
        { err: e, publicId: row.public_id, contributionId: refund.contributionId },
        "Refund send failed - will retry next sweep",
      );
      return; // retry remaining refunds next sweep
    }
  }

  // Outstanding = anything above the network fee still owed, INCLUDING risky
  // senders that were deliberately not auto-refunded. Dust at or below the
  // network fee cannot be refunded (the fee would consume it); it is recorded in
  // the ledger and reported as unrefundable, never silently claimed as refunded.
  const owed = await dbGet<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM campaign_contributions
      WHERE campaign_id = $1 AND refunded = FALSE
        AND lamports > 5000`,
    [row.id],
  );
  if ((owed?.n ?? 0) === 0 && canTransition(row.state, "refunded")) {
    await transitionState({
      row,
      to: "refunded",
      reason: "All refundable contributions returned",
      publicEventKey: "refunded",
      eventName: "refund_completed",
    });
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
  /** Actor label + correlation id for the money-event trail. */
  actor?: string;
  correlationId?: string | null;
}): Promise<{ ok: true; alreadySettled?: boolean } | { ok: false; error: string }> {
  await ensureCampaignSchema();
  const head = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [opts.publicId],
  );
  if (!head) return { ok: false, error: "Campaign not found" };
  if (!opts.fulfillmentNote.trim()) {
    return { ok: false, error: "Fulfillment proof note is required" };
  }

  // Everything below runs under the campaign lock: settlement is exactly-once
  // across double-clicks, retries, worker overlap, and multiple API instances.
  return withCampaignLock(head.id, async () => {
    const row = await dbGet<CampaignRow>(
      `SELECT * FROM campaigns WHERE id = $1`,
      [head.id],
    );
    if (!row) return { ok: false, error: "Campaign not found" };
    const cur = normalizeState(row.state);
    // Idempotent: a completed settlement returns success rather than re-running.
    if (cur === "completed") {
      return { ok: true, alreadySettled: true };
    }
    // Never execute once refunds have started (permanent block).
    if (isRefundLocked(cur)) {
      return { ok: false, error: `Cannot settle a ${cur} campaign - refunds already started` };
    }
    if (cur !== "funded" && cur !== "awaiting_execution" && cur !== "executing") {
      return { ok: false, error: `Cannot settle a ${cur} campaign` };
    }

    await recordCampaignEvent({
      campaignId: row.id,
      publicId: row.public_id,
      event: "settlement_started",
      actor: opts.actor ?? "admin",
      correlationId: opts.correlationId ?? null,
    });

    // Drive the execution sub-flow: funded -> awaiting_execution -> executing.
    if (normalizeState(row.state) === "funded") {
      await enterFulfillmentQueue(row, Math.floor(Date.now() / 1000));
    }
    if (normalizeState(row.state) === "awaiting_execution") {
      await transitionState({
        row,
        to: "executing",
        actor: opts.actor ?? "admin",
        reason: "Operator fulfillment started",
        publicEventKey: "executing",
        eventName: "execution_started",
        correlationId: opts.correlationId ?? null,
        extraSets: { execution_status: "executing" },
      });
    }

    // Catch any last-minute deposits before splitting funds.
    await sweepDeposits(row.id, row.public_id, row.escrow_address);
    const summary = await getLedgerSummary(row.id);
    const plan = planSettlement(summary.deposited, row.goal_lamports, FEE_BPS);
    const dest = resolveSettlementDestinations(plan, Boolean(FEE_DESTINATION));

    // ── Payout (exactly-once: skip if a payout row already exists) ──
    const payoutDone = await dbGet<{ id: number }>(
      `SELECT id FROM campaign_ledger
        WHERE campaign_id = $1 AND kind = 'payout' LIMIT 1`,
      [row.id],
    );
    if (!payoutDone) {
      const sig = await sendFromEscrow({
        campaignId: row.id,
        publicId: row.public_id,
        kind: "payout",
        destination: opts.payoutDestination,
        lamports: dest.payoutLamports,
        operationKey: operationKey({ kind: "payout", campaignId: row.id, purpose: "payout" }),
        correlationId: opts.correlationId ?? null,
        note: opts.fulfillmentNote.trim(),
      });
      await recordCampaignEvent({
        campaignId: row.id,
        publicId: row.public_id,
        event: "settlement_payout",
        actor: opts.actor ?? "admin",
        wallet: opts.payoutDestination,
        txSignature: sig,
        lamports: dest.payoutLamports,
        correlationId: opts.correlationId ?? null,
      });
    }

    // ── Platform fee (exactly-once: skip if a platform-fee row exists) ──
    if (dest.feeLamports > 0 && FEE_DESTINATION) {
      const feeDone = await dbGet<{ id: number }>(
        `SELECT id FROM campaign_ledger
          WHERE campaign_id = $1 AND kind = 'fee' AND counterparty = $2
            AND note LIKE 'Platform fee%' LIMIT 1`,
        [row.id, FEE_DESTINATION],
      );
      if (!feeDone) {
        const sig = await sendFromEscrow({
          campaignId: row.id,
          publicId: row.public_id,
          kind: "fee",
          destination: FEE_DESTINATION,
          lamports: dest.feeLamports,
          operationKey: operationKey({ kind: "fee", campaignId: row.id, purpose: "platform_fee" }),
          correlationId: opts.correlationId ?? null,
          note: `Platform fee (${FEE_BPS} bps of goal)`,
        });
        await recordCampaignEvent({
          campaignId: row.id,
          publicId: row.public_id,
          event: "settlement_fee",
          actor: opts.actor ?? "admin",
          wallet: FEE_DESTINATION,
          txSignature: sig,
          lamports: dest.feeLamports,
          correlationId: opts.correlationId ?? null,
        });
      }
    }

    // ── Overfunding returned pro-rata (exactly-once per contributor) ──
    if (dest.excessLamports > 0) {
      const contributions = await dbAll<ContributionLike>(
        `SELECT id, contributor, lamports, refunded
           FROM campaign_contributions WHERE campaign_id = $1`,
        [row.id],
      );
      for (const refund of planExcessRefunds(
        contributions,
        dest.excessLamports,
      )) {
        const already = await dbGet<{ id: number }>(
          `SELECT id FROM campaign_ledger
            WHERE campaign_id = $1 AND kind = 'refund' AND counterparty = $2
              AND note LIKE 'Overfunding%' LIMIT 1`,
          [row.id, refund.destination],
        );
        if (already) continue;
        try {
          const sig = await sendFromEscrow({
            campaignId: row.id,
            publicId: row.public_id,
            kind: "refund",
            destination: refund.destination,
            lamports: refund.lamports,
            operationKey: operationKey({
              kind: "refund",
              campaignId: row.id,
              purpose: "excess",
              contributionId: refund.contributionId,
            }),
            contributionId: refund.contributionId,
            correlationId: opts.correlationId ?? null,
            note: "Overfunding returned pro-rata",
          });
          await recordCampaignEvent({
            campaignId: row.id,
            publicId: row.public_id,
            event: "settlement_excess_refund",
            wallet: refund.destination,
            txSignature: sig,
            lamports: refund.lamports,
            correlationId: opts.correlationId ?? null,
          });
        } catch (e) {
          logger.warn(
            { err: e, publicId: row.public_id },
            "Excess refund failed - continuing settlement",
          );
        }
      }
    }

    const nowTs = Math.floor(Date.now() / 1000);
    await dbRun(
      `UPDATE campaigns
          SET fulfillment_note = $2, fulfillment_url = $3,
              execution_status = 'completed', execution_completed_at = $4,
              proof_type = $5, proof_value = $6
        WHERE id = $1`,
      [
        row.id,
        opts.fulfillmentNote.trim(),
        opts.fulfillmentUrl ?? null,
        nowTs,
        opts.fulfillmentUrl ? "url" : "note",
        opts.fulfillmentUrl ?? opts.fulfillmentNote.trim(),
      ],
    );
    await transitionState({
      row,
      to: "completed",
      actor: opts.actor ?? "admin",
      reason: "Fulfillment proof recorded",
      publicEventKey: "completed",
      eventName: "settlement_completed",
      correlationId: opts.correlationId ?? null,
    });
    await recordEvent(row.public_id, "proof_published");
    logger.info({ publicId: row.public_id }, "Campaign settled");
    return { ok: true };
  });
}

// ── Reconciliation ───────────────────────────────────────────────────────────

export interface CampaignReconciliation {
  publicId: string;
  state: LifecycleState;
  report: ReconReport;
  onChainBalance: number;
  ledgerRemaining: number;
  depositedLamports: number;
  unresolvedDepositFailures: number;
  outstandingRefunds: number;
}

/**
 * Read-only reconciliation of one campaign: compares the ledger against the
 * on-chain balance and outstanding obligations and classifies severity. Does
 * NOT auto-fix (the escrow invariant already freezes on a critical breach);
 * this only surfaces the state for admin review.
 */
export async function getCampaignReconciliation(
  publicId: string,
): Promise<CampaignReconciliation | null> {
  await ensureCampaignSchema();
  const row = await dbGet<CampaignRow>(
    `SELECT * FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!row) return null;
  return reconcileRow(row);
}

async function reconcileRow(row: CampaignRow): Promise<CampaignReconciliation> {
  const [summary, balance, failures, outstanding] = await Promise.all([
    getLedgerSummary(row.id),
    getEscrowBalance(row.escrow_address).catch(() => 0),
    dbGet<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM campaign_deposit_failures
        WHERE campaign_id = $1 AND resolved = FALSE`,
      [row.id],
    ),
    dbGet<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM campaign_contributions
        WHERE campaign_id = $1 AND refunded = FALSE AND lamports > 5000`,
      [row.id],
    ),
  ]);
  const inRefundLifecycle = ["expired", "execution_failed", "refunding"].includes(
    normalizeState(row.state),
  );
  const report = computeReconciliation({
    state: row.state,
    ledgerRemaining: summary.remaining,
    onChainBalance: balance,
    unresolvedDepositFailures: failures?.n ?? 0,
    outstandingRefunds: inRefundLifecycle ? (outstanding?.n ?? 0) : 0,
  });
  return {
    publicId: row.public_id,
    state: row.state,
    report,
    onChainBalance: balance,
    ledgerRemaining: summary.remaining,
    depositedLamports: summary.deposited,
    unresolvedDepositFailures: failures?.n ?? 0,
    outstandingRefunds: outstanding?.n ?? 0,
  };
}

export interface CampaignHealthRow {
  publicId: string;
  title: string;
  state: LifecycleState;
  goalLamports: number;
  depositedLamports: number;
  onChainBalance: number;
  ledgerRemaining: number;
  balanceDiff: number;
  severity: ReconReport["severity"];
  warnings: string[];
  contributorCount: number;
  unresolvedDepositFailures: number;
  outstandingRefunds: number;
  createdAt: number;
  deadlineAt: number;
}

/**
 * Admin dashboard feed: every campaign with live escrow-vs-ledger health.
 * Balances are fetched concurrently; capped to keep the call bounded.
 */
export async function listCampaignHealth(
  stateFilter?: string,
): Promise<CampaignHealthRow[]> {
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
  return Promise.all(
    rows.map(async (row) => {
      const [recon, contrib] = await Promise.all([
        reconcileRow(row),
        dbGet<{ n: number }>(
          `SELECT COUNT(DISTINCT contributor)::int AS n
             FROM campaign_contributions WHERE campaign_id = $1`,
          [row.id],
        ),
      ]);
      return {
        publicId: row.public_id,
        title: row.title,
        state: row.state,
        goalLamports: row.goal_lamports,
        depositedLamports: recon.depositedLamports,
        onChainBalance: recon.onChainBalance,
        ledgerRemaining: recon.ledgerRemaining,
        balanceDiff: recon.report.balanceDiff,
        severity: recon.report.severity,
        warnings: recon.report.warnings,
        contributorCount: contrib?.n ?? 0,
        unresolvedDepositFailures: recon.unresolvedDepositFailures,
        outstandingRefunds: recon.outstandingRefunds,
        createdAt: row.created_at,
        deadlineAt: row.deadline_at,
      };
    }),
  );
}

// ── Admin recovery operations ────────────────────────────────────────────────

type OpResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Force an immediate deposit sweep + lifecycle pass for one campaign. */
export async function sweepCampaignByPublicId(publicId: string): Promise<void> {
  await ensureCampaignSchema();
  if (!escrowConfigured()) return;
  const row = await dbGet<CampaignRow>(
    `SELECT * FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!row) return;
  await sweepOne(row);
}

/** Admin: re-run the deposit scan and return fresh reconciliation. */
export async function rescanCampaign(
  publicId: string,
  actor: string,
  correlationId?: string | null,
): Promise<OpResult<{ reconciliation: CampaignReconciliation }>> {
  await ensureCampaignSchema();
  const exists = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!exists) return { ok: false, error: "Campaign not found" };
  await sweepCampaignByPublicId(publicId);
  await recordCampaignEvent({
    campaignId: exists.id,
    publicId,
    event: "manual_rescan",
    actor,
    correlationId: correlationId ?? null,
  });
  const reconciliation = await getCampaignReconciliation(publicId);
  return { ok: true, reconciliation: reconciliation! };
}

/** Admin: retry outstanding automatic refunds on a failed campaign. */
export async function retryRefunds(
  publicId: string,
  actor: string,
  correlationId?: string | null,
): Promise<OpResult> {
  await ensureCampaignSchema();
  const head = await dbGet<{ id: number; state: string }>(
    `SELECT id, state FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!head) return { ok: false, error: "Campaign not found" };
  const hs = normalizeState(head.state);
  if (hs !== "refunding" && hs !== "expired" && hs !== "execution_failed") {
    return { ok: false, error: `Refunds only run on a failed/expired campaign (is ${hs})` };
  }
  await recordCampaignEvent({
    campaignId: head.id,
    publicId,
    event: "manual_retry_refunds",
    actor,
    correlationId: correlationId ?? null,
  });
  await withCampaignLock(head.id, async () => {
    const row = await dbGet<CampaignRow>(
      `SELECT * FROM campaigns WHERE id = $1`,
      [head.id],
    );
    if (!row) return;
    const s = normalizeState(row.state);
    if (s === "expired" || s === "execution_failed") {
      await transitionState({
        row,
        to: "refunding",
        actor,
        reason: "Admin started refunds",
        publicEventKey: "refunding",
        eventName: "refund_started",
        correlationId: correlationId ?? null,
      });
    }
    if (normalizeState(row.state) === "refunding") await processFailureRefunds(row);
  });
  return { ok: true };
}

/**
 * Admin: retry a stuck settlement. Reconstructs the payout destination and
 * proof note from the existing payout ledger row when a prior attempt partially
 * completed, then re-runs the idempotent settlement.
 */
export async function retrySettlement(
  publicId: string,
  actor: string,
  correlationId?: string | null,
): Promise<OpResult<{ alreadySettled?: boolean }>> {
  await ensureCampaignSchema();
  const row = await dbGet<CampaignRow>(
    `SELECT * FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!row) return { ok: false, error: "Campaign not found" };
  const rs = normalizeState(row.state);
  if (rs === "completed") return { ok: true, alreadySettled: true };
  if (isRefundLocked(rs)) {
    return { ok: false, error: `Cannot settle a ${rs} campaign - refunds already started` };
  }
  if (rs !== "funded" && rs !== "awaiting_execution" && rs !== "executing") {
    return { ok: false, error: `Cannot settle a ${rs} campaign` };
  }
  const payout = await dbGet<{ counterparty: string | null; note: string | null }>(
    `SELECT counterparty, note FROM campaign_ledger
      WHERE campaign_id = $1 AND kind = 'payout' LIMIT 1`,
    [row.id],
  );
  if (!payout?.counterparty || !payout.note) {
    return {
      ok: false,
      error:
        "No prior settlement to retry - use Settle with a payout destination and proof note",
    };
  }
  await recordCampaignEvent({
    campaignId: row.id,
    publicId,
    event: "manual_retry_settlement",
    actor,
    correlationId: correlationId ?? null,
  });
  return settleCampaign({
    publicId,
    payoutDestination: payout.counterparty,
    fulfillmentNote: payout.note,
    fulfillmentUrl: row.fulfillment_url,
    actor,
    correlationId: correlationId ?? null,
  });
}

/**
 * Admin: unfreeze a campaign after the underlying discrepancy is resolved.
 * Refuses while the escrow invariant is still breached, and restores the state
 * the campaign should now be in (live / funded / failed) from the ledger + clock.
 */
export async function unfreezeCampaign(
  publicId: string,
  actor: string,
  correlationId?: string | null,
): Promise<OpResult<{ state: LifecycleState }>> {
  await ensureCampaignSchema();
  const head = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!head) return { ok: false, error: "Campaign not found" };
  return withCampaignLock(head.id, async () => {
    const row = await dbGet<CampaignRow>(
      `SELECT * FROM campaigns WHERE id = $1`,
      [head.id],
    );
    if (!row) return { ok: false, error: "Campaign not found" };
    if (row.state !== "frozen") {
      return { ok: false, error: `Campaign is not frozen (is ${row.state})` };
    }
    const summary = await getLedgerSummary(row.id);
    const balance = await getEscrowBalance(row.escrow_address).catch(() => 0);
    if (balance < summary.remaining) {
      return {
        ok: false,
        error: `Still unhealthy: escrow holds ${balance} lamports, ledger expects ${summary.remaining}. Resolve before unfreezing.`,
      };
    }
    const now = Math.floor(Date.now() / 1000);
    let restore: LifecycleState = "live";
    if (summary.deposited >= row.goal_lamports) {
      restore = "funded";
    } else if (now >= row.deadline_at) {
      restore = "expired";
    }
    if (!canTransition("frozen", restore)) {
      return { ok: false, error: `Cannot restore to ${restore}` };
    }
    await dbRun(
      `UPDATE campaigns SET state = $2, frozen_reason = NULL
        WHERE id = $1 AND state = 'frozen'`,
      [row.id, restore],
    );
    await recordCampaignEvent({
      campaignId: row.id,
      publicId,
      event: "campaign_unfrozen",
      actor,
      detail: `Restored to ${restore}`,
      correlationId: correlationId ?? null,
    });
    return { ok: true, state: restore };
  });
}

/** Reconciliation sweep for cron: log a warning event per unhealthy campaign. */
export async function runReconciliationSweep(): Promise<void> {
  await ensureCampaignSchema();
  if (!escrowConfigured()) return;
  const rows = await dbAll<CampaignRow>(
    `SELECT * FROM campaigns
      WHERE state IN ('live','funded','awaiting_execution','executing',
                      'expired','execution_failed','refunding','frozen','failed')`,
  );
  for (const row of rows) {
    try {
      const recon = await reconcileRow(row);
      if (recon.report.severity !== "ok") {
        await recordCampaignEvent({
          campaignId: row.id,
          publicId: row.public_id,
          event: "reconciliation_warning",
          result: recon.report.severity === "critical" ? "error" : "warning",
          detail: recon.report.warnings.join(" | ").slice(0, 900),
        });
      }
    } catch (e) {
      logger.warn(
        { err: e, publicId: row.public_id },
        "Reconciliation check failed",
      );
    }
  }
}

/** Configurable TTL for an unactivated campaign before it is cancelled. */
const ABANDON_ACTIVATION_SEC = Math.max(
  3600,
  Number(process.env["CAMPAIGN_ACTIVATION_TTL_SEC"] ?? 24 * 3600),
);

/**
 * Cancel campaigns that were created but never received a confirmed opening
 * contribution within the TTL. They are unpublished and hold no funds, so this
 * simply frees the creator's one-active slot. Idempotent.
 */
export async function expireAbandonedActivations(): Promise<number> {
  await ensureCampaignSchema();
  const cutoff = Math.floor(Date.now() / 1000) - ABANDON_ACTIVATION_SEC;
  const rows = await dbAll<CampaignRow>(
    `SELECT * FROM campaigns
      WHERE state = 'awaiting_initial_contribution' AND created_at < $1
      LIMIT 100`,
    [cutoff],
  );
  let cancelled = 0;
  for (const row of rows) {
    try {
      await withCampaignLock(row.id, async () => {
        const fresh = await dbGet<CampaignRow>(
          `SELECT * FROM campaigns WHERE id = $1`,
          [row.id],
        );
        if (!fresh || normalizeState(fresh.state) !== "awaiting_initial_contribution") {
          return;
        }
        await transitionState({
          row: fresh,
          to: "cancelled",
          actor: "system",
          reason: "Abandoned before opening contribution",
          eventName: "campaign_cancelled",
        });
        cancelled += 1;
      });
    } catch (e) {
      logger.warn({ err: e, publicId: row.public_id }, "Abandon-expiry failed");
    }
  }
  return cancelled;
}

/** Cron wrapper: reconcile durable outbound transfer intents that never recorded. */
export async function runTransferIntentReconciliation(): Promise<void> {
  await ensureCampaignSchema();
  if (!escrowConfigured()) return;
  await reconcileTransferIntents();
}

/** Admin: cancel a single abandoned pending-activation campaign now. */
export async function cancelPendingActivation(
  publicId: string,
  actor: string,
  correlationId?: string | null,
): Promise<OpResult> {
  await ensureCampaignSchema();
  const head = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!head) return { ok: false, error: "Campaign not found" };
  return withCampaignLock(head.id, async () => {
    const row = await dbGet<CampaignRow>(`SELECT * FROM campaigns WHERE id = $1`, [
      head.id,
    ]);
    if (!row) return { ok: false, error: "Campaign not found" };
    if (normalizeState(row.state) !== "awaiting_initial_contribution") {
      return { ok: false, error: `Only pending-activation campaigns can be expired (is ${row.state})` };
    }
    await transitionState({
      row,
      to: "cancelled",
      actor,
      reason: "Admin expired abandoned pending-activation campaign",
      eventName: "manual_expire_activation",
      correlationId: correlationId ?? null,
    });
    return { ok: true };
  });
}

/** Admin: list a campaign's durable outbound transfer intents. */
export async function getCampaignTransferIntents(publicId: string) {
  await ensureCampaignSchema();
  const id = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  if (!id) return null;
  return listCampaignIntents(id.id);
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
