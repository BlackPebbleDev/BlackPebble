import axios from "axios";
import { getBestPairs, deriveSeriesFromPair } from "./prices.js";
import { getSnapshotSeries } from "./priceHistory.js";

/**
 * Token-card sparklines.
 *
 * Sparklines need a short history of prices, but BlackPebble's market feeds are
 * all single-point (current price/MC/24h-change only) and there is no internal
 * price-history table. We therefore read recent OHLCV candles from GeckoTerminal
 * for the SAME pool the price/MC come from (resolved via the shared trusted-quote
 * `isBetterPair` selection in prices.ts), extract the close prices, and hand the
 * frontend a compact array it can draw as a tiny SVG line.
 *
 * Design constraints honoured here:
 *  - No per-card upstream calls: the route batches every visible mint into ONE
 *    request; pools are resolved with a batched DexScreener lookup (30/mint per
 *    call) and OHLCV is fetched with a small concurrency limit.
 *  - Aggressive caching: results are cached in-memory per (mint, window) so tab
 *    revisits and re-renders are free. No DB table is created.
 *  - Never breaks a card: any failure resolves to `null` points, which the UI
 *    renders as a neutral placeholder line.
 */

export type SparklineWindow = "1h" | "6h" | "24h";

export const DEFAULT_WINDOW: SparklineWindow = "24h";

/** A sparkline is a short chronological series of close prices, oldest first. */
export type SparklinePoints = number[] | null;

/**
 * Which fallback level produced a series. `null` means no real data was found at
 * any level — the client draws an honest artificial placeholder (L6), seeded by
 * the mint, that never claims to be real. Real sources are ranked: a richer
 * source always wins over a coarser one.
 */
export type SparklineSource =
  | "gecko" // L2: GeckoTerminal OHLCV (premium real history)
  | "dexscreener" // L3: derived from real DexScreener price-change windows
  | "birdeye" // L4: Birdeye history (only when an API key is configured)
  | "snapshot"; // L5: observed in-memory price snapshots accumulated this session

/** A resolved sparkline: its points (null when only a placeholder is possible) and the source. */
export interface SparklineEntry {
  points: SparklinePoints;
  source: SparklineSource | null;
}

interface WindowConfig {
  /** GeckoTerminal timeframe segment. */
  timeframe: "minute" | "hour" | "day";
  /** Candle aggregation (e.g. 15 => 15-minute candles). */
  aggregate: number;
  /** How many candles to request (also the max points returned). */
  limit: number;
  /** Cache TTL for this window, ms. Shorter windows turn over faster. */
  ttlMs: number;
}

/**
 * Window → candle settings. Architecture supports 1H/6H/24H today; 24H is the
 * default the UI renders. (No UI control yet — callers pass the window param.)
 */
const WINDOW_CONFIG: Record<SparklineWindow, WindowConfig> = {
  "1h": { timeframe: "minute", aggregate: 5, limit: 12, ttlMs: 60 * 1000 },
  "6h": { timeframe: "minute", aggregate: 15, limit: 24, ttlMs: 5 * 60 * 1000 },
  "24h": { timeframe: "hour", aggregate: 1, limit: 24, ttlMs: 10 * 60 * 1000 },
};

export function isSparklineWindow(v: unknown): v is SparklineWindow {
  return v === "1h" || v === "6h" || v === "24h";
}

// ── In-memory cache ────────────────────────────────────────────────────────
interface CacheEntry {
  points: SparklinePoints;
  source: SparklineSource | null;
  at: number;
}
const cache = new Map<string, CacheEntry>();
const cacheKey = (mint: string, w: SparklineWindow) => `${w}:${mint}`;

/** Cap concurrent GeckoTerminal calls so a cold batch stays within rate limits. */
const FETCH_CONCURRENCY = 3;
/** Hard cap on mints served per request — bounds upstream fan-out. */
export const MAX_SPARKLINE_MINTS = 60;

// ── Admin diagnostics counters ─────────────────────────────────────────────
const diagnostics = {
  requests: 0,
  mintsRequested: 0,
  cacheHits: 0,
  ohlcvFetches: 0,
  poolResolveFailures: 0,
  ohlcvFailures: 0,
  emptyHistory: 0,
  totalFetchMs: 0,
  fetchSamples: 0,
  slowFetches: 0,
  lastError: null as string | null,
  lastErrorAt: null as number | null,
  // Per-source resolution counts (cumulative across requests). `placeholder` is
  // the count of mints that fell all the way through to the client-side L6.
  sourceGecko: 0,
  sourceDexscreener: 0,
  sourceBirdeye: 0,
  sourceSnapshot: 0,
  sourcePlaceholder: 0,
};

