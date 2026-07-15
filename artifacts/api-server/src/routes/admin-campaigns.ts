import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAdmin } from "../lib/auth.js";
import { dbGet } from "../lib/database.js";
import { recordAdminAction, adminFromReq } from "../lib/adminAudit.js";
import {
  cancelPendingActivation,
  getCampaign,
  getCampaignReconciliation,
  getCampaignTransferIntents,
  listCampaignHealth,
  rescanCampaign,
  retryRefunds,
  retrySettlement,
  unfreezeCampaign,
} from "../lib/campaign-engine.js";
import { listCampaignAudit } from "../lib/campaign-audit.js";

/**
 * Admin campaign recovery + diagnostics. Every mutating action is serialized by
 * the per-campaign advisory lock inside the engine and recorded in BOTH the
 * admin audit log (operator trail) and the campaign audit log (money trail).
 *
 * Gated by requireAdmin only (not the feature flag) so operators can always
 * inspect and recover campaigns even while the public feature is disabled.
 */
const router: IRouter = Router();

router.use("/admin/campaigns", requireAdmin);

async function campaignIdOf(publicId: string): Promise<number | null> {
  const row = await dbGet<{ id: number }>(
    `SELECT id FROM campaigns WHERE public_id = $1`,
    [publicId],
  );
  return row?.id ?? null;
}

/** GET /admin/campaigns - health dashboard (escrow vs ledger for every campaign). */
router.get(
  "/admin/campaigns",
  asyncHandler(async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "all";
    const campaigns = await listCampaignHealth(state);
    return res.json({ campaigns });
  }),
);

/** GET /admin/campaigns/:id - deep diagnostics for one campaign. */
router.get(
  "/admin/campaigns/:id",
  asyncHandler(async (req, res) => {
    const publicId = String(req.params.id);
    const [campaign, reconciliation, intents, audit] = await Promise.all([
      getCampaign(publicId),
      getCampaignReconciliation(publicId),
      getCampaignTransferIntents(publicId),
      (async () => {
        const id = await campaignIdOf(publicId);
        return id != null
          ? listCampaignAudit({ campaignId: id, limit: 100 })
          : [];
      })(),
    ]);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    return res.json({ campaign, reconciliation, intents: intents ?? [], audit });
  }),
);

/** GET /admin/campaigns/:id/intents - durable outbound transfer intents. */
router.get(
  "/admin/campaigns/:id/intents",
  asyncHandler(async (req, res) => {
    const intents = await getCampaignTransferIntents(String(req.params.id));
    if (intents == null) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    return res.json({ intents });
  }),
);

/** POST /admin/campaigns/:id/expire-activation - cancel an abandoned pending campaign. */
router.post(
  "/admin/campaigns/:id/expire-activation",
  asyncHandler(async (req, res) => {
    const publicId = String(req.params.id);
    const correlationId = randomUUID();
    const admin = adminFromReq(req);
    const actor = admin?.x_username ? `@${admin.x_username}` : "admin";
    const result = await cancelPendingActivation(publicId, actor, correlationId);
    await recordAdminAction({
      admin,
      action: "campaign_expire_activation",
      targetType: "campaign",
      targetId: publicId,
      success: result.ok,
      error: result.ok ? null : result.error,
      correlationId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, correlationId });
  }),
);

/** GET /admin/campaigns/:id/audit - the money-event trail for one campaign. */
router.get(
  "/admin/campaigns/:id/audit",
  asyncHandler(async (req, res) => {
    const id = await campaignIdOf(String(req.params.id));
    if (id == null) return res.status(404).json({ error: "Campaign not found" });
    const audit = await listCampaignAudit({ campaignId: id, limit: 200 });
    return res.json({ audit });
  }),
);

/** POST /admin/campaigns/:id/reconcile - fresh read-only reconciliation. */
router.post(
  "/admin/campaigns/:id/reconcile",
  asyncHandler(async (req, res) => {
    const reconciliation = await getCampaignReconciliation(String(req.params.id));
    if (!reconciliation) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    return res.json({ reconciliation });
  }),
);

/** POST /admin/campaigns/:id/rescan - re-run the deposit scan. */
router.post(
  "/admin/campaigns/:id/rescan",
  asyncHandler(async (req, res) => {
    const publicId = String(req.params.id);
    const correlationId = randomUUID();
    const admin = adminFromReq(req);
    const actor = admin?.x_username ? `@${admin.x_username}` : "admin";
    const result = await rescanCampaign(publicId, actor, correlationId);
    await recordAdminAction({
      admin,
      action: "campaign_rescan",
      targetType: "campaign",
      targetId: publicId,
      success: result.ok,
      error: result.ok ? null : result.error,
      correlationId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ reconciliation: result.reconciliation, correlationId });
  }),
);

/** POST /admin/campaigns/:id/retry-settlement - resume a stuck settlement. */
router.post(
  "/admin/campaigns/:id/retry-settlement",
  asyncHandler(async (req, res) => {
    const publicId = String(req.params.id);
    const correlationId = randomUUID();
    const admin = adminFromReq(req);
    const actor = admin?.x_username ? `@${admin.x_username}` : "admin";
    const result = await retrySettlement(publicId, actor, correlationId);
    await recordAdminAction({
      admin,
      action: "campaign_retry_settlement",
      targetType: "campaign",
      targetId: publicId,
      success: result.ok,
      error: result.ok ? null : result.error,
      correlationId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, correlationId });
  }),
);

/** POST /admin/campaigns/:id/retry-refunds - retry outstanding refunds. */
router.post(
  "/admin/campaigns/:id/retry-refunds",
  asyncHandler(async (req, res) => {
    const publicId = String(req.params.id);
    const correlationId = randomUUID();
    const admin = adminFromReq(req);
    const actor = admin?.x_username ? `@${admin.x_username}` : "admin";
    const result = await retryRefunds(publicId, actor, correlationId);
    await recordAdminAction({
      admin,
      action: "campaign_retry_refunds",
      targetType: "campaign",
      targetId: publicId,
      success: result.ok,
      error: result.ok ? null : result.error,
      correlationId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, correlationId });
  }),
);

/** POST /admin/campaigns/:id/unfreeze - restore a frozen campaign. */
router.post(
  "/admin/campaigns/:id/unfreeze",
  asyncHandler(async (req, res) => {
    const publicId = String(req.params.id);
    const correlationId = randomUUID();
    const admin = adminFromReq(req);
    const actor = admin?.x_username ? `@${admin.x_username}` : "admin";
    const before = await getCampaign(publicId);
    const result = await unfreezeCampaign(publicId, actor, correlationId);
    await recordAdminAction({
      admin,
      action: "campaign_unfreeze",
      targetType: "campaign",
      targetId: publicId,
      success: result.ok,
      error: result.ok ? null : result.error,
      before: before ? { state: before.state } : null,
      after: result.ok ? { state: result.state } : null,
      correlationId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, state: result.state, correlationId });
  }),
);

export default router;
