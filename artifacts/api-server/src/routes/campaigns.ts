import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../lib/asyncHandler.js";
import { logger } from "../lib/logger.js";
import { isAdmin, sessionFromRequest } from "../lib/auth.js";
import { getFeatureFlags } from "../lib/featureFlags.js";
import {
  FEE_BPS,
  activateCampaign,
  createCampaign,
  getCampaign,
  getCampaignLedger,
  getCampaignTimeline,
  listCampaigns,
  settleCampaign,
  submitPublicContribution,
  sweepCampaignByPublicId,
} from "../lib/campaign-engine.js";
import { escrowConfigured } from "../lib/campaign-escrow.js";
import { CAMPAIGN_TYPE_DEFS } from "../lib/campaign-math.js";
import { validateCampaignToken } from "../lib/campaign-token.js";
import { getSolPriceUsd } from "../lib/prices.js";

/**
 * Community Campaign Platform routes (Phase 1: goal campaigns).
 *
 * Reads are public - campaign accounting is public by design (the whole point
 * is a visible money trail). Creation requires an X session. Settlement is
 * admin-only (Phase 1 fulfillment is a human action with a receipt).
 */

const router: IRouter = Router();

const createLimiter = rateLimit({
  windowMs: 60_000,
  max: 3,
  message: { error: "Too many campaign requests, try again in a minute" },
  standardHeaders: true,
  legacyHeaders: false,
});

async function featureEnabled(): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags.community_campaigns;
}

/** GET /campaigns - browse (optional ?state= filter). */
router.get(
  "/campaigns",
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const state = typeof req.query.state === "string" ? req.query.state : "all";
    const campaigns = await listCampaigns(state);
    return res.json({ campaigns, escrowReady: escrowConfigured() });
  }),
);

/**
 * GET /campaigns/config - campaign type catalogue with preset goals and the
 * live SOL price, so the create flow can show exact SOL equivalents.
 * MUST be registered before /campaigns/:id.
 */
router.get(
  "/campaigns/config",
  asyncHandler(async (_req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const solPriceUsd = await getSolPriceUsd().catch(() => 0);
    return res.json({
      types: CAMPAIGN_TYPE_DEFS,
      solPriceUsd,
      escrowReady: escrowConfigured(),
      // Platform fee (bps of the goal, taken only at settlement) so the create
      // flow can disclose the exact fee up front.
      feeBps: FEE_BPS,
    });
  }),
);

/** GET /campaigns/validate-token/:mint - metadata + RugCheck safety scan. */
router.get(
  "/campaigns/validate-token/:mint",
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const mint = String(req.params.mint ?? "").trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      return res.status(400).json({ error: "Invalid token address" });
    }
    const token = await validateCampaignToken(mint);
    return res.json({ token });
  }),
);

/** GET /campaigns/:id - detail with live escrow accounting. */
router.get(
  "/campaigns/:id",
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const campaign = await getCampaign(String(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    return res.json({ campaign });
  }),
);

/** GET /campaigns/:id/ledger - the full public money trail. */
router.get(
  "/campaigns/:id/ledger",
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const ledger = await getCampaignLedger(String(req.params.id));
    if (!ledger) return res.status(404).json({ error: "Campaign not found" });
    return res.json({ ledger });
  }),
);

/** GET /campaigns/:id/timeline - public lifecycle timeline (real events). */
router.get(
  "/campaigns/:id/timeline",
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const timeline = await getCampaignTimeline(String(req.params.id));
    if (!timeline) return res.status(404).json({ error: "Campaign not found" });
    return res.json({ timeline });
  }),
);

