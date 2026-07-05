import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sessionFromRequest } from "../lib/auth.js";
import { mintBadgesAsync } from "../lib/badge-mint.js";
import { resolveUser } from "../lib/profiles.js";
import {
  createThesis,
  deleteThesis,
  getThesisById,
  getThesisWithAuthor,
  getTokenTheses,
  getUserTheses,
  updateThesis,
  THESIS_TITLE_MAX,
  THESIS_CONTENT_MAX,
  SENTIMENTS,
  THESIS_CONVICTIONS,
  type Sentiment,
  type ThesisConviction,
} from "../lib/theses.js";
import { getTokenInfo } from "../lib/prices.js";

const router: IRouter = Router();

const X_REQUIRED = "Connect X to unlock BlackPebble social features";

interface ParsedThesis {
  title: string;
  content: string;
  sentiment: Sentiment;
  conviction: ThesisConviction | null;
}

/** Validate the editable thesis fields shared by create + update. */
function parseThesisFields(
  body: unknown,
): { ok: true; value: ParsedThesis } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = String(b.title ?? "").trim();
  if (!title) return { ok: false, error: "A title is required" };
  if (title.length > THESIS_TITLE_MAX) {
    return {
      ok: false,
      error: `Title must be ${THESIS_TITLE_MAX} characters or fewer`,
    };
  }
  const content = String(b.content ?? "").trim();
  if (!content) return { ok: false, error: "Thesis content is required" };
  if (content.length > THESIS_CONTENT_MAX) {
    return {
      ok: false,
      error: `Thesis must be ${THESIS_CONTENT_MAX} characters or fewer`,
    };
  }
  const sentimentRaw = String(b.sentiment ?? "").trim();
  if (!SENTIMENTS.includes(sentimentRaw as Sentiment)) {
    return { ok: false, error: "A valid sentiment is required" };
  }
  let conviction: ThesisConviction | null = null;
  if (b.conviction != null && b.conviction !== "") {
    if (!THESIS_CONVICTIONS.includes(b.conviction as ThesisConviction)) {
      return { ok: false, error: "Invalid conviction" };
    }
    conviction = b.conviction as ThesisConviction;
  }
  return {
    ok: true,
    value: { title, content, sentiment: sentimentRaw as Sentiment, conviction },
  };
}

/**
 * Owner-only: publish a standalone thesis (token research). Unlike a callout,
 * this is NOT graded as a price prediction - it never affects caller ranking,
 * call multiples, hit rate, or call history. Token metadata is snapshotted from
 * the live source so it renders consistently; price is intentionally NOT
 * snapshotted (a thesis is an opinion, not an on-the-record entry).
 */
router.post(
  "/theses",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });

    const tokenMint = String(req.body?.tokenMint ?? "").trim();
    if (!tokenMint) return res.status(400).json({ error: "A token is required" });

    const parsed = parseThesisFields(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const info = await getTokenInfo(tokenMint);
    const thesis = await createThesis({
      userId: Number(session.sub),
      tokenMint,
      tokenSymbol: info?.symbol ?? null,
      tokenName: info?.name ?? null,
      tokenLogo: info?.logo ?? null,
      title: parsed.value.title,
      content: parsed.value.content,
      sentiment: parsed.value.sentiment,
      conviction: parsed.value.conviction,
    });
    // Mint achievements immediately so the unlock (e.g. First Thesis) persists at
    // publish time and surfaces in the activity feed without a profile view.
    mintBadgesAsync(Number(session.sub));
    return res.status(201).json({ thesis });
  }),
);

/** Public: theses for a token, newest first (excludes admin-hidden + test). */
router.get(
  "/markets/:mint/theses",
  asyncHandler(async (req, res) => {
    const mint = String(req.params.mint).trim();
    const theses = await getTokenTheses(mint, { limit: 50 });
    return res.json({ theses });
  }),
);

/** Public: a single thesis with author identity (excludes admin-hidden). */
router.get(
  "/theses/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid thesis" });
    }
    const thesis = await getThesisWithAuthor(id);
    if (!thesis) return res.status(404).json({ error: "Thesis not found" });
    return res.json({ thesis });
  }),
);

/** Public: thesis history for a profile, newest first. */
router.get(
  "/profiles/:id/theses",
  asyncHandler(async (req, res) => {
    const target = await resolveUser(String(req.params.id));
    if (!target) return res.status(404).json({ error: "Profile not found" });
    const theses = await getUserTheses(target.user_id);
    return res.json({ theses });
  }),
);

/** Owner-only edit. Preserves created_at; bumps updated_at. */
router.put(
  "/theses/:id",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid thesis" });
    }
    const existing = await getThesisById(id);
    if (!existing) return res.status(404).json({ error: "Thesis not found" });
    if (existing.user_id !== Number(session.sub)) {
      return res.status(403).json({ error: "You can only edit your own theses" });
    }
    const parsed = parseThesisFields(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const thesis = await updateThesis(id, Number(session.sub), parsed.value);
    return res.json({ thesis });
  }),
);

/** Owner-only delete. */
router.delete(
  "/theses/:id",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid thesis" });
    }
    const existing = await getThesisById(id);
    if (!existing) return res.status(404).json({ error: "Thesis not found" });
    if (existing.user_id !== Number(session.sub)) {
      return res
        .status(403)
        .json({ error: "You can only delete your own theses" });
    }
    await deleteThesis(id, Number(session.sub));
    return res.json({ ok: true });
  }),
);

export default router;
