import { getAllNormalizedLessons } from "./registry";
import { lessonPath } from "./routes";
import { looksLikeAddress, type ChainScope } from "./chains";
import type { LessonDifficulty, LessonKind } from "./types";

/**
 * Deterministic Academy search used by the global BlackPebble search. Builds a
 * precomputed document index once at module load, expands common query
 * variations (PnL / P&L / profit and loss, SL / stop loss, ...), classifies
 * search intent, and ranks lessons with explicit deterministic signals — no
 * opaque/AI ranking. Token vs concept disambiguation is handled by the caller
 * using the returned intent so both a token and a lesson can appear together.
 */

export type SearchIntent =
  | "address" // a supported-chain address/mint -> favor tokens
  | "ticker" // $TICKER -> favor tokens
  | "handle" // @handle -> favor traders
  | "question" // natural-language -> favor lessons
  | "term"; // ambiguous exact term -> show both

const HANDLE_RE = /^@[A-Za-z0-9_]{1,15}$/;
const QUESTION_STARTERS = [
  "what",
  "why",
  "how",
  "explain",
  "when",
  "where",
  "which",
  "who",
  "is",
  "are",
  "does",
  "do",
  "can",
];

export function classifyIntent(query: string): SearchIntent {
  const q = query.trim();
  if (!q) return "term";
  if (HANDLE_RE.test(q)) return "handle";
  if (q.startsWith("$")) return "ticker";
  if (looksLikeAddress(q)) return "address";

  const lower = q.toLowerCase();
  const firstWord = lower.split(/\s+/)[0];
  const multiWord = lower.includes(" ");
  if (
    q.endsWith("?") ||
    (multiWord && QUESTION_STARTERS.includes(firstWord))
  ) {
    return "question";
  }
  return "term";
}

/** Equivalence groups so common shorthands match their canonical concepts. */
const EQUIVALENCE_GROUPS: string[][] = [
  ["pnl", "p&l", "p & l", "profit and loss", "profit/loss", "profit loss"],
  ["sl", "stop loss", "stop-loss", "stoploss"],
  ["tp", "take profit", "take-profit"],
  ["mc", "market cap", "marketcap", "mcap"],
  ["ca", "contract address", "contract", "mint", "mint address"],
  ["fdv", "fully diluted valuation", "fully diluted value"],
  ["ath", "all time high", "all-time high"],
  ["rr", "r:r", "risk reward", "risk-reward", "risk to reward"],
];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Expand a query into the set of concrete terms to match against documents. */
export function expandQuery(query: string): string[] {
  const q = normalizeText(query.replace(/^[$@]/, ""));
  if (!q) return [];
  const terms = new Set<string>([q]);
  for (const group of EQUIVALENCE_GROUPS) {
    if (group.some((member) => member === q || q.includes(member))) {
      for (const member of group) terms.add(member);
    }
  }
  return [...terms];
}

export interface LessonSearchResult {
  slug: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  shortDescription: string;
  difficulty?: LessonDifficulty;
  estimatedMinutes?: number;
  kind: LessonKind;
  chainScope?: ChainScope;
  matchedAlias?: string;
  path: string;
  score: number;
}

interface LessonDoc {
  slug: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  shortDescription: string;
  difficulty?: LessonDifficulty;
  estimatedMinutes?: number;
  kind: LessonKind;
  chainScope?: ChainScope;
  path: string;
  titleLower: string;
  aliasesLower: string[];
  keywordsLower: string[];
  bodyLower: string;
}

function truncate(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max).trimEnd()}…`;
}

/** Precomputed, immutable document index (built once at module load). */
const LESSON_DOCS: LessonDoc[] = getAllNormalizedLessons()
  .filter((lesson) => lesson.status === "published")
  .map((lesson) => {
    const bodyParts = [
      lesson.shortAnswer ?? "",
      lesson.summary ?? "",
      ...lesson.sections.map((s) => s.body),
      lesson.categoryTitle,
    ];
    const shortDescription = truncate(
      lesson.shortAnswer ??
        lesson.summary ??
        lesson.sections.find((s) => s.kind === "what")?.body ??
        lesson.sections[0]?.body ??
        "",
    );
    return {
      slug: lesson.slug,
      title: lesson.title,
      categoryId: lesson.categoryId,
      categoryTitle: lesson.categoryTitle,
      shortDescription,
      difficulty: lesson.difficulty,
      estimatedMinutes: lesson.estimatedMinutes,
      kind: lesson.kind,
      chainScope: lesson.chainScope,
      path: lessonPath(lesson.categoryId, lesson.slug),
      titleLower: lesson.title.toLowerCase(),
      aliasesLower: lesson.aliases.map((a) => a.toLowerCase()),
      keywordsLower: lesson.keywords.map((k) => k.toLowerCase()),
      bodyLower: bodyParts.join(" ").toLowerCase(),
    };
  });

interface ScoreOutcome {
  score: number;
  matchedAlias?: string;
}

function scoreDoc(doc: LessonDoc, terms: string[]): ScoreOutcome {
  let best = 0;
  let matchedAlias: string | undefined;
  for (const term of terms) {
    if (!term) continue;
    // Title signals (strongest).
    if (doc.titleLower === term) best = Math.max(best, 100);
    else if (doc.titleLower.startsWith(term)) best = Math.max(best, 62);
    else if (doc.titleLower.includes(term)) best = Math.max(best, 34);

    // Alias signals.
    for (const alias of doc.aliasesLower) {
      if (alias === term) {
        if (90 > best) {
          best = 90;
          matchedAlias = alias;
        }
      } else if (alias.startsWith(term)) {
        if (52 > best) {
          best = 52;
          matchedAlias = alias;
        }
      } else if (alias.includes(term)) {
        if (26 > best) {
          best = 26;
          matchedAlias = alias;
        }
      }
    }

    // Keyword + body signals (weakest).
    if (doc.keywordsLower.some((k) => k.includes(term))) {
      best = Math.max(best, 12);
    }
    if (doc.bodyLower.includes(term)) best = Math.max(best, 8);
  }
  if (best > 0 && doc.kind === "flagship") best += 3;
  return { score: best, matchedAlias };
}

/** Ranked lesson results for a query. Returns [] for empty/blank queries. */
export function searchLessons(query: string, limit = 6): LessonSearchResult[] {
  const terms = expandQuery(query);
  if (terms.length === 0) return [];

  const scored: LessonSearchResult[] = [];
  for (const doc of LESSON_DOCS) {
    const { score, matchedAlias } = scoreDoc(doc, terms);
    if (score <= 0) continue;
    scored.push({
      slug: doc.slug,
      title: doc.title,
      categoryId: doc.categoryId,
      categoryTitle: doc.categoryTitle,
      shortDescription: doc.shortDescription,
      difficulty: doc.difficulty,
      estimatedMinutes: doc.estimatedMinutes,
      kind: doc.kind,
      chainScope: doc.chainScope,
      matchedAlias,
      path: doc.path,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return scored.slice(0, limit);
}

/** Count of indexed, published lesson documents (for diagnostics/tests). */
export function lessonDocCount(): number {
  return LESSON_DOCS.length;
}