/** POST /campaigns - create (X-authenticated users only). */
router.post(
  "/campaigns",
  createLimiter,
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const session = await sessionFromRequest(req);
    if (!session) {
      return res
        .status(401)
        .json({ error: "Sign in with X to create a campaign" });
    }

    const body = req.body ?? {};
    const correlationId = randomUUID();
    const result = await createCampaign({
      creatorUserId: Number(session.sub),
      typeKey: String(body.typeKey ?? ""),
      title: String(body.title ?? ""),
      brief: String(body.brief ?? ""),
      goalUsd: body.goalUsd != null ? Number(body.goalUsd) : null,
      goalSol: body.goalSol != null ? Number(body.goalSol) : null,
      durationSec: Math.round(Number(body.durationHours ?? 0) * 3600),
      tokenMint: body.tokenMint ? String(body.tokenMint) : null,
      imageUrl: body.imageUrl ? String(body.imageUrl) : null,
      bannerUrl: body.bannerUrl ? String(body.bannerUrl) : null,
      linkUrl: body.linkUrl ? String(body.linkUrl) : null,
    });
    if (!result.ok) {
      logger.warn(
        { correlationId, code: result.error.code, stage: result.error.stage },
        "Campaign creation failed",
      );
      return res
        .status(result.error.httpStatus)
        .json(result.error.toResponse(correlationId));
    }
    return res.json({ campaign: result.campaign });
  }),
);

/**
 * POST /campaigns/:id/activate - creator confirms the opening contribution.
 * The campaign only becomes publicly live after this transaction verifies.
 */
router.post(
  "/campaigns/:id/activate",
  createLimiter,
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const session = await sessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: "Sign in with X to activate" });
    }
    const body = req.body ?? {};
    const correlationId = randomUUID();
    const result = await activateCampaign({
      publicId: String(req.params.id),
      creatorUserId: Number(session.sub),
      creatorWallet: String(body.senderWallet ?? ""),
      txSignature: String(body.txSignature ?? ""),
    });
    if (!result.ok) {
      return res
        .status(result.error.httpStatus)
        .json(result.error.toResponse(correlationId));
    }
    return res.json({ campaign: result.campaign });
  }),
);

/**
 * POST /campaigns/:id/contribute - public contributor submits a signed transfer
 * signature for on-chain verification. No BlackPebble account required.
 */
router.post(
  "/campaigns/:id/contribute",
  createLimiter,
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const body = req.body ?? {};
    const correlationId = randomUUID();
    const result = await submitPublicContribution({
      publicId: String(req.params.id),
      txSignature: String(body.txSignature ?? ""),
    });
    if (!result.ok) {
      return res
        .status(result.error.httpStatus)
        .json(result.error.toResponse(correlationId));
    }
    return res.json({ campaign: result.campaign, credited: result.credited });
  }),
);

/**
 * POST /campaigns/:id/refresh - trigger a deposit sweep now instead of
 * waiting for the cron pass (rate limited via the shared limiter).
 */
router.post(
  "/campaigns/:id/refresh",
  createLimiter,
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    // Targeted single-campaign sweep (locked) instead of an all-campaign pass.
    await sweepCampaignByPublicId(String(req.params.id));
    const campaign = await getCampaign(String(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    return res.json({ campaign });
  }),
);

/** POST /campaigns/:id/settle - admin fulfillment with receipt. */
router.post(
  "/campaigns/:id/settle",
  asyncHandler(async (req, res) => {
    if (!(await featureEnabled())) {
      return res.status(404).json({ error: "Feature not enabled" });
    }
    const session = await sessionFromRequest(req);
    if (!isAdmin(session)) {
      return res.status(session ? 403 : 401).json({ error: "Unauthorized" });
    }
    const body = req.body ?? {};
    const correlationId = randomUUID();
    const result = await settleCampaign({
      publicId: String(req.params.id),
      payoutDestination: String(body.payoutDestination ?? ""),
      fulfillmentNote: String(body.fulfillmentNote ?? ""),
      fulfillmentUrl: body.fulfillmentUrl ? String(body.fulfillmentUrl) : null,
      actor: session?.x_username ? `@${session.x_username}` : "admin",
      correlationId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, correlationId });
  }),
);

export default router;
