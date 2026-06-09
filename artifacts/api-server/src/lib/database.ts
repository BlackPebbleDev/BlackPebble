import pg from "pg";

// node-postgres returns int8/bigint columns AND integer aggregates
// (COUNT/SUM over ints) as strings by default. Every bigint column we use is a
// unix-second timestamp and every aggregate count fits safely in a JS number,
// so we register a global parser that turns OID 20 (int8) into a number. This
// keeps the query helpers returning the same numeric shapes the app expects.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. The Postgres database is required for paper-trading persistence.",
  );
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/** Anything we can run a parameterized query against (the pool or a tx client). */
export type Queryable = pg.Pool | pg.PoolClient;

/** Run a query and return all rows. */
export async function dbAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T[]> {
  const res = await client.query(sql, params);
  return res.rows as T[];
}

/** Run a query and return the first row (or undefined). */
export async function dbGet<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T | undefined> {
  const res = await client.query(sql, params);
  return res.rows[0] as T | undefined;
}

/** Run a write/DDL statement, ignoring the result set. */
export async function dbRun(
  sql: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<void> {
  await client.query(sql, params);
}

/**
 * Run `fn` inside a single transaction on a dedicated client. The callback
 * receives that client and MUST pass it to every dbAll/dbGet/dbRun call (and
 * use `... FOR UPDATE` on the rows it mutates) so concurrent trade requests
 * cannot overspend a balance or double-credit a position. Rolls back on throw.
 */
export async function withTx<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure; original error is rethrown below
    }
    throw e;
  } finally {
    client.release();
  }
}

// ── In-memory cache ─────────────────────────────────────────────────────────
// Short-lived caches (SOL/USD price, trending list, etc.) that do not need to
// survive a restart. Keeping them in-process avoids a DB round trip on every
// price read and lets the cache helpers stay synchronous, so prices.ts is
// unchanged. Timestamps are milliseconds.
const cacheStore = new Map<string, { value: string; updatedAt: number }>();

export function getCacheValue(key: string): string | null {
  const row = cacheStore.get(key);
  return row ? row.value : null;
}

export function setCacheValue(key: string, value: string): void {
  cacheStore.set(key, { value, updatedAt: Date.now() });
}

export function isCacheFresh(key: string, maxAgeMs = 5 * 60 * 1000): boolean {
  const row = cacheStore.get(key);
  if (!row) return false;
  return Date.now() - row.updatedAt < maxAgeMs;
}

/** Drop a cached value so the next read refetches it (used by admin force-refresh). */
export function deleteCacheValue(key: string): void {
  cacheStore.delete(key);
}
