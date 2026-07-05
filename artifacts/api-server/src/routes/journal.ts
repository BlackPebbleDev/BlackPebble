import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sessionFromRequest } from "../lib/auth.js";
import {
  createJournalEntry,
  deleteJournalEntry,
  getJournalStats,
  listJournalEntries,
  updateJournalEntry,
  DIRECTIONS,
  OUTCOMES,
  TRADE_TYPES,
  type Direction,
  type JournalInput,
  type Outcome,
  type TradeType,
} from "../lib/journal.js";

const router: IRouter = Router();

const X_REQUIRED = "Connect X to unlock your Trading Journal";
const TEXT_MAX = 4000;
const TITLE_MAX = 200;
const TOKEN_MAX = 120;

type ValidationError = { error: string };

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a sanitized JournalInput from the request body. Returns a
 * ValidationError string when an enum / rating / length constraint is violated.
 * Only owner-supplied reflection fields are accepted; auto-import numeric fields
 * (entry_mc/exit_mc/roi/pnl/source) are reserved for the future
 * "Create From Trade" flow and are not writable via this endpoint yet.
 */
function parseBody(body: unknown): JournalInput | ValidationError {
  const b = (body ?? {}) as Record<string, unknown>;

  const title = str(b.title);
  if (title && title.length > TITLE_MAX) {
    return { error: `Title must be ${TITLE_MAX} characters or fewer` };
  }
  const token = str(b.token);
  if (token && token.length > TOKEN_MAX) {
    return { error: `Token must be ${TOKEN_MAX} characters or fewer` };
  }

  const tradeTypeRaw = str(b.tradeType);
  if (tradeTypeRaw && !TRADE_TYPES.includes(tradeTypeRaw as TradeType)) {
    return { error: "Invalid trade type" };
  }
  const directionRaw = str(b.direction);
  if (directionRaw && !DIRECTIONS.includes(directionRaw as Direction)) {
    return { error: "Invalid direction" };
  }
  const outcomeRaw = str(b.outcome);
  if (outcomeRaw && !OUTCOMES.includes(outcomeRaw as Outcome)) {
    return { error: "Invalid outcome" };
  }

  const rating = num(b.rating);
  if (rating != null && (rating < 1 || rating > 5 || !Number.isInteger(rating))) {
    return { error: "Rating must be a whole number from 1 to 5" };
  }

  const longText: Array<[keyof JournalInput, unknown]> = [
    ["entryReason", b.entryReason],
    ["exitReason", b.exitReason],
    ["wentRight", b.wentRight],
    ["wentWrong", b.wentWrong],
    ["lessons", b.lessons],
    ["emotionBefore", b.emotionBefore],
    ["emotionAfter", b.emotionAfter],
    ["notes", b.notes],
  ];
  const out: JournalInput = {
    title,
    tradeType: tradeTypeRaw,
    direction: directionRaw,
    outcome: outcomeRaw,
    token,
    tradeDate: num(b.tradeDate),
    rating,
    template: str(b.template),
  };
  for (const [key, raw] of longText) {
    const v = str(raw);
    if (v && v.length > TEXT_MAX) {
      return { error: "One of your notes is too long (4000 character max)" };
    }
    (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

function isValidationError(v: unknown): v is ValidationError {
  return !!v && typeof v === "object" && "error" in v;
}

/** Owner-scoped: the journal is private - every read/write keys off session.sub. */
router.get(
  "/journal",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const entries = await listJournalEntries(Number(session.sub));
    return res.json({ entries });
  }),
);

router.get(
  "/journal/stats",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const stats = await getJournalStats(Number(session.sub));
    return res.json({ stats });
  }),
);

router.post(
  "/journal",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const parsed = parseBody(req.body);
    if (isValidationError(parsed)) {
      return res.status(400).json(parsed);
    }
    const entry = await createJournalEntry(Number(session.sub), parsed);
    return res.status(201).json({ entry });
  }),
);

router.put(
  "/journal/:id",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid entry" });
    }
    const parsed = parseBody(req.body);
    if (isValidationError(parsed)) {
      return res.status(400).json(parsed);
    }
    const entry = await updateJournalEntry(id, Number(session.sub), parsed);
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    return res.json({ entry });
  }),
);

router.delete(
  "/journal/:id",
  asyncHandler(async (req, res) => {
    const session = await sessionFromRequest(req);
    if (!session?.x_id) return res.status(401).json({ error: X_REQUIRED });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid entry" });
    }
    const ok = await deleteJournalEntry(id, Number(session.sub));
    if (!ok) return res.status(404).json({ error: "Entry not found" });
    return res.json({ ok: true });
  }),
);

export default router;
