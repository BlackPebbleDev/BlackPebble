import { dbAll, dbGet, dbRun } from "./database.js";

/**
 * Trading Journal: private, owner-scoped trade reviews. Unlike callouts these
 * are mutable (the trader can edit/delete their own reflections) and never
 * public - every read/write is keyed to the authenticated user's internal id.
 *
 * The table is created idempotently at runtime (CREATE TABLE IF NOT EXISTS),
 * matching the callouts / user_follows pattern; the drizzle definition in
 * lib/db/src/schema/index.ts is mirror-only for type-safety. drizzle-kit push
 * is avoided (no TTY in this environment).
 */

export type TradeType = "spot" | "leverage";
export type Direction = "long" | "short";
export type Outcome = "win" | "loss" | "neutral";

export const TRADE_TYPES: TradeType[] = ["spot", "leverage"];
export const DIRECTIONS: Direction[] = ["long", "short"];
export const OUTCOMES: Outcome[] = ["win", "loss", "neutral"];

export interface JournalEntry {
  id: number;
  user_id: number;
  title: string | null;
  trade_type: string | null;
  direction: string | null;
  outcome: string | null;
  token: string | null;
  token_mint: string | null;
  trade_date: number | null;
  entry_reason: string | null;
  exit_reason: string | null;
  went_right: string | null;
  went_wrong: string | null;
  lessons: string | null;
  emotion_before: string | null;
  emotion_after: string | null;
  rating: number | null;
  notes: string | null;
  template: string | null;
  // Auto-import scaffolding (structured now, populated by a future
  // "Create Journal Entry From Trade" flow - see routes/journal.ts).
  source: string | null;
  entry_mc: number | null;
  exit_mc: number | null;
  roi: number | null;
  pnl: number | null;
  created_at: number;
  updated_at: number;
}

export interface JournalInput {
  title?: string | null;
  tradeType?: string | null;
  direction?: string | null;
  outcome?: string | null;
  token?: string | null;
  tokenMint?: string | null;
  tradeDate?: number | null;
  entryReason?: string | null;
  exitReason?: string | null;
  wentRight?: string | null;
  wentWrong?: string | null;
  lessons?: string | null;
  emotionBefore?: string | null;
  emotionAfter?: string | null;
  rating?: number | null;
  notes?: string | null;
  template?: string | null;
  source?: string | null;
  entryMc?: number | null;
  exitMc?: number | null;
  roi?: number | null;
  pnl?: number | null;
}

export interface JournalStats {
  totalEntries: number;
  entriesThisMonth: number;
  winningReviews: number;
  losingReviews: number;
  lessonsRecorded: number;
}

let journalSchemaEnsured = false;

