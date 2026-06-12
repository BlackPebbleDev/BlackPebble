import { dbAll, dbGet, dbRun } from "./database.js";

/**
 * Standalone token theses — research / analysis posts that are SEPARATE from
 * callouts.
 *
 * A thesis is NOT a tracked price prediction. It never feeds the Top Caller
 * leaderboard, call multiples, hit rate, or call history. It only powers the
 * Thesis history, the token thesis list, feed "thesis" events, and the profile
 * thesis section. Calls (callouts) remain immutable; theses, by contrast, MAY be
 * edited or deleted by their owner (edits preserve created_at and bump
 * updated_at).
 *
 * Two admin-only columns support the Social Control Center:
 *   - is_test: tags admin/test content so it can be filtered or purged.
 *   - is_hidden_by_admin: soft-hide for moderation; excluded from public reads.
 *
 * Schema is bootstrapped lazily via CREATE TABLE IF NOT EXISTS (same convention
 * as callouts/journal) since there is no startup migration path.
 */

export type Sentiment = "bullish" | "bearish" | "neutral";
export type ThesisConviction = "low" | "medium" | "high";

export const THESIS_TITLE_MAX = 120;
export const THESIS_CONTENT_MAX = 2000;
export const SENTIMENTS: Sentiment[] = ["bullish", "bearish", "neutral"];
export const THESIS_CONVICTIONS: ThesisConviction[] = ["low", "medium", "high"];

export interface ThesisInput {
  userId: number;
  tokenMint: string;
  tokenSymbol?: string | null;
  tokenName?: string | null;
  tokenLogo?: string | null;
  title: string;
  content: string;
  sentiment: Sentiment;
  conviction?: ThesisConviction | null;
  isTest?: boolean;
}

export interface Thesis {
  id: number;
  user_id: number;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  token_logo: string | null;
  title: string;
  content: string;
  sentiment: string;
  conviction: string | null;
  is_test: boolean;
  is_hidden_by_admin: boolean;
  created_at: number;
  updated_at: number;
}

