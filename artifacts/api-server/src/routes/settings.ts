import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getFeatureFlags } from "../lib/featureFlags.js";

const router: IRouter = Router();

/**
 * Public read of the resolved feature flags so the trading UI can hide
 * capabilities an admin has switched off. Read-only; updates go through the
 * admin-gated POST /admin/feature-flags.
 */
router.get(
  "/feature-flags",
  asyncHandler(async (_req, res) => {
    return res.json({ flags: await getFeatureFlags() });
  }),
);

export default router;
