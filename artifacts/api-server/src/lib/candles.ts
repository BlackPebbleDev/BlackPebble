import axios from "axios";
import { logger } from "./logger.js";
import { getBestPairs } from "./prices.js";
import { getTokenSupply } from "./helius.js";

/**
 * Token-page OHLCV candles (Chart Intelligence Phase 1).
 *
 * The native BlackPebble chart needs real candles, not the close-only series
 * the sparkline pipeline keeps. This module fetches full OHLCV rows from
 * GeckoTerminal for the SAME trusted pool the token's price/MC come from
 * (resolved through `getBestPairs`, identical to the sparkline path), so the
 * chart never disagrees with the header numbers.
 *
 * Design constraints:
 *  - One upstream call per (mint, resolution) per TTL window - the in-memory
 *    cache below absorbs page refreshes and re-renders.
 *  - Serve-stale-on-failure: an expired entry is returned (flagged `stale`)
 *    when the refresh fails, so a GeckoTerminal hiccup degrades to slightly
 *    old candles instead of an empty chart.
 *  - REAL data only: no synthetic candles, no gap filling.
 */

// ── Resolutions ──────────────────────────────────────────────────────────────

/**
 * Client-facing resolutions mapped to GeckoTerminal's supported
 * timeframe/aggregate pairs (second: 1/15/30, minute: 1/5/15, hour: 1/4/12,
 * day: 1). 3m is intentionally absent - upstream doesn't provide it.
 */
export const CANDLE_RESOLUTIONS = [
  "15s",
  "30s",
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
] as const;

export type CandleResolution = (typeof CANDLE_RESOLUTIONS)[number];

export function isCandleResolution(v: string): v is CandleResolution {
  return (CANDLE_RESOLUTIONS as readonly string[]).includes(v);
}

interface ResolutionConfig {
  timeframe: "second" | "minute" | "hour" | "day";
  aggregate: number;
  /** Candles requested per fetch (GeckoTerminal max 1000). */
  limit: number;
  /** Cache TTL - short for fast candles, longer for slow ones. */
  ttlMs: number;
}

const RESOLUTION_CONFIG: Record<CandleResolution, ResolutionConfig> = {
  "15s": { timeframe: "second", aggregate: 15, limit: 400, ttlMs: 10_000 },
  "30s": { timeframe: "second", aggregate: 30, limit: 400, ttlMs: 15_000 },
  "1m": { timeframe: "minute", aggregate: 1, limit: 500, ttlMs: 20_000 },
  "5m": { timeframe: "minute", aggregate: 5, limit: 500, ttlMs: 45_000 },
  "15m": { timeframe: "minute", aggregate: 15, limit: 500, ttlMs: 60_000 },
  "1h": { timeframe: "hour", aggregate: 1, limit: 500, ttlMs: 120_000 },
  "4h": { timeframe: "hour", aggregate: 4, limit: 400, ttlMs: 300_000 },
  "1d": { timeframe: "day", aggregate: 1, limit: 365, ttlMs: 600_000 },
};

// ── Types ────────────────────────────────────────────────────────────────────

/** One OHLCV candle, USD-priced, unix-seconds timestamp (candle open time). */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface CandleResponse {
  candles: Candle[];
  /**
   * Derived circulating supply (marketCapUsd / priceUsd from the trusted
   * pair) - lets the client render market-cap candles from price candles.
   * Null when either figure is unavailable.
   */
  supply: number | null;
  poolAddress: string;
  resolution: CandleResolution;
  /** True when the upstream refresh failed and these are expired-cache candles. */
  stale: boolean;
}

// ── Caches ───────────────────────────────────────────────────────────────────

interface PoolCacheEntry {
  poolAddress: string;
  supply: number | null;
  at: number;
}
/** mint → trusted pool + derived supply. Pools rarely change; 5 min TTL. */
const poolCache = new Map<string, PoolCacheEntry>();
const POOL_TTL_MS = 5 * 60_000;
const POOL_CACHE_MAX = 2000;

interface CandleCacheEntry {
  candles: Candle[];
  at: number;
}
const candleCache = new Map<string, CandleCacheEntry>();
const CANDLE_CACHE_MAX = 500;

/** Coalesce concurrent requests for the same (mint, resolution). */
const inFlight = new Map<string, Promise<CandleResponse | null>>();

function lruSet<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

// ── Diagnostics (surfaced via admin route, mirrors sparkline counters) ──────
const diagnostics = {
  requests: 0,
  cacheHits: 0,
  fetches: 0,
  fetchFailures: 0,
  staleServed: 0,
  emptyHistory: 0,
  lastError: null as string | null,
  lastErrorAt: null as number | null,
};