export async function ensureJournalSchema(): Promise<void> {
  if (journalSchemaEnsured) return;
  await dbRun(
    `CREATE TABLE IF NOT EXISTS journal_entries (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id),
       title TEXT,
       trade_type TEXT,
       direction TEXT,
       outcome TEXT,
       token TEXT,
       token_mint TEXT,
       trade_date BIGINT,
       entry_reason TEXT,
       exit_reason TEXT,
       went_right TEXT,
       went_wrong TEXT,
       lessons TEXT,
       emotion_before TEXT,
       emotion_after TEXT,
       rating INTEGER,
       notes TEXT,
       template TEXT,
       source TEXT DEFAULT 'manual',
       entry_mc DOUBLE PRECISION,
       exit_mc DOUBLE PRECISION,
       roi DOUBLE PRECISION,
       pnl DOUBLE PRECISION,
       created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
       updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
     )`,
  );
  // Admin-only moderation columns (Social Control Center), mirroring callouts.
  // Journal entries are private, but these let the admin tag test entries and
  // purge them; is_hidden_by_admin is reserved for parity with other content.
  await dbRun(
    `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await dbRun(
    `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_hidden_by_admin BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_entries (user_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_journal_created ON journal_entries (created_at)`,
  );
  journalSchemaEnsured = true;
}

const COLUMNS: Array<[keyof JournalInput, string]> = [
  ["title", "title"],
  ["tradeType", "trade_type"],
  ["direction", "direction"],
  ["outcome", "outcome"],
  ["token", "token"],
  ["tokenMint", "token_mint"],
  ["tradeDate", "trade_date"],
  ["entryReason", "entry_reason"],
  ["exitReason", "exit_reason"],
  ["wentRight", "went_right"],
  ["wentWrong", "went_wrong"],
  ["lessons", "lessons"],
  ["emotionBefore", "emotion_before"],
  ["emotionAfter", "emotion_after"],
  ["rating", "rating"],
  ["notes", "notes"],
  ["template", "template"],
  ["source", "source"],
  ["entryMc", "entry_mc"],
  ["exitMc", "exit_mc"],
  ["roi", "roi"],
  ["pnl", "pnl"],
];

export async function createJournalEntry(
  userId: number,
  input: JournalInput,
): Promise<JournalEntry> {
  await ensureJournalSchema();
  const cols = ["user_id"];
  const placeholders = ["$1"];
  const values: unknown[] = [userId];
  for (const [key, col] of COLUMNS) {
    cols.push(col);
    placeholders.push(`$${values.length + 1}`);
    values.push(input[key] ?? null);
  }
  const row = await dbGet<JournalEntry>(
    `INSERT INTO journal_entries (${cols.join(", ")})
     VALUES (${placeholders.join(", ")}) RETURNING *`,
    values,
  );
  return row!;
}

export async function listJournalEntries(
  userId: number,
): Promise<JournalEntry[]> {
  await ensureJournalSchema();
  return dbAll<JournalEntry>(
    `SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
}

export async function getJournalEntry(
  id: number,
  userId: number,
): Promise<JournalEntry | null> {
  await ensureJournalSchema();
  const row = await dbGet<JournalEntry>(
    `SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return row ?? null;
}

/** Owner-scoped update. Only the provided fields are changed. */
export async function updateJournalEntry(
  id: number,
  userId: number,
  input: JournalInput,
): Promise<JournalEntry | null> {
  await ensureJournalSchema();
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of COLUMNS) {
    if (key in input) {
      values.push(input[key] ?? null);
      sets.push(`${col} = $${values.length}`);
    }
  }
  values.push(Math.floor(Date.now() / 1000));
  sets.push(`updated_at = $${values.length}`);
  values.push(id);
  values.push(userId);
  const row = await dbGet<JournalEntry>(
    `UPDATE journal_entries SET ${sets.join(", ")}
     WHERE id = $${values.length - 1} AND user_id = $${values.length}
     RETURNING *`,
    values,
  );
  return row ?? null;
}

export async function deleteJournalEntry(
  id: number,
  userId: number,
): Promise<boolean> {
  await ensureJournalSchema();
  const row = await dbGet<{ id: number }>(
    `DELETE FROM journal_entries WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  return !!row;
}

export async function getJournalStats(userId: number): Promise<JournalStats> {
  await ensureJournalSchema();
  const row = await dbGet<{
    total: number;
    this_month: number;
    winning: number;
    losing: number;
    lessons: number;
  }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (
         WHERE created_at >= EXTRACT(EPOCH FROM date_trunc('month', NOW()))::bigint
       )::int AS this_month,
       COUNT(*) FILTER (WHERE outcome = 'win')::int AS winning,
       COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losing,
       COUNT(*) FILTER (WHERE lessons IS NOT NULL AND btrim(lessons) <> '')::int AS lessons
     FROM journal_entries WHERE user_id = $1`,
    [userId],
  );
  return {
    totalEntries: row?.total ?? 0,
    entriesThisMonth: row?.this_month ?? 0,
    winningReviews: row?.winning ?? 0,
    losingReviews: row?.losing ?? 0,
    lessonsRecorded: row?.lessons ?? 0,
  };
}
