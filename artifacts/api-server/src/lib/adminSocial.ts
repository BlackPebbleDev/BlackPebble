import { dbAll, dbGet } from "./database.js";
import { ensureProfileSchema } from "./profiles.js";
import { ensureThesesSchema } from "./theses.js";
import { ensureJournalSchema } from "./journal.js";

/**
 * Admin-only Social Control Center data layer.
 *
 * Listing helpers return EVERY row (including admin-hidden + test) joined to the
 * author's X identity, so the admin can moderate the full set. Moderation
 * helpers flip the is_test / is_hidden_by_admin flags only — they do not edit
 * user content (the immutability of a caller's actual call data is preserved;
 * hiding a call removes it from public reads without rewriting it).
 */

export type TestFilter = "all" | "test" | "real" | "hidden";

function filterClause(filter: TestFilter, alias: string): string {
  switch (filter) {
    case "test":
      return `AND ${alias}.is_test = TRUE`;
    case "real":
      return `AND ${alias}.is_test = FALSE`;
    case "hidden":
      return `AND ${alias}.is_hidden_by_admin = TRUE`;
    case "all":
    default:
      return "";
  }
}

export interface AdminListOpts {
  filter?: TestFilter;
  token?: string;
  user?: string;
  limit?: number;
}

function clampLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? 100, 1), 500);
}

