import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sessionFromRequest } from "../lib/auth.js";
import { getActivity } from "../lib/feed.js";
import { getFollowedUserIds } from "../lib/profiles.js";
import { isReactionKey, setReaction } from "../lib/feed-service.js";

const router: IRouter = Router();

const X_REQUIRED = "Connect X to unlock BlackPebble social features";

/** Parse the optional ?kinds=spot,leverage filter (validated in lib/feed). */
function parseKinds(raw: unknown): string[] | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function parseLimit(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** Global feed: recent public activity from all X-authenticated users. */
router.get(
  "/feed/global",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req).catch(() => null);
    const items = await getActivity({
      kinds: parseKinds(req.query.kinds),
      limit: parseLimit(req.query.limit) ?? 40,
      viewerUserId: session ? Number(session.sub) : null,
    });
    return res.json({ items });
  }),
);

/** Following feed: activity from the users the signed-in X user follows. */
router.get(
  "/feed/following",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const viewerUserId = Number(session.sub);
    const followingUserIds = await getFollowedUserIds(viewerUserId);
    const items = await getActivity({
      followingUserIds,
      kinds: parseKinds(req.query.kinds),
      limit: parseLimit(req.query.limit) ?? 40,
      viewerUserId,
    });
    return res.json({ items });
  }),
);

/** My Activity: the viewer's own timeline, including private milestones. */
router.get(
  "/feed/mine",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const viewerUserId = Number(session.sub);
    const items = await getActivity({
      mineUserId: viewerUserId,
      kinds: parseKinds(req.query.kinds),
      limit: parseLimit(req.query.limit) ?? 40,
      viewerUserId,
    });
    return res.json({ items });
  }),
);

/**
 * React to a feed item. Body: { eventId, reaction } where reaction is one of
 * the REACTION_KEYS, or null to clear. One reaction per user per event.
 */
router.post(
  "/feed/react",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const eventId = String(req.body?.eventId ?? "").trim();
    if (!eventId || eventId.length > 120) {
      return res.status(400).json({ error: "Invalid eventId" });
    }
    const raw = req.body?.reaction;
    let reaction: Parameters<typeof setReaction>[2];
    if (raw == null) {
      reaction = null;
    } else if (typeof raw === "string" && isReactionKey(raw)) {
      reaction = raw;
    } else {
      return res.status(400).json({ error: "Invalid reaction" });
    }
    await setReaction(eventId, Number(session.sub), reaction);
    return res.json({ ok: true });
  }),
);

export default router;