export function getCandleDiagnostics() {
  return {
    ...diagnostics,
    cachedSeries: candleCache.size,
    cachedPools: poolCache.size,
  };
}

// ── Pool resolution ──────────────────────────────────────────────────────────

async function resolvePool(mint: string): Promise<PoolCacheEntry | null> {
  const cached = poolCache.get(mint);
  if (cached && Date.now() - cached.at < POOL_TTL_MS) return cached;

  const pairs = await getBestPairs([mint]);
  const pair = pairs.get(mint);
  if (!pair?.poolAddress) return cached ?? null;

  // Supply MUST be a constant, or market-cap candles rescale on every fetch
  // (the exact bug that made MC jump across timeframe switches). Prefer the
  // real on-chain supply (pinned, cached 12h); only fall back to a
  // price-derived estimate when the chain lookup is unavailable, and once a
  // pinned value exists never overwrite it with a drifting estimate.
  let supply = cached?.supply ?? null;
  const onChain = await getTokenSupply(mint);
  if (onChain != null && onChain > 0) {
    supply = onChain;
  } else if (
    supply == null &&
    pair.marketCapUsd != null &&
    pair.priceUsd != null &&
    pair.priceUsd > 0 &&
    Number.isFinite(pair.marketCapUsd / pair.priceUsd)
  ) {
    supply = pair.marketCapUsd / pair.priceUsd;
  }

  const entry: PoolCacheEntry = {
    poolAddress: pair.poolAddress,
    supply,
    at: Date.now(),
  };
  lruSet(poolCache, mint, entry, POOL_CACHE_MAX);
  return entry;
}

// ── OHLCV fetch ──────────────────────────────────────────────────────────────

/**
 * Fetch one pool's OHLCV rows from GeckoTerminal, oldest-first. Unlike the
 * sparkline fetcher this keeps the full candle. Returns null on failure or
 * when the pool has no usable history at this resolution.
 */
