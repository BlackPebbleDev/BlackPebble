import { dbAll } from "./database.js";
import { ensureProfileSchema } from "./profiles.js";
import { getExecutionPrice } from "./prices.js";
import { getTokenPeaks, recordTokenPeaks, athMultipleFrom } from "./peaks.js";

/**
 * Top Caller reputation aggregation.
 *
 * Reads the immutable `callouts` table and grades each call live (current price
 * ÷ snapshotted call price = multiple), then rolls the calls up per caller into
 * a weighted reputation score. This is a pure read over existing tables — it
 * never mutates callouts (their immutability is a hard product rule).
 *
 * A caller is graded only on calls where a current price is available; in
 * environments with no live price feed the multiples degrade to null and
 * callers fall back to ranking by call volume.
 */

/** A call counts as a "hit" once it has at least doubled from the call price. */
const HIT_MULTIPLE = 2;
/**
 * Bayesian shrinkage constant: performance-based score components are scaled by
 * callsMade / (callsMade + K) so a single lucky call can't top the board — a
 * caller has to be consistent across several calls to earn full credit.
 */
const CONFIDENCE_K = 5;
/** How long a computed leaderboard is reused before recomputing (ms). */
const CACHE_TTL_MS = 60_000;
/** Max concurrent price lookups when grading distinct mints. */
const PRICE_CONCURRENCY = 6;

export interface CallerBestCall {
  token_symbol: string | null;
  token_mint: string;
  multiple: number;
  /** Peak-since-tracking multiple (ATH high-water mark), >= multiple. */
  athMultiple: number | null;
  /** Market cap (USD) recorded at call time; preserved, never recomputed. */
  calledMarketCapUsd: number | null;
  /** Live market cap (USD) at grade time. */
  currentMarketCapUsd: number | null;
}

export interface CallerEntry {
  rank: number;
  user_id: number;
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
  callsMade: number;
  gradedCalls: number;
  avgMultiple: number | null;
  bestMultiple: number | null;
  hitRate: number;
  callerScore: number;
  bestCall: CallerBestCall | null;
}

interface CalloutRow {
  id: number;
  user_id: number;
  token_mint: string;
  token_symbol: string | null;
  call_price_usd: number | null;
  call_market_cap: number | null;
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

let cache: { at: number; entries: CallerEntry[] } | null = null;

async function pMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function scoreCaller(stats: {
  callsMade: number;
  avgMultiple: number | null;
  bestMultiple: number | null;
  hitRate: number;
}): number {
  const conf = stats.callsMade / (stats.callsMade + CONFIDENCE_K);
  const avg = stats.avgMultiple ?? 0;
  const best = stats.bestMultiple ?? 0;
  // Each component is capped so no single dimension can run away with the score.
  const avgComponent = (Math.min(avg, 10) / 10) * 40 * conf;
  const hitComponent = stats.hitRate * 30 * conf;
  const volumeComponent = (Math.min(stats.callsMade, 30) / 30) * 20;
  const bestComponent = (Math.min(best, 20) / 20) * 10 * conf;
  return (
    Math.round((avgComponent + hitComponent + volumeComponent + bestComponent) *
      10) / 10
  );
}

/** Compute (and cache) the full ranked caller leaderboard. */
export async function computeCallers(): Promise<CallerEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.entries;
  await ensureProfileSchema();

  const rows = await dbAll<CalloutRow>(
    `SELECT c.id, c.user_id, c.token_mint, c.token_symbol, c.call_price_usd,
            c.call_market_cap,
            xi.x_username AS x_username,
            u.display_name AS x_display_name,
            u.avatar_url AS x_avatar_url
       FROM callouts c
       JOIN user_identities xi ON xi.user_id = c.user_id AND xi.provider = 'x'
       JOIN users u ON u.id = c.user_id
      WHERE c.is_hidden_by_admin = FALSE AND c.is_test = FALSE`,
  );

  if (rows.length === 0) {
    cache = { at: Date.now(), entries: [] };
    return [];
  }

