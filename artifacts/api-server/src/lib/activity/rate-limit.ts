/**
 * Activity Layer — noise controls (Phase 2 foundation).
 *
 * Pure, in-memory helpers for keeping the activity layer quiet as it scales:
 *  - `createRateLimiter` — a sliding-window "max N per window per key" limiter
 *    for future milestone publishers (e.g. at most one progression milestone
 *    per user per few minutes), so a burst of qualifying actions can't spam.
 *  - `dedupeKey` / `createDeduper` — the idempotency-key convention (mirrors
 *    the authoritative `feed_events.dedupe_key`) plus a process-local guard.
 *
 * These are BUILT here but not yet applied to any live publisher — the durable
 * dedupe remains the `dedupe_key` unique constraint. They're the toolbox the
 * Phase 4 publishers will use. No DB, no I/O, unit-tested.
 */

export interface RateLimiter {
  /** True if this call is allowed under the window; records it when allowed. */
  allow(key: string, now?: number): boolean;
  /** Clear one key, or all keys when omitted (useful for tests). */
  reset(key?: string): void;
}

/**
 * A sliding-window rate limiter. Allows at most `max` events per `windowSec`
 * for each key. Timestamps are kept per key and pruned lazily on access, so
 * memory stays bounded to recently-active keys.
 */
export function createRateLimiter(opts: {
  windowSec: number;
  max: number;
}): RateLimiter {
  const windowMs = Math.max(1, opts.windowSec) * 1000;
  const max = Math.max(1, opts.max);
  const hits = new Map<string, number[]>();

  return {
    allow(key: string, now: number = Date.now()): boolean {
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    reset(key?: string): void {
      if (key === undefined) hits.clear();
      else hits.delete(key);
    },
  };
}

/**
 * Build an idempotency / dedupe key from parts, matching the existing
 * `feed_events.dedupe_key` convention (e.g. `tier:{user}:{tier}`).
 */
export function dedupeKey(...parts: Array<string | number>): string {
  return parts.map((p) => String(p)).join(":");
}

export interface Deduper {
  /** True if this key was already seen (and records it); false the first time. */
  seen(key: string): boolean;
  reset(): void;
}

/**
 * Process-local dedupe guard. A cheap first line of defense against duplicate
 * emits within a single process; the durable guarantee is still the unique
 * `dedupe_key` column.
 */
export function createDeduper(): Deduper {
  const set = new Set<string>();
  return {
    seen(key: string): boolean {
      if (set.has(key)) return true;
      set.add(key);
      return false;
    },
    reset(): void {
      set.clear();
    },
  };
}