async function fetchPoolCandles(
  poolAddress: string,
  cfg: ResolutionConfig,
  opts?: { beforeTimestamp?: number; limit?: number },
): Promise<Candle[] | null> {
  const limit = opts?.limit ?? cfg.limit;
  let url =
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/` +
    `${poolAddress}/ohlcv/${cfg.timeframe}?aggregate=${cfg.aggregate}&limit=${limit}`;
  // before_timestamp lets the TradingView datafeed page backwards through
  // history: each getBars call for an older range fetches the candles ending
  // at that boundary. Unix seconds, per GeckoTerminal's contract.
  if (opts?.beforeTimestamp && Number.isFinite(opts.beforeTimestamp)) {
    url += `&before_timestamp=${Math.floor(opts.beforeTimestamp)}`;
  }
  try {
    diagnostics.fetches += 1;
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { accept: "application/json" },
    });
    // Rows are [timestamp, open, high, low, close, volume], newest first.
    const list: unknown = res.data?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(list) || list.length === 0) {
      diagnostics.emptyHistory += 1;
      return null;
    }
    const candles: Candle[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const row = list[i];
      if (!Array.isArray(row) || row.length < 6) continue;
      const [t, o, h, l, c, v] = row.map(Number);
      if (
        !Number.isFinite(t) ||
        !Number.isFinite(o) ||
        !Number.isFinite(h) ||
        !Number.isFinite(l) ||
        !Number.isFinite(c) ||
        o <= 0 ||
        h <= 0 ||
        l <= 0 ||
        c <= 0
      ) {
        continue;
      }
      candles.push({ t, o, h, l, c, v: Number.isFinite(v) && v >= 0 ? v : 0 });
    }
    if (candles.length === 0) {
      diagnostics.emptyHistory += 1;
      return null;
    }
    return candles;
  } catch (e) {
    diagnostics.fetchFailures += 1;
    diagnostics.lastError = e instanceof Error ? e.message : String(e);
    diagnostics.lastErrorAt = Date.now();
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a mint's candles at the requested resolution. Returns null only when
 * the pool can't be resolved or there is no history AND nothing cached - the
 * route turns that into a 404 the client renders as an honest empty state.
 */
export async function getCandles(
  mint: string,
  resolution: CandleResolution,
): Promise<CandleResponse | null> {
  diagnostics.requests += 1;
  const key = `${resolution}:${mint}`;
  const cfg = RESOLUTION_CONFIG[resolution];

  const pool = await resolvePool(mint);
  if (!pool) return null;

  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.at < cfg.ttlMs) {
    diagnostics.cacheHits += 1;
    return {
      candles: cached.candles,
      supply: pool.supply,
      poolAddress: pool.poolAddress,
      resolution,
      stale: false,
    };
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<CandleResponse | null> => {
    try {
      const fresh = await fetchPoolCandles(pool.poolAddress, cfg);
      if (fresh) {
        lruSet(candleCache, key, { candles: fresh, at: Date.now() }, CANDLE_CACHE_MAX);
        return {
          candles: fresh,
          supply: pool.supply,
          poolAddress: pool.poolAddress,
          resolution,
          stale: false,
        };
      }
      // Refresh failed or empty: fall back to expired cache when we have one.
      if (cached) {
        diagnostics.staleServed += 1;
        return {
          candles: cached.candles,
          supply: pool.supply,
          poolAddress: pool.poolAddress,
          resolution,
          stale: true,
        };
      }
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
  return task;
}

// ── Datafeed range API (TradingView Advanced Charts) ─────────────────────────

export interface CandleRangeParams {
  mint: string;
  resolution: CandleResolution;
  /** Fetch candles strictly before this unix-seconds boundary (history paging). */
  before?: number;
  /** How many candles the caller wants (TradingView `countBack`); clamped. */
  countBack?: number;
  /** When true, OHLC is returned in market-cap units (price x pinned supply). */
  marketCap?: boolean;
}

export interface CandleRangeResponse {
  /** Oldest-first candles. MC-valued when `marketCap` is true. */
  candles: Candle[];
  /** Pinned on-chain supply used for MC (null when unavailable). */
  supply: number | null;
  poolAddress: string;
  resolution: CandleResolution;
  /** True only when MC units were actually applied (supply was available). */
  marketCap: boolean;
  /** True when there is genuinely no more history in this range. */
  noData: boolean;
}

/** Short cache for datafeed range fetches, keyed by the full request shape. */
const rangeCache = new Map<string, { candles: Candle[]; at: number }>();
const RANGE_CACHE_MAX = 800;

function toMarketCap(candles: Candle[], supply: number): Candle[] {
  return candles.map((c) => ({
    t: c.t,
    o: c.o * supply,
    h: c.h * supply,
    l: c.l * supply,
    c: c.c * supply,
    v: c.v,
  }));
}

/**
 * Range-based candle fetch backing the TradingView Datafeed API `getBars`.
 * Unlike `getCandles` (which serves a fixed latest window for the interim
 * chart) this pages backwards via `before` so the library can lazily load
 * deep history, and can return market-cap-valued candles using the SAME pinned
 * supply as everything else - guaranteeing MC consistency across timeframes.
 */
export async function getCandleRange(
  params: CandleRangeParams,
): Promise<CandleRangeResponse | null> {
  diagnostics.requests += 1;
  const { mint, resolution } = params;
  const cfg = RESOLUTION_CONFIG[resolution];
  const marketCapWanted = params.marketCap === true;
  const before = params.before && params.before > 0 ? Math.floor(params.before) : undefined;
  const limit = Math.min(
    cfg.limit,
    Math.max(50, params.countBack ? params.countBack + 10 : cfg.limit),
  );

  const pool = await resolvePool(mint);
  if (!pool) return null;

  const key = `range:${resolution}:${mint}:${before ?? "now"}:${limit}`;
  let priceCandles: Candle[] | null = null;
  const cached = rangeCache.get(key);
  if (cached && Date.now() - cached.at < cfg.ttlMs) {
    diagnostics.cacheHits += 1;
    priceCandles = cached.candles;
  } else {
    priceCandles = await fetchPoolCandles(pool.poolAddress, cfg, {
      beforeTimestamp: before,
      limit,
    });
    if (priceCandles) {
      lruSet(rangeCache, key, { candles: priceCandles, at: Date.now() }, RANGE_CACHE_MAX);
    }
  }

  if (!priceCandles || priceCandles.length === 0) {
    return {
      candles: [],
      supply: pool.supply,
      poolAddress: pool.poolAddress,
      resolution,
      marketCap: false,
      noData: true,
    };
  }

  const applyMc = marketCapWanted && pool.supply != null && pool.supply > 0;
  return {
    candles: applyMc ? toMarketCap(priceCandles, pool.supply!) : priceCandles,
    supply: pool.supply,
    poolAddress: pool.poolAddress,
    resolution,
    marketCap: applyMc,
    noData: false,
  };
}

/** Test seam: clear all candle state. */
export function __resetCandleCachesForTest(): void {
  poolCache.clear();
  candleCache.clear();
  rangeCache.clear();
  inFlight.clear();
  logger.debug("candle caches reset (test)");
}
