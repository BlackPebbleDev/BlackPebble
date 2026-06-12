import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sessionFromRequest } from "../lib/auth.js";
import {
  addCalloutUpdate,
  createCallout,
  followUser,
  getCalloutById,
  getCalloutUpdates,
  getProfile,
  getUserCallouts,
  listFollowers,
  listFollowing,
  resolveUser,
  setBio,
  unfollowUser,
  type Callout,
  type Conviction,
} from "../lib/profiles.js";
import { getExecutionPrice, getTokenInfo } from "../lib/prices.js";
import { getCallerStats } from "../lib/callers.js";
import {
  getTokenPeaks,
  recordTokenPeaks,
  athMultipleFrom,
  type TokenPeak,
} from "../lib/peaks.js";

const router: IRouter = Router();

const X_REQUIRED = "Connect X to unlock BlackPebble social features";
const THESIS_MAX = 500;
const UPDATE_MAX = 500;
const CONVICTIONS: Conviction[] = ["low", "medium", "high"];

/**
 * Live result for a callout: current price/MC and the % move since the call.
 * Null when no fresh price is available right now (graceful degradation).
 */
async function calloutResult(
  c: Callout,
  peak: TokenPeak | undefined,
): Promise<{
  currentPriceUsd: number;
  currentMarketCapUsd: number | null;
  pnlPercent: number | null;
  currentMultiple: number | null;
  athMultiple: number | null;
} | null> {
  const px = await getExecutionPrice(c.token_mint);
  if (!px) return null;
  const hasCallPrice = c.call_price_usd != null && c.call_price_usd > 0;
  const pnlPercent = hasCallPrice
    ? ((px.priceUsd - (c.call_price_usd as number)) /
        (c.call_price_usd as number)) *
      100
    : null;
  const currentMultiple = hasCallPrice
    ? px.priceUsd / (c.call_price_usd as number)
    : null;
  // ATH is read from a pre-fetched peak snapshot (batched by the caller) and
  // clamped to >= currentMultiple, so the live observation is always reflected
  // even before this request's sample is folded back into the high-water mark.
  return {
    currentPriceUsd: px.priceUsd,
    currentMarketCapUsd: px.marketCapUsd,
    pnlPercent,
    currentMultiple,
    athMultiple: athMultipleFrom(peak, c.call_price_usd, currentMultiple),
  };
}

/**
 * Owner-only bio update. The bio is keyed to the authenticated user's internal
 * id (session.sub); there is no path to edit another user's bio. Validation
 * (≤250 chars, plain text — no HTML/markdown) lives in setBio.
 *
 * Declared before the polymorphic `/profiles/:id` routes so "me" is never
 * interpreted as a profile handle.
 */
router.put(
  "/profiles/me/bio",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const result = await setBio(Number(session.sub), req.body?.bio);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ ok: true, bio: result.bio });
  }),
);

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

/**
 * Public, read-only call history for a profile, newest first. Each callout is an
 * immutable on-the-record entry; we attach its append-only update trail and a
 * live result (current price/MC + % move since the call). `:id` is a numeric
 * user id or an X handle.
 *
 * Declared before nothing order-sensitive (the path is distinct from
 * `/profiles/:id`), but ordered with the other reads for readability.
 */
router.get(
  "/profiles/:id/callouts",
  asyncHandler(async (req, res) => {
    const target = await resolveUser(String(req.params.id));
    if (!target) return res.status(404).json({ error: "Profile not found" });
    const callouts = await getUserCallouts(target.user_id);
    const mints = Array.from(new Set(callouts.map((c) => c.token_mint)));
    const peaks = await getTokenPeaks(mints);
    const enriched = await Promise.all(
      callouts.map(async (c) => ({
        ...c,
        updates: await getCalloutUpdates(c.id),
        result: await calloutResult(c, peaks.get(c.token_mint)),
      })),
    );
    // Fold this request's live observations back into the high-water mark once,
    // as a single batched upsert (avoids a per-callout read/write N+1).
    await recordTokenPeaks(
      enriched
        .filter((e) => e.result != null)
        .map((e) => ({
          mint: e.token_mint,
          priceUsd: e.result!.currentPriceUsd,
          marketCapUsd: e.result!.currentMarketCapUsd,
        })),
    );
    return res.json({ callouts: enriched });
  }),
);