/** Tally a resolution against its source for the diagnostics endpoint. */
function tallySource(source: SparklineSource | null): void {
  switch (source) {
    case "gecko":
      diagnostics.sourceGecko += 1;
      break;
    case "dexscreener":
      diagnostics.sourceDexscreener += 1;
      break;
    case "birdeye":
      diagnostics.sourceBirdeye += 1;
      break;
    case "snapshot":
      diagnostics.sourceSnapshot += 1;
      break;
    default:
      diagnostics.sourcePlaceholder += 1;
  }
}

/** A single OHLCV fetch slower than this is flagged as an excessive render. */
const SLOW_FETCH_MS = 4000;

export function getSparklineDiagnostics() {
  return {
    ...diagnostics,
    cachedEntries: cache.size,
    avgFetchMs:
      diagnostics.fetchSamples > 0
        ? Math.round(diagnostics.totalFetchMs / diagnostics.fetchSamples)
        : 0,
    cacheHitRate:
      diagnostics.mintsRequested > 0
        ? +(diagnostics.cacheHits / diagnostics.mintsRequested).toFixed(3)
        : 0,
    windows: Object.fromEntries(
      Object.entries(WINDOW_CONFIG).map(([k, v]) => [
        k,
        { aggregate: v.aggregate, timeframe: v.timeframe, ttlSeconds: v.ttlMs / 1000 },
      ]),
    ),
  };
}

// ── GeckoTerminal OHLCV ────────────────────────────────────────────────────
/**
 * Fetch one pool's recent close prices from GeckoTerminal, oldest-first.
 * Returns null on any failure or when there isn't enough history to draw a line.
 */
async function fetchPoolCloses(
  poolAddress: string,
  cfg: WindowConfig,
): Promise<SparklinePoints> {
  const url =
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/` +
    `${poolAddress}/ohlcv/${cfg.timeframe}?aggregate=${cfg.aggregate}&limit=${cfg.limit}`;
  const started = Date.now();
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { accept: "application/json" },
    });
    const elapsed = Date.now() - started;
    diagnostics.ohlcvFetches += 1;
    diagnostics.totalFetchMs += elapsed;
    diagnostics.fetchSamples += 1;
    if (elapsed > SLOW_FETCH_MS) diagnostics.slowFetches += 1;

    // ohlcv_list rows are [timestamp, open, high, low, close, volume], newest
    // first. Reverse to chronological and keep the close (index 4).
    const list: unknown = res.data?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(list) || list.length < 2) {
      diagnostics.emptyHistory += 1;
      return null;
    }
    const closes: number[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const row = list[i];
      const close = Array.isArray(row) ? Number(row[4]) : NaN;
      if (Number.isFinite(close) && close > 0) closes.push(close);
    }
    if (closes.length < 2) {
      diagnostics.emptyHistory += 1;
      return null;
    }
    return closes;
  } catch (e) {
    diagnostics.ohlcvFailures += 1;
    diagnostics.lastError = e instanceof Error ? e.message : String(e);
    diagnostics.lastErrorAt = Date.now();
    return null;
  }
}

// ── Birdeye history (L4) ───────────────────────────────────────────────────
/**
 * Birdeye OHLCV history for a mint. ONLY attempted when a `BIRDEYE_API_KEY` is
 * configured — otherwise this returns null instantly and the level is skipped
 * cleanly (no key is set in this environment today, so L4 is inactive until one
 * is provided). Read-only, oldest-first close prices.
 */
async function fetchBirdeyeCloses(
  mint: string,
  cfg: WindowConfig,
): Promise<SparklinePoints> {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return null;

  // Map the sparkline window to a Birdeye candle type + lookback range.
  const typeByTimeframe: Record<WindowConfig["timeframe"], string> = {
    minute: cfg.aggregate >= 15 ? "15m" : "5m",
    hour: "1H",
    day: "1D",
  };
  const stepSec =
    cfg.timeframe === "hour"
      ? 3600
      : cfg.timeframe === "day"
        ? 86400
        : cfg.aggregate * 60;
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - stepSec * (cfg.limit + 1);
  const url =
    `https://public-api.birdeye.so/defi/ohlcv?address=${mint}` +
    `&type=${typeByTimeframe[cfg.timeframe]}&time_from=${fromSec}&time_to=${nowSec}`;
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { accept: "application/json", "X-API-KEY": apiKey, "x-chain": "solana" },
    });
    const items: unknown = res.data?.data?.items;
    if (!Array.isArray(items) || items.length < 2) {
      diagnostics.emptyHistory += 1;
      return null;
    }
    const closes: number[] = [];
    for (const row of items) {
      const c = row && typeof row === "object" ? Number((row as { c?: unknown }).c) : NaN;
      if (Number.isFinite(c) && c > 0) closes.push(c);
    }
    return closes.length >= 2 ? closes : null;
  } catch (e) {
    diagnostics.lastError = e instanceof Error ? e.message : String(e);
    diagnostics.lastErrorAt = Date.now();
    return null;
  }
}

