/**
 * Bounded in-memory price-snapshot store (sparkline fallback level L5).
 *
 * BlackPebble has no price-history table and we add none. But every time the
 * server already fetches a token's current price (trending feed, token-info,
 * sparkline pool resolution) we can cheaply remember it here. Over a session
 * these observed snapshots accumulate into a genuine - if coarse - intraday
 * series we can draw when richer real sources (GeckoTerminal OHLCV,
 * DexScreener-derived windows) are unavailable.
 *
 * Hard rules:
 *  - REAL data only: we store prices we actually observed, never synthetic ones.
 *  - No new upstream calls: callers pass prices they already fetched.
 *  - Bounded memory: capped points per mint AND capped mint count (LRU-evicted).
 *  - No DB, no schema change.
 */

interface Snapshot {
  t: number;
  price: number;
  mc: number | null;
}

/** Max snapshots retained per mint (oldest dropped past this). */
const MAX_PER_MINT = 64;
/** Max distinct mints tracked; least-recently-updated mint is evicted past this. */
const MAX_MINTS = 4000;
/**
 * Minimum spacing between stored samples for one mint. Bursty re-fetches within
 * this window update the latest point in place instead of appending, so the
 * series reflects elapsed time rather than request frequency.
 */
const MIN_SAMPLE_GAP_MS = 20 * 1000;
/** Minimum points before a snapshot series is considered drawable. */
const MIN_SERIES_POINTS = 4;
/** Minimum wall-clock span the points must cover to count as a real trend. */
const MIN_SERIES_SPAN_MS = 3 * 60 * 1000;

/**
 * Insertion-ordered map → iteration order doubles as an LRU queue. On update we
 * delete + re-set the key so the most-recently-touched mint moves to the back.
 */
const store = new Map<string, Snapshot[]>();

const diagnostics = {
  recorded: 0,
  coalesced: 0,
  evictions: 0,
  served: 0,
};

/**
 * Record an observed price for a mint. No-ops on non-finite/non-positive prices
 * so we never poison the series with junk. Cheap and synchronous.
 */
export function recordPriceSnapshot(
  mint: string,
  price: number,
  mc: number | null = null,
): void {
  if (!mint || !Number.isFinite(price) || price <= 0) return;
  const now = Date.now();

  let arr = store.get(mint);
  if (arr) {
    // Touch: move to back of LRU order.
    store.delete(mint);
    store.set(mint, arr);
    const last = arr[arr.length - 1];
    if (last && now - last.t < MIN_SAMPLE_GAP_MS) {
      // Coalesce rapid re-fetches into the latest point.
      last.price = price;
      if (mc != null) last.mc = mc;
      diagnostics.coalesced += 1;
      return;
    }
  } else {
    if (store.size >= MAX_MINTS) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) {
        store.delete(oldest);
        diagnostics.evictions += 1;
      }
    }
    arr = [];
    store.set(mint, arr);
  }

  arr.push({ t: now, price, mc });
  if (arr.length > MAX_PER_MINT) arr.shift();
  diagnostics.recorded += 1;
}

/**
 * Return the observed close-price series (oldest first) for a mint, or null when
 * we haven't accumulated enough points spread over enough time to draw an honest
 * line. The caller treats a returned array as real history.
 */
export function getSnapshotSeries(mint: string): number[] | null {
  const arr = store.get(mint);
  if (!arr || arr.length < MIN_SERIES_POINTS) return null;
  const span = arr[arr.length - 1].t - arr[0].t;
  if (span < MIN_SERIES_SPAN_MS) return null;
  diagnostics.served += 1;
  return arr.map((s) => s.price);
}

export function getPriceHistoryDiagnostics() {
  let totalPoints = 0;
  for (const arr of store.values()) totalPoints += arr.length;
  return {
    ...diagnostics,
    trackedMints: store.size,
    totalPoints,
    avgPointsPerMint:
      store.size > 0 ? +(totalPoints / store.size).toFixed(2) : 0,
    config: {
      maxPerMint: MAX_PER_MINT,
      maxMints: MAX_MINTS,
      minSampleGapMs: MIN_SAMPLE_GAP_MS,
      minSeriesPoints: MIN_SERIES_POINTS,
      minSeriesSpanMs: MIN_SERIES_SPAN_MS,
    },
  };
}