  // Grade calls live, fetching each distinct mint's current price once.
  const mints = Array.from(new Set(rows.map((r) => r.token_mint)));
  const priceList = await pMap(mints, PRICE_CONCURRENCY, async (mint) => {
    const px = await getExecutionPrice(mint).catch(() => null);
    return [
      mint,
      {
        priceUsd: px?.priceUsd ?? null,
        marketCapUsd: px?.marketCapUsd ?? null,
      },
    ] as const;
  });
  const priceByMint = new Map<
    string,
    { priceUsd: number | null; marketCapUsd: number | null }
  >(priceList);

  // Fold the live observations into the ATH high-water mark, then read peaks
  // back so a caller's best call can also surface its peak-since-tracking high.
  await recordTokenPeaks(
    mints.map((mint) => ({
      mint,
      priceUsd: priceByMint.get(mint)?.priceUsd ?? null,
      marketCapUsd: priceByMint.get(mint)?.marketCapUsd ?? null,
    })),
  );
  const peaks = await getTokenPeaks(mints);

  interface Acc {
    user_id: number;
    x_username: string | null;
    x_display_name: string | null;
    x_avatar_url: string | null;
    callsMade: number;
    multiples: number[];
    bestCall: CallerBestCall | null;
  }
  const byUser = new Map<number, Acc>();

  for (const r of rows) {
    let acc = byUser.get(r.user_id);
    if (!acc) {
      acc = {
        user_id: r.user_id,
        x_username: r.x_username,
        x_display_name: r.x_display_name,
        x_avatar_url: r.x_avatar_url,
        callsMade: 0,
        multiples: [],
        bestCall: null,
      };
      byUser.set(r.user_id, acc);
    }
    acc.callsMade += 1;
    const px = priceByMint.get(r.token_mint);
    const current = px?.priceUsd;
    if (
      current != null &&
      current > 0 &&
      r.call_price_usd != null &&
      r.call_price_usd > 0
    ) {
      const multiple = current / r.call_price_usd;
      acc.multiples.push(multiple);
      if (!acc.bestCall || multiple > acc.bestCall.multiple) {
        acc.bestCall = {
          token_symbol: r.token_symbol,
          token_mint: r.token_mint,
          multiple,
          athMultiple: athMultipleFrom(
            peaks.get(r.token_mint),
            r.call_price_usd,
            multiple,
          ),
          calledMarketCapUsd: r.call_market_cap,
          currentMarketCapUsd: px?.marketCapUsd ?? null,
        };
      }
    }
  }

  const entries: CallerEntry[] = Array.from(byUser.values()).map((acc) => {
    const graded = acc.multiples.length;
    const avgMultiple =
      graded > 0 ? acc.multiples.reduce((a, b) => a + b, 0) / graded : null;
    const bestMultiple =
      graded > 0 ? Math.max(...acc.multiples) : null;
    const hitRate =
      graded > 0
        ? acc.multiples.filter((m) => m >= HIT_MULTIPLE).length / graded
        : 0;
    const callerScore = scoreCaller({
      callsMade: acc.callsMade,
      avgMultiple,
      bestMultiple,
      hitRate,
    });
    return {
      rank: 0,
      user_id: acc.user_id,
      x_username: acc.x_username,
      x_display_name: acc.x_display_name,
      x_avatar_url: acc.x_avatar_url,
      callsMade: acc.callsMade,
      gradedCalls: graded,
      avgMultiple,
      bestMultiple,
      hitRate,
      callerScore,
      bestCall: acc.bestCall,
    };
  });

  entries.sort(
    (a, b) => b.callerScore - a.callerScore || b.callsMade - a.callsMade,
  );
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  cache = { at: Date.now(), entries };
  return entries;
}

export async function getTopCallers(limit = 100): Promise<CallerEntry[]> {
  const entries = await computeCallers();
  return entries.slice(0, Math.min(Math.max(limit, 1), 200));
}

/** A single caller's stats + their rank, or null if they've never called. */
export async function getCallerStats(
  userId: number,
): Promise<CallerEntry | null> {
  const entries = await computeCallers();
  return entries.find((e) => e.user_id === userId) ?? null;
}