/** A thesis joined to its author's X identity, for public display. */
export interface ThesisWithAuthor extends Thesis {
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

let thesesSchemaEnsured = false;

export async function ensureThesesSchema(): Promise<void> {
  if (thesesSchemaEnsured) return;
  await dbRun(
    `CREATE TABLE IF NOT EXISTS token_theses (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id),
       token_mint TEXT NOT NULL,
       token_symbol TEXT,
       token_name TEXT,
       token_logo TEXT,
       title TEXT NOT NULL,
       content TEXT NOT NULL,
       sentiment TEXT NOT NULL,
       conviction TEXT,
       is_test BOOLEAN NOT NULL DEFAULT FALSE,
       is_hidden_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
       created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
       updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
     )`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_theses_user ON token_theses (user_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_theses_mint ON token_theses (token_mint)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_theses_created ON token_theses (created_at)`,
  );
  thesesSchemaEnsured = true;
}

const SELECT_WITH_AUTHOR = `
  SELECT t.*,
         xi.x_username AS x_username,
         u.display_name AS x_display_name,
         u.avatar_url AS x_avatar_url
    FROM token_theses t
    JOIN user_identities xi ON xi.user_id = t.user_id AND xi.provider = 'x'
    JOIN users u ON u.id = t.user_id`;

/** Create a new thesis (owner-scoped — userId comes from the session). */
export async function createThesis(input: ThesisInput): Promise<Thesis> {
  await ensureThesesSchema();
  const row = await dbGet<Thesis>(
    `INSERT INTO token_theses (
       user_id, token_mint, token_symbol, token_name, token_logo,
       title, content, sentiment, conviction, is_test
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      input.userId,
      input.tokenMint,
      input.tokenSymbol ?? null,
      input.tokenName ?? null,
      input.tokenLogo ?? null,
      input.title,
      input.content,
      input.sentiment,
      input.conviction ?? null,
      input.isTest ?? false,
    ],
  );
  return row!;
}

export interface ThesisPatch {
  title?: string;
  content?: string;
  sentiment?: Sentiment;
  conviction?: ThesisConviction | null;
}

/**
 * Owner-only edit. Returns the updated row, or null when the thesis does not
 * exist or is not owned by `userId`. created_at is preserved; updated_at bumps.
 */
export async function updateThesis(
  id: number,
  userId: number,
  patch: ThesisPatch,
): Promise<Thesis | null> {
  await ensureThesesSchema();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.title !== undefined) {
    params.push(patch.title);
    sets.push(`title = $${params.length}`);
  }
  if (patch.content !== undefined) {
    params.push(patch.content);
    sets.push(`content = $${params.length}`);
  }
  if (patch.sentiment !== undefined) {
    params.push(patch.sentiment);
    sets.push(`sentiment = $${params.length}`);
  }
  if (patch.conviction !== undefined) {
    params.push(patch.conviction);
    sets.push(`conviction = $${params.length}`);
  }
  if (sets.length === 0) return getThesisById(id);
  sets.push(`updated_at = EXTRACT(EPOCH FROM NOW())::bigint`);
  params.push(id, userId);
  const row = await dbGet<Thesis>(
    `UPDATE token_theses SET ${sets.join(", ")}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
      RETURNING *`,
    params,
  );
  return row ?? null;
}

/** Owner-only delete. Returns true when a row was removed. */
export async function deleteThesis(
  id: number,
  userId: number,
): Promise<boolean> {
  await ensureThesesSchema();
  const row = await dbGet<{ id: number }>(
    `DELETE FROM token_theses WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  return !!row;
}

/** Single thesis by id (raw row, no author join). */
export async function getThesisById(id: number): Promise<Thesis | null> {
  await ensureThesesSchema();
  const row = await dbGet<Thesis>(
    `SELECT * FROM token_theses WHERE id = $1`,
    [id],
  );
  return row ?? null;
}

/** Single thesis with author identity, excluding admin-hidden, or null. */
export async function getThesisWithAuthor(
  id: number,
): Promise<ThesisWithAuthor | null> {
  await ensureThesesSchema();
  const row = await dbGet<ThesisWithAuthor>(
    `${SELECT_WITH_AUTHOR} WHERE t.id = $1 AND t.is_hidden_by_admin = FALSE`,
    [id],
  );
  return row ?? null;
}

/**
 * Public theses for a token, newest first. Excludes admin-hidden rows and
 * (by default) test rows.
 */
export async function getTokenTheses(
  mint: string,
  opts: { limit?: number; includeTest?: boolean } = {},
): Promise<ThesisWithAuthor[]> {
  await ensureThesesSchema();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const testClause = opts.includeTest ? "" : "AND t.is_test = FALSE";
  return dbAll<ThesisWithAuthor>(
    `${SELECT_WITH_AUTHOR}
      WHERE t.token_mint = $1 AND t.is_hidden_by_admin = FALSE ${testClause}
      ORDER BY t.created_at DESC
      LIMIT $2`,
    [mint, limit],
  );
}

/** Public thesis history for a user, newest first (excludes admin-hidden). */
export async function getUserTheses(
  userId: number,
  opts: { includeTest?: boolean } = {},
): Promise<ThesisWithAuthor[]> {
  await ensureThesesSchema();
  const testClause = opts.includeTest ? "" : "AND t.is_test = FALSE";
  return dbAll<ThesisWithAuthor>(
    `${SELECT_WITH_AUTHOR}
      WHERE t.user_id = $1 AND t.is_hidden_by_admin = FALSE ${testClause}
      ORDER BY t.created_at DESC`,
    [userId],
  );
}

/** Count of (public, non-test) theses for a token — for the community card. */
export async function countTokenTheses(mint: string): Promise<number> {
  await ensureThesesSchema();
  const row = await dbGet<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM token_theses
      WHERE token_mint = $1 AND is_hidden_by_admin = FALSE AND is_test = FALSE`,
    [mint],
  );
  return row?.n ?? 0;
}