export async function listAdminCallouts(
  opts: AdminListOpts = {},
): Promise<Record<string, unknown>[]> {
  await ensureProfileSchema();
  const params: unknown[] = [];
  let where = "WHERE 1 = 1";
  if (opts.token) {
    params.push(`%${opts.token}%`);
    const i = params.length;
    where += ` AND (c.token_symbol ILIKE $${i} OR c.token_mint ILIKE $${i} OR c.token_name ILIKE $${i})`;
  }
  if (opts.user) {
    params.push(`%${opts.user}%`);
    where += ` AND xi.x_username ILIKE $${params.length}`;
  }
  where += ` ${filterClause(opts.filter ?? "all", "c")}`;
  params.push(clampLimit(opts.limit));
  return dbAll(
    `SELECT c.id, c.user_id, c.token_mint, c.token_symbol, c.token_name,
            c.token_logo, c.call_market_cap, c.conviction, c.thesis,
            c.is_test, c.is_hidden_by_admin, c.created_at,
            xi.x_username, u.display_name AS x_display_name,
            u.avatar_url AS x_avatar_url
       FROM callouts c
       JOIN user_identities xi ON xi.user_id = c.user_id AND xi.provider = 'x'
       JOIN users u ON u.id = c.user_id
       ${where}
      ORDER BY c.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
}

export async function listAdminTheses(
  opts: AdminListOpts = {},
): Promise<Record<string, unknown>[]> {
  await ensureThesesSchema();
  const params: unknown[] = [];
  let where = "WHERE 1 = 1";
  if (opts.token) {
    params.push(`%${opts.token}%`);
    const i = params.length;
    where += ` AND (t.token_symbol ILIKE $${i} OR t.token_mint ILIKE $${i} OR t.token_name ILIKE $${i})`;
  }
  if (opts.user) {
    params.push(`%${opts.user}%`);
    where += ` AND xi.x_username ILIKE $${params.length}`;
  }
  where += ` ${filterClause(opts.filter ?? "all", "t")}`;
  params.push(clampLimit(opts.limit));
  return dbAll(
    `SELECT t.id, t.user_id, t.token_mint, t.token_symbol, t.token_name,
            t.token_logo, t.title, t.content, t.sentiment, t.conviction,
            t.is_test, t.is_hidden_by_admin, t.created_at, t.updated_at,
            xi.x_username, u.display_name AS x_display_name,
            u.avatar_url AS x_avatar_url
       FROM token_theses t
       JOIN user_identities xi ON xi.user_id = t.user_id AND xi.provider = 'x'
       JOIN users u ON u.id = t.user_id
       ${where}
      ORDER BY t.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
}

export async function listAdminJournal(
  opts: AdminListOpts = {},
): Promise<Record<string, unknown>[]> {
  await ensureJournalSchema();
  const params: unknown[] = [];
  let where = "WHERE 1 = 1";
  if (opts.token) {
    params.push(`%${opts.token}%`);
    const i = params.length;
    where += ` AND (j.token ILIKE $${i} OR j.token_mint ILIKE $${i})`;
  }
  if (opts.user) {
    params.push(`%${opts.user}%`);
    where += ` AND xi.x_username ILIKE $${params.length}`;
  }
  where += ` ${filterClause(opts.filter ?? "all", "j")}`;
  params.push(clampLimit(opts.limit));
  return dbAll(
    `SELECT j.id, j.user_id, j.title, j.token, j.token_mint, j.outcome,
            j.is_test, j.is_hidden_by_admin, j.created_at,
            xi.x_username, u.display_name AS x_display_name
       FROM journal_entries j
       LEFT JOIN user_identities xi ON xi.user_id = j.user_id AND xi.provider = 'x'
       LEFT JOIN users u ON u.id = j.user_id
       ${where}
      ORDER BY j.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
}

/** Counts for the Social Control Center header (real vs test vs hidden). */
export async function socialOverview(): Promise<Record<string, number>> {
  await Promise.all([
    ensureProfileSchema(),
    ensureThesesSchema(),
    ensureJournalSchema(),
  ]);
  const row = await dbGet<Record<string, number>>(
    `SELECT
       (SELECT count(*)::int FROM callouts) AS callouts_total,
       (SELECT count(*)::int FROM callouts WHERE is_test) AS callouts_test,
       (SELECT count(*)::int FROM callouts WHERE is_hidden_by_admin) AS callouts_hidden,
       (SELECT count(*)::int FROM token_theses) AS theses_total,
       (SELECT count(*)::int FROM token_theses WHERE is_test) AS theses_test,
       (SELECT count(*)::int FROM token_theses WHERE is_hidden_by_admin) AS theses_hidden,
       (SELECT count(*)::int FROM journal_entries) AS journal_total,
       (SELECT count(*)::int FROM journal_entries WHERE is_test) AS journal_test,
       (SELECT count(*)::int FROM user_follows) AS follows_total`,
  );
  return row ?? {};
}

type FlagTable = "callouts" | "token_theses" | "journal_entries";

/** Flip is_test for a row. Returns true when a row matched. */
export async function setTestFlag(
  table: FlagTable,
  id: number,
  isTest: boolean,
): Promise<boolean> {
  const row = await dbGet<{ id: number }>(
    `UPDATE ${table} SET is_test = $1 WHERE id = $2 RETURNING id`,
    [isTest, id],
  );
  return !!row;
}

/** Flip is_hidden_by_admin for a row (callouts/theses only). */
export async function setHiddenFlag(
  table: "callouts" | "token_theses",
  id: number,
  hidden: boolean,
): Promise<boolean> {
  const row = await dbGet<{ id: number }>(
    `UPDATE ${table} SET is_hidden_by_admin = $1 WHERE id = $2 RETURNING id`,
    [hidden, id],
  );
  return !!row;
}

/** Admin-only delete of a single journal entry (no backup — private data). */
export async function deleteJournalAdmin(id: number): Promise<boolean> {
  await ensureJournalSchema();
  const row = await dbGet<{ id: number }>(
    `DELETE FROM journal_entries WHERE id = $1 RETURNING id`,
    [id],
  );
  return !!row;
}

/** Bulk-tag every row of a content type as test (or untag). */
export async function bulkTagTest(
  table: FlagTable,
  isTest: boolean,
): Promise<number> {
  const rows = await dbAll<{ id: number }>(
    `UPDATE ${table} SET is_test = $1 RETURNING id`,
    [isTest],
  );
  return rows.length;
}