/** Run an async mapper over items with a fixed concurrency ceiling. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}

/**
 * Resolve sparklines for a set of mints in the given window through an ordered
 * fallback chain, preferring the richest REAL source available:
 *
 *   L1  reuse a still-fresh cached resolution (no upstream call)
 *   L2  GeckoTerminal OHLCV for the trusted-quote pool (premium real history)
 *   L3  series derived from real DexScreener price-change windows (no extra call —
 *       the pool batch already returned the price/change fields)
 *   L4  Birdeye history (only when BIRDEYE_API_KEY is set; otherwise skipped)
 *   L5  observed in-memory price snapshots accumulated this session
 *
 * When every real source comes up empty the entry's points are `null` with a
 * `null` source; the CLIENT then draws an honest artificial placeholder (L6)
 * seeded by the mint. Cached per (mint, window) — including `null` results — so
 * only cache-missing mints do any work, and a later retry can promote a mint to
 * a real source once snapshots accumulate or upstream recovers.
 */
export async function getSparklines(
  mints: string[],
  window: SparklineWindow = DEFAULT_WINDOW,
): Promise<Record<string, SparklineEntry>> {
  diagnostics.requests += 1;
  const cfg = WINDOW_CONFIG[window];
  const result: Record<string, SparklineEntry> = {};

  const unique = [...new Set(mints.filter(Boolean))].slice(0, MAX_SPARKLINE_MINTS);
  diagnostics.mintsRequested += unique.length;
  if (unique.length === 0) return result;

  const now = Date.now();
  const misses: string[] = [];
  for (const mint of unique) {
    const hit = cache.get(cacheKey(mint, window));
    if (hit && now - hit.at < cfg.ttlMs) {
      diagnostics.cacheHits += 1;
      result[mint] = { points: hit.points, source: hit.source };
    } else {
      misses.push(mint);
    }
  }

  if (misses.length > 0) {
    // One batched DexScreener lookup yields BOTH the OHLCV pool (L2) and the
    // price/change fields used for the derived series (L3) — no extra upstream load.
    const pairs = await getBestPairs(misses);
    await mapWithConcurrency(misses, FETCH_CONCURRENCY, async (mint) => {
      const pair = pairs.get(mint);
      let points: SparklinePoints = null;
      let source: SparklineSource | null = null;

      // L2: GeckoTerminal OHLCV (richest real history).
      if (pair?.poolAddress) {
        const gecko = await fetchPoolCloses(pair.poolAddress, cfg);
        if (gecko) {
          points = gecko;
          source = "gecko";
        }
      } else {
        diagnostics.poolResolveFailures += 1;
      }

      // L3: derive a coarse real series from DexScreener price-change windows.
      if (!points && pair) {
        const derived = deriveSeriesFromPair(pair);
        if (derived) {
          points = derived;
          source = "dexscreener";
        }
      }

      // L4: Birdeye history (only active when an API key is configured).
      if (!points) {
        const birdeye = await fetchBirdeyeCloses(mint, cfg);
        if (birdeye) {
          points = birdeye;
          source = "birdeye";
        }
      }

      // L5: observed in-memory snapshots accumulated this session.
      if (!points) {
        const snap = getSnapshotSeries(mint);
        if (snap) {
          points = snap;
          source = "snapshot";
        }
      }

      cache.set(cacheKey(mint, window), { points, source, at: Date.now() });
      tallySource(source);
      result[mint] = { points, source };
    });
  }

  return result;
}