/**
 * Caller reputation stats for a profile (calls made, avg/best multiple, hit
 * rate, caller score + rank). Read-only aggregation over the immutable callouts
 * table; returns null stats for users who have never called.
 */
router.get(
  "/profiles/:id/caller-stats",
  asyncHandler(async (req, res) => {
    const target = await resolveUser(String(req.params.id));
    if (!target) return res.status(404).json({ error: "Profile not found" });
    const stats = await getCallerStats(target.user_id);
    return res.json({ stats });
  }),
);

/**
 * Owner-only: create an immutable callout. The caller supplies the token + a
 * thesis; the server snapshots authoritative entry price / market cap /
 * liquidity from the live price source so the on-the-record entry can never be
 * back-dated or spoofed. There is intentionally NO edit or delete path.
 *
 * Declared before `/profiles/:id/*` matchers so "me" is never read as a handle.
 */
router.post(
  "/profiles/me/callouts",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });

    const tokenMint = String(req.body?.tokenMint ?? "").trim();
    if (!tokenMint) {
      return res.status(400).json({ error: "A token is required" });
    }
    const thesis = String(req.body?.thesis ?? "").trim();
    if (!thesis) {
      return res.status(400).json({ error: "A thesis is required" });
    }
    if (thesis.length > THESIS_MAX) {
      return res
        .status(400)
        .json({ error: `Thesis must be ${THESIS_MAX} characters or fewer` });
    }
    const convictionRaw = req.body?.conviction;
    let conviction: Conviction | null = null;
    if (convictionRaw != null && convictionRaw !== "") {
      if (!CONVICTIONS.includes(convictionRaw as Conviction)) {
        return res.status(400).json({ error: "Invalid conviction" });
      }
      conviction = convictionRaw as Conviction;
    }

    // Snapshot authoritative metadata + entry price server-side (never trust the
    // client for the on-the-record numbers).
    const [info, px] = await Promise.all([
      getTokenInfo(tokenMint),
      getExecutionPrice(tokenMint),
    ]);
    if (!info || !px) {
      return res.status(400).json({
        error: "Couldn't fetch a live price for this token. Try again shortly.",
      });
    }

    const callout = await createCallout({
      userId: Number(session.sub),
      tokenMint,
      tokenSymbol: info.symbol,
      tokenName: info.name,
      tokenLogo: info.logo,
      callPriceSol: px.priceSol,
      callPriceUsd: px.priceUsd,
      callMarketCap: px.marketCapUsd,
      liquidityUsd: px.liquidityUsd,
      thesis,
      conviction,
    });
    return res.status(201).json({ callout });
  }),
);

/**
 * Owner-only: append a follow-up note to one of the caller's own callouts. This
 * never mutates the original callout — updates are a separate append-only trail.
 */
router.post(
  "/callouts/:id/updates",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });

    const calloutId = Number(req.params.id);
    if (!Number.isInteger(calloutId) || calloutId <= 0) {
      return res.status(400).json({ error: "Invalid callout" });
    }
    const callout = await getCalloutById(calloutId);
    if (!callout) return res.status(404).json({ error: "Callout not found" });
    if (callout.user_id !== Number(session.sub)) {
      return res
        .status(403)
        .json({ error: "You can only update your own calls" });
    }

    const content = String(req.body?.content ?? "").trim();
    if (!content) {
      return res.status(400).json({ error: "An update is required" });
    }
    if (content.length > UPDATE_MAX) {
      return res
        .status(400)
        .json({ error: `Update must be ${UPDATE_MAX} characters or fewer` });
    }

    const update = await addCalloutUpdate(
      calloutId,
      Number(session.sub),
      content,
    );
    return res.status(201).json({ update });
  }),
);

export default router;
