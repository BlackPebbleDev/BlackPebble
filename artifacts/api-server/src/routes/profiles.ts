import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sessionFromRequest } from "../lib/auth.js";
import {
  followUser,
  getProfile,
  listFollowers,
  listFollowing,
  unfollowUser,
} from "../lib/profiles.js";

const router: IRouter = Router();

const X_REQUIRED = "Connect X to unlock BlackPebble social features";

/**
 * Public profile (X-authenticated users only). `:id` is polymorphic: a numeric
 * internal user id or an X handle (so the frontend /u/:handle route maps
 * cleanly). Guests/wallet-only users have no profile → 404.
 */
router.get(
  "/profiles/:id",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    const viewerId =
      session?.x_id && session.sub ? Number(session.sub) : null;
    const profile = await getProfile(String(req.params.id), viewerId);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    return res.json(profile);
  }),
);

router.post(
  "/profiles/:id/follow",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const result = await followUser(Number(session.sub), String(req.params.id));
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ ok: true });
  }),
);

router.delete(
  "/profiles/:id/follow",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const result = await unfollowUser(
      Number(session.sub),
      String(req.params.id),
    );
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ ok: true });
  }),
);

router.get(
  "/profiles/:id/followers",
  asyncHandler(async (req, res) => {
    const users = await listFollowers(String(req.params.id));
    if (users === null) {
      return res.status(404).json({ error: "Profile not found" });
    }
    return res.json({ users });
  }),
);

router.get(
  "/profiles/:id/following",
  asyncHandler(async (req, res) => {
    const users = await listFollowing(String(req.params.id));
    if (users === null) {
      return res.status(404).json({ error: "Profile not found" });
    }
    return res.json({ users });
  }),
);

export default router;
