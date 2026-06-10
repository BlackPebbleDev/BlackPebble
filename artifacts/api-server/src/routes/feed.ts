import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sessionFromRequest } from "../lib/auth.js";
import { getActivity } from "../lib/feed.js";
import { getFollowedUserIds } from "../lib/profiles.js";

const router: IRouter = Router();

const X_REQUIRED = "Connect X to unlock BlackPebble social features";

/** Global feed: recent public activity from all X-authenticated users. */
router.get(
  "/feed/global",
  asyncHandler(async (_req, res) => {
    const items = await getActivity({ limit: 40 });
    return res.json({ items });
  }),
);

/** Following feed: activity from the users the signed-in X user follows. */
router.get(
  "/feed/following",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const followingUserIds = await getFollowedUserIds(Number(session.sub));
    const items = await getActivity({ followingUserIds, limit: 40 });
    return res.json({ items });
  }),
);

export default router;
