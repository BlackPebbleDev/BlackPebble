/**
 * Lightweight in-process idempotency guard for rare, high-consequence admin
 * actions (resets). It prevents the realistic accidental duplicate: a
 * double-click or a retried request replaying the same client idempotency key
 * within a short window returns the first result instead of executing twice.
 *
 * Scope + limitation: this is per-process. Combined with the DB advisory lock
 * that already serialises resets and the frontend's pending-state lock, it
 * covers accidental double-submit. A fully durable, cross-instance idempotency
 * store (DB-backed) would be required if the API is ever horizontally scaled;
 * that is called out in the PR notes rather than silently assumed.
 */

interface Entry<T> {
  at: number;
  value: T | undefined;
  inFlight: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();
const TTL_MS = 5 * 60_000;

function sweep(now: number): void {
  for (const [k, e] of store) {
    if (now - e.at > TTL_MS) store.delete(k);
  }
}

/**
 * Run `fn` at most once per `key` within the TTL. Concurrent or repeated calls
 * with the same key await/return the first invocation's result. A blank key
 * disables dedupe (always runs).
 */
export async function runIdempotent<T>(
  key: string | null | undefined,
  fn: () => Promise<T>,
): Promise<{ result: T; deduped: boolean }> {
  const now = Date.now();
  sweep(now);
  if (!key) {
    return { result: await fn(), deduped: false };
  }
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing) {
    return { result: await existing.inFlight, deduped: true };
  }
  const inFlight = fn();
  const entry: Entry<T> = { at: now, value: undefined, inFlight };
  store.set(key, entry as Entry<unknown>);
  try {
    const value = await inFlight;
    entry.value = value;
    entry.at = Date.now();
    return { result: value, deduped: false };
  } catch (err) {
    // Don't cache failures: allow a genuine retry after an error.
    store.delete(key);
    throw err;
  }
}
