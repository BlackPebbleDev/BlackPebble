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

/**
 * Plain-English synonyms mapped to canonical Academy concepts. Beginners rarely
 * search using the "correct" term, so "gas" should find fees, "rugged" should
 * find rug pulls, and "coin" should find token lessons. Keyed by exact
 * normalized word/phrase to avoid substring false positives.
 */
const SYNONYMS: Record<string, string[]> = {
  coin: ["token"],
  coins: ["token"],
  gas: ["fees", "network fee", "transaction fee"],
  fee: ["fees", "network fee"],
  hack: ["scam", "drainer", "phishing"],
  hacked: ["scam", "drainer", "phishing"],
  stolen: ["scam", "drainer", "phishing"],
  rugged: ["rug pull", "rug"],
  rug: ["rug pull"],
  scammed: ["scam", "phishing"],
  "wallet key": ["seed phrase", "private key"],
  "recovery phrase": ["seed phrase"],
  "secret phrase": ["seed phrase"],
  seed: ["seed phrase"],
  ape: ["buy"],
  aping: ["buy"],
  dump: ["sell"],
  dumping: ["sell"],
  bag: ["position", "holdings"],
  bags: ["position", "holdings"],
  chart: ["price chart", "candles"],
  candle: ["candles", "price chart"],
  liq: ["liquidity"],
  lp: ["liquidity"],
  pool: ["liquidity"],
  meme: ["memecoin"],
  "meme coin": ["memecoin"],
  shitcoin: ["memecoin"],
  phantom: ["wallet"],
  solflare: ["wallet"],
  cheap: ["price"],
  expensive: ["price", "market cap"],
  safe: ["safety", "scam"],
  safety: ["safety"],
};

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
  // Synonyms: whole-query and per-word exact mapping to canonical concepts.
  const candidates = [q, ...q.split(" ")];
  for (const c of candidates) {
    const syn = SYNONYMS[c];
    if (syn) for (const s of syn) terms.add(s);
  }
  return [...terms];
}

/**
 * Levenshtein edit distance, capped for efficiency. Powers typo tolerance and
 * did-you-mean without any fuzzy/opaque ranking — the distance is explicit.
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

function fuzzyThreshold(len: number): number {
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 3;
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
  /** Single-word tokens (len >= 3) for typo-tolerant matching. */
  tokens: string[];
}

function tokenize(...parts: string[]): string[] {
  const set = new Set<string>();
  for (const p of parts) {
    for (const w of p.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 3) set.add(w);
    }
  }
  return [...set];
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
      tokens: tokenize(
        lesson.title,
        lesson.aliases.join(" "),
        lesson.keywords.join(" "),
      ),
    };
  });

/**
 * Vocabulary of concepts for did-you-mean: lesson titles, aliases, and the
 * canonical terms from equivalence/synonym maps. Deduped and length-bounded.
 */
const SEARCH_VOCAB: string[] = (() => {
  const set = new Set<string>();
  for (const doc of LESSON_DOCS) {
    set.add(doc.titleLower);
    for (const a of doc.aliasesLower) set.add(a);
    for (const t of doc.tokens) set.add(t);
  }
  for (const group of EQUIVALENCE_GROUPS) for (const m of group) set.add(m);
  for (const list of Object.values(SYNONYMS)) for (const s of list) set.add(s);
  return [...set].filter((t) => t.length >= 3 && t.length <= 40);
})();

/**
 * Suggest a corrected query ("did you mean …") when the query is close to a
 * known concept but not an exact match. Returns undefined when the query
 * already matches a vocabulary term or nothing is close enough.
 */
export function suggestQuery(query: string): string | undefined {
  const q = normalizeText(query.replace(/^[$@]/, ""));
  if (q.length < 3) return undefined;
  let best: string | undefined;
  let bestD = Infinity;
  for (const term of SEARCH_VOCAB) {
    if (term === q) return undefined;
    const d = editDistance(q, term, 3);
    if (d < bestD) {
      bestD = d;
      best = term;
    }
    if (bestD === 1) break;
  }
  const threshold = fuzzyThreshold(q.length);
  return best && bestD > 0 && bestD <= threshold ? best : undefined;
}

/** Curated beginner lessons shown when a search returns nothing useful. */
const POPULAR_SLUGS = [
  "what-is-blackpebble",
  "paper-vs-real-trading",
  "connecting-vs-signing",
  "price-and-market-cap",
  "price-impact-and-slippage",
  "phishing-and-drainers",
];

export function popularLessonSlugs(): string[] {
  const known = new Set(LESSON_DOCS.map((d) => d.slug));
  return POPULAR_SLUGS.filter((s) => known.has(s));
}

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

    // Typo tolerance: only for single-word terms not already matched exactly.
    // Compares against single-word doc tokens by edit distance, so "slipage"
    // finds "slippage" and "walet" finds "wallet" — deterministically.
    if (best < 30 && term.length >= 4 && !term.includes(" ")) {
      const threshold = fuzzyThreshold(term.length);
      let fuzzyHit = false;
      for (const tok of doc.tokens) {
        if (Math.abs(tok.length - term.length) > threshold) continue;
        if (editDistance(term, tok, threshold) <= threshold) {
          fuzzyHit = true;
          break;
        }
      }
      if (fuzzyHit) best = Math.max(best, 28);
    }
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
