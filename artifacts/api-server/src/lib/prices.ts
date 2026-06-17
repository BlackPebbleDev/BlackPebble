import axios from "axios";
import {
  getCacheValue,
  setCacheValue,
  isCacheFresh,
  deleteCacheValue,
} from "./database.js";
import { pumpportal } from "./pumpportal.js";
import { logger } from "./logger.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  logo: string | null;
  priceSol: number;
  priceUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24h: number | null;
  isMigrated: boolean; // true => tradeable on a DEX (chart via DexScreener), false => bonding curve
  pairAddress: string | null;
  source: string;
  // ── Token Page V2 detail fields (optional, display-only) ──
  // Populated from the DexScreener pair when available; null/undefined for
  // bonding-curve or Jupiter-sourced tokens. None of these feed trade math.
  buys24h?: number | null;
  sells24h?: number | null;
  /** Pair creation time (ms epoch) — used to render token age. */
  pairCreatedAt?: number | null;
  volume6hUsd?: number | null;
  volume1hUsd?: number | null;
}

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken?: { address: string; name?: string; symbol?: string };
  priceNative: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { h24?: number };
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  pairCreatedAt?: number;
  marketCap?: number;
  fdv?: number;
  info?: { imageUrl?: string };
}

function isLikelyMint(q: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q.trim());
}

/** SOL price in USD, cached 30s, with last-known fallback. */
export async function getSolPriceUsd(): Promise<number> {
  const key = "sol_usd";
  if (isCacheFresh(key, 30 * 1000)) {
    const v = getCacheValue(key);
    if (v) return Number(v);
  }
  try {
    const res = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`,
      { timeout: 8000 },
    );
    const pairs: DexPair[] = res.data?.pairs ?? [];
    const best = pairs
      .filter((p) => p.priceUsd && Number(p.priceUsd) > 0)
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (best?.priceUsd) {
      const price = Number(best.priceUsd);
      setCacheValue(key, String(price));
      return price;
    }
  } catch (e) {
    logger.warn({ err: e }, "SOL price fetch failed");
  }
  const last = getCacheValue(key);
  return last ? Number(last) : 0;
}

/**
 * Quote tokens we trust to value a base token correctly: wSOL, USDC, USDT.
 * A token mint can have many pools, and a manipulated pool quoted in a junk/
 * scam token reports an inflated USD price, market cap and an impossible 24h
 * change (this is what made established tokens like USELESS/FARTCOIN show
 * +520,000% with a ~1000× price). We therefore always prefer a trusted-quote
 * pool over an untrusted one, regardless of reported liquidity.
 */
const TRUSTED_QUOTE_MINTS = new Set<string>([
  SOL_MINT,
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

/** A trusted-quote pool must still hold real liquidity to be preferred, so a
 *  dead/empty trusted pool never wins over a deep, active untrusted one. */
const MIN_TRUSTED_LIQUIDITY_USD = 1_000;

/** Upstream percentages beyond this are treated as corrupt market data. */
export const PERCENT_SANITY_CEILING = 100_000;

/** 1 when the pair is quoted in a trusted token AND holds real liquidity. */
function trustedScore(p: DexPair): number {
  return TRUSTED_QUOTE_MINTS.has(p.quoteToken?.address ?? "") &&
    (p.liquidity?.usd ?? 0) >= MIN_TRUSTED_LIQUIDITY_USD
    ? 1
    : 0;
}

/**
 * Rank two pools for the same base token. A trusted-quote pool always ranks
 * above an untrusted one; deepest liquidity then breaks the tie. Returns <0
 * when `a` should rank before `b`.
 */
function comparePairs(a: DexPair, b: DexPair): number {
  const t = trustedScore(b) - trustedScore(a);
  if (t !== 0) return t;
  return (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0);
}

/** True when candidate `p` should replace the currently-kept `existing` pair. */
function isBetterPair(p: DexPair, existing: DexPair | undefined): boolean {
  return !existing || comparePairs(p, existing) < 0;
}

function pickBestPair(pairs: DexPair[], mint: string): DexPair | null {
  const solanaPairs = (pairs ?? []).filter(
    (p) =>
      p.chainId === "solana" &&
      p.baseToken?.address?.toLowerCase() === mint.toLowerCase(),
  );
  if (solanaPairs.length === 0) return null;
  return [...solanaPairs].sort(comparePairs)[0];
}

async function fetchDexScreener(mint: string): Promise<DexPair | null> {
  try {
    const res = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { timeout: 8000 },
    );
    return pickBestPair(res.data?.pairs ?? [], mint);
  } catch (e) {
    logger.warn({ err: e, mint }, "DexScreener fetch failed");
    return null;
  }
}

async function fetchJupiterUsd(mint: string): Promise<number | null> {
  try {
    const res = await axios.get(
      `https://lite-api.jup.ag/price/v2?ids=${mint}`,
      { timeout: 8000 },
    );
    const price = res.data?.data?.[mint]?.price;
    return price ? Number(price) : null;
  } catch {
    return null;
  }
}

/**
 * Full token info for the trading desk. Strategy:
 * 1. DexScreener (migrated tokens have a DEX pair -> price, chart, stats).
 * 2. PumpPortal bonding-curve price (pre-migration tokens).
 * 3. Jupiter USD price as a last resort.
 */
export async function getTokenInfo(mint: string): Promise<TokenInfo | null> {
  const solUsd = await getSolPriceUsd();
  const dex = await fetchDexScreener(mint);

  if (dex) {
    const priceUsd = dex.priceUsd ? Number(dex.priceUsd) : null;
    const priceSol = Number(dex.priceNative) || (priceUsd && solUsd ? priceUsd / solUsd : 0);
    return {
      mint,
      name: dex.baseToken?.name || mint.slice(0, 6),
      symbol: (dex.baseToken?.symbol || "").toUpperCase(),
      logo: dex.info?.imageUrl ?? null,
      priceSol,
      priceUsd,
      marketCapUsd: dex.marketCap ?? dex.fdv ?? null,
      liquidityUsd: dex.liquidity?.usd ?? null,
      volume24hUsd: dex.volume?.h24 ?? null,
      priceChange24h: dex.priceChange?.h24 ?? null,
      isMigrated: true,
      pairAddress: dex.pairAddress,
      source: "dexscreener",
      buys24h: dex.txns?.h24?.buys ?? null,
      sells24h: dex.txns?.h24?.sells ?? null,
      pairCreatedAt: dex.pairCreatedAt ?? null,
      volume6hUsd: dex.volume?.h6 ?? null,
      volume1hUsd: dex.volume?.h1 ?? null,
    };
  }

  const bonding = pumpportal.getBondingPrice(mint);
  if (bonding) {
    const priceUsd = solUsd ? bonding.priceSol * solUsd : null;
    return {
      mint,
      name: mint.slice(0, 6),
      symbol: "",
      logo: null,
      priceSol: bonding.priceSol,
      priceUsd,
      marketCapUsd: solUsd ? bonding.marketCapSol * solUsd : null,
      liquidityUsd: solUsd ? bonding.vSol * 2 * solUsd : null,
      volume24hUsd: null,
      priceChange24h: null,
      isMigrated: false,
      pairAddress: null,
      source: "pumpportal",
    };
  }

  const jupUsd = await fetchJupiterUsd(mint);
  if (jupUsd && solUsd) {
    return {
      mint,
      name: mint.slice(0, 6),
      symbol: "",
      logo: null,
      priceSol: jupUsd / solUsd,
      priceUsd: jupUsd,
      marketCapUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24h: null,
      isMigrated: true,
      pairAddress: null,
      source: "jupiter",
    };
  }

  return null;
}

export interface ExecutionPrice {
  /** Token price in SOL, derived from priceUsd/solUsd so it stays consistent. */
  priceSol: number;
  /** Trusted token price in USD (the anchor for all quantity math). */
  priceUsd: number;
  /** SOL/USD price used for the conversion. */
  solUsd: number;
  /** Pool liquidity in USD at execution time, used for slippage simulation. */
  liquidityUsd: number | null;
  /** Market cap (USD), DexScreener pair.marketCap ?? fdv. Display-only. */
  marketCapUsd: number | null;
  source: string;
  pair: string | null;
}

/**
 * Trusted price for trade execution and position valuation.
 *
 * Anchored on the USD price from the same source hierarchy the UI displays
 * (DexScreener pair priceUsd -> PumpPortal bonding curve -> Jupiter), NEVER on
 * market cap, FDV, or any formatted/displayed value. priceSol is derived from
 * priceUsd / solUsd so the SOL cost basis and the USD-based token quantity stay
 * perfectly consistent. Returns null when no valid, positive USD price (or SOL
 * price) is available, so callers can block the trade instead of guessing.
 */
// A trade may not be sized off a SOL/USD conversion rate older than this. The
// token's own USD price is fetched live from DexScreener/Jupiter on every call
// (so it is inherently fresh), and the PumpPortal bonding price self-expires
// after 10 min; the only value with an open-ended last-known fallback is the
// cached SOL/USD price, so that is what we freshness-check here.
const SOL_PRICE_MAX_AGE_MS = 120 * 1000;

export async function getExecutionPrice(
  mint: string,
): Promise<ExecutionPrice | null> {
  const info = await getTokenInfo(mint);
  const solUsd = await getSolPriceUsd();
  if (!info) return null;
  const priceUsd = info.priceUsd;
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    return null;
  }
  if (!Number.isFinite(solUsd) || solUsd <= 0) return null;
  // Stale guard: reject when the SOL/USD price is a stale last-known fallback.
  if (!isCacheFresh("sol_usd", SOL_PRICE_MAX_AGE_MS)) return null;
  const priceSol = priceUsd / solUsd;
  if (!Number.isFinite(priceSol) || priceSol <= 0) return null;
  return {
    priceSol,
    priceUsd,
    solUsd,
    liquidityUsd: info.liquidityUsd,
    marketCapUsd: info.marketCapUsd,
    source: info.source,
    pair: info.pairAddress,
  };
}

/** Current price in SOL for a mint (used by position valuation). */
export async function getTokenPriceSol(mint: string): Promise<number | null> {
  const px = await getExecutionPrice(mint);
  return px ? px.priceSol : null;
}

export interface SearchResult {
  mint: string;
  name: string;
  symbol: string;
  logo: string | null;
  priceUsd: number | null;
  priceSol: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  priceChange24h: number | null;
  isMigrated: boolean;
}

function pairToSearchResult(p: DexPair): SearchResult {
  return {
    mint: p.baseToken.address,
    name: p.baseToken.name,
    symbol: (p.baseToken.symbol || "").toUpperCase(),
    logo: p.info?.imageUrl ?? null,
    priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
    priceSol: Number(p.priceNative) || null,
    liquidityUsd: p.liquidity?.usd ?? null,
    volume24hUsd: p.volume?.h24 ?? null,
    marketCapUsd: p.marketCap ?? p.fdv ?? null,
    priceChange24h: p.priceChange?.h24 ?? null,
    isMigrated: true,
  };
}

/** Search tokens by name/symbol or resolve a direct mint address. */
export async function searchTokens(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  if (isLikelyMint(q)) {
    const dex = await fetchDexScreener(q);
    if (dex) return [pairToSearchResult(dex)];
    // Possibly a bonding-curve token not yet on a DEX.
    const info = await getTokenInfo(q);
    if (info) {
      return [
        {
          mint: info.mint,
          name: info.name,
          symbol: info.symbol,
          logo: info.logo,
          priceUsd: info.priceUsd,
          priceSol: info.priceSol,
          liquidityUsd: info.liquidityUsd,
          volume24hUsd: info.volume24hUsd,
          marketCapUsd: info.marketCapUsd,
          priceChange24h: info.priceChange24h,
          isMigrated: info.isMigrated,
        },
      ];
    }
    return [];
  }

  try {
    const res = await axios.get(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
      { timeout: 8000 },
    );
    const pairs: DexPair[] = (res.data?.pairs ?? []).filter(
      (p: DexPair) => p.chainId === "solana",
    );
    const byMint = new Map<string, DexPair>();
    for (const p of pairs) {
      const addr = p.baseToken?.address;
      if (!addr) continue;
      if (isBetterPair(p, byMint.get(addr))) {
        byMint.set(addr, p);
      }
    }
    return Array.from(byMint.values())
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
      .slice(0, 20)
      .map(pairToSearchResult);
  } catch (e) {
    logger.warn({ err: e, query: q }, "Token search failed");
    return [];
  }
}

export interface MarketToken extends SearchResult {
  txns24h: number | null;
}

function pairToMarketToken(p: DexPair & { txns?: { h24?: { buys?: number; sells?: number } } }): MarketToken {
  const base = pairToSearchResult(p);
  const txns = p.txns?.h24;
  return {
    ...base,
    txns24h: txns ? (txns.buys ?? 0) + (txns.sells ?? 0) : null,
  };
}

/**
 * Hydrate a set of mints into MarketToken stats (price, market cap, liquidity,
 * volume) via the DexScreener batch tokens endpoint. Used to enrich feeds that
 * only carry mints (e.g. recently migrated tokens). Best-effort: mints with no
 * DexScreener pair simply won't appear in the returned map.
 */
export async function getTokenStatsBatch(
  mints: string[],
): Promise<Map<string, MarketToken>> {
  const out = new Map<string, MarketToken>();
  const unique = [...new Set(mints.filter(Boolean))];
  if (unique.length === 0) return out;

  // DexScreener allows up to 30 comma-separated addresses per request.
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    try {
      const res = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
        { timeout: 8000 },
      );
      const pairs: DexPair[] = res.data?.pairs ?? [];
      // Keep the deepest-liquidity pair per mint (DexScreener may return
      // several pools for the same token).
      const bestPair = new Map<string, DexPair>();
      for (const p of pairs) {
        if (p.chainId !== "solana") continue;
        const addr = p.baseToken?.address;
        if (!addr) continue;
        if (isBetterPair(p, bestPair.get(addr))) {
          bestPair.set(addr, p);
        }
      }
      for (const [addr, p] of bestPair) {
        if (!out.has(addr)) out.set(addr, pairToMarketToken(p));
      }
    } catch (e) {
      logger.warn({ err: e }, "Token stats batch fetch failed");
    }
  }
  return out;
}

/**
 * Resolve each mint to the address of its best (trusted-quote) DexScreener pool.
 * On Solana a DexScreener `pairAddress` IS the on-chain AMM pool account, which
 * is the same address GeckoTerminal uses for its OHLCV endpoint — so this lets
 * the sparkline read its history from the SAME pool that prices/MC come from
 * (via the shared `isBetterPair` selection), keeping them consistent. Best
 * effort: mints with no usable Solana pair simply won't appear in the map.
 */
export async function getBestPairAddresses(
  mints: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(mints.filter(Boolean))];
  if (unique.length === 0) return out;

  // DexScreener allows up to 30 comma-separated addresses per request.
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    try {
      const res = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
        { timeout: 8000 },
      );
      const pairs: DexPair[] = res.data?.pairs ?? [];
      const bestPair = new Map<string, DexPair>();
      for (const p of pairs) {
        if (p.chainId !== "solana") continue;
        const addr = p.baseToken?.address;
        if (!addr || !p.pairAddress) continue;
        if (isBetterPair(p, bestPair.get(addr))) {
          bestPair.set(addr, p);
        }
      }
      for (const [addr, p] of bestPair) {
        if (!out.has(addr)) out.set(addr, p.pairAddress);
      }
    } catch (e) {
      logger.warn({ err: e }, "Best-pair address batch fetch failed");
    }
  }
  return out;
}

// ── Market status tracking ────────────────────────────────────────────────
let lastTrendingUpdate: number | null = null;
let trendingTokenCount = 0;

/**
 * How long the merged trending feed is cached before the next page-open or
 * refetch hits DexScreener again. Kept short so listings turn over quickly,
 * but long enough that rapid client polling never hammers the upstream API.
 */
export const TRENDING_CACHE_MS = 30 * 1000;

/**
 * Force a fresh trending fetch by dropping the cache then refetching.
 * Used by the admin "force refresh market cache" action and the Markets-page
 * manual Refresh button. Returns the new list.
 */
export async function forceRefreshTrending(): Promise<MarketToken[]> {
  deleteCacheValue("market_trending");
  return getTrendingTokens();
}

export function getMarketStatus(): {
  lastUpdated: number | null;
  tokenCount: number;
  pumpportalConnected: boolean;
  cacheAge: number | null;
} {
  return {
    lastUpdated: lastTrendingUpdate,
    tokenCount: trendingTokenCount,
    pumpportalConnected: pumpportal.isConnected(),
    cacheAge:
      lastTrendingUpdate != null
        ? Math.floor((Date.now() - lastTrendingUpdate) / 1000)
        : null,
  };
}

/**
 * Conservative dead/rugged-token thresholds. Tuned low so legitimately
 * volatile memecoins still pass — only pairs that are effectively dead or have
 * had their liquidity pulled are dropped.
 */
const MIN_LIQUIDITY_USD = 500;
const MIN_VOLUME_24H_USD = 250;

/**
 * Exclude tokens that are effectively dead or rugged:
 *  - missing symbol/name, price, or market cap,
 *  - extremely low liquidity — this also catches collapsed-liquidity rugs whose
 *    pool was pulled to near zero,
 *  - no meaningful recent trading volume (a stale market cap with no 24h volume
 *    is a dead pair, not a tradable one).
 * Thresholds are intentionally conservative so volatile-but-real tokens remain.
 */
function isDeadToken(t: MarketToken): boolean {
  if (!t.symbol || !t.name) return true;
  if (t.priceUsd == null || t.priceUsd === 0) return true;
  if (t.marketCapUsd == null) return true;
  if (t.liquidityUsd == null || t.liquidityUsd < MIN_LIQUIDITY_USD) return true;
  if (t.volume24hUsd == null || t.volume24hUsd < MIN_VOLUME_24H_USD) return true;
  return false;
}

/**
 * Trending Solana tokens. Merges "latest" boosts (fresh activity) with "top"
 * boosts (sustained momentum), hydrates via DexScreener pair stats, then
 * filters dead tokens. Result is cached for TRENDING_CACHE_MS.
 */
export async function getTrendingTokens(): Promise<MarketToken[]> {
  const key = "market_trending";
  if (isCacheFresh(key, TRENDING_CACHE_MS)) {
    const v = getCacheValue(key);
    if (v) {
      try {
        const cached = JSON.parse(v) as MarketToken[];
        trendingTokenCount = cached.length;
        return cached;
      } catch {
        // refetch
      }
    }
  }
  try {
    // Pull from both endpoints concurrently: latest = freshest activity,
    // top = tokens with sustained community boost spend.
    const [latestRes, topRes] = await Promise.allSettled([
      axios.get("https://api.dexscreener.com/token-boosts/latest/v1", { timeout: 8000 }),
      axios.get("https://api.dexscreener.com/token-boosts/top/v1", { timeout: 8000 }),
    ]);

    const latestData: unknown[] =
      latestRes.status === "fulfilled" ? (latestRes.value.data ?? []) : [];
    const topData: unknown[] =
      topRes.status === "fulfilled" ? (topRes.value.data ?? []) : [];

    // Interleave latest + top so the feed mixes freshness with sustained momentum.
    const seen = new Set<string>();
    const mints: string[] = [];
    const max = Math.max(latestData.length, topData.length);
    for (let i = 0; i < max && mints.length < 50; i++) {
      for (const item of [latestData[i], topData[i]]) {
        if (!item || typeof item !== "object") continue;
        const b = item as { chainId?: string; tokenAddress?: string };
        if (b.chainId !== "solana" || !b.tokenAddress) continue;
        if (!seen.has(b.tokenAddress)) {
          seen.add(b.tokenAddress);
          mints.push(b.tokenAddress);
        }
      }
    }

    const results: MarketToken[] = [];
    const resultSeen = new Set<string>();

    // DexScreener allows up to 30 comma-separated addresses per request.
    for (let i = 0; i < mints.length; i += 30) {
      const chunk = mints.slice(i, i + 30);
      const res = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
        { timeout: 8000 },
      );
      const pairs: DexPair[] = res.data?.pairs ?? [];
      const byMint = new Map<string, DexPair>();
      for (const p of pairs) {
        if (p.chainId !== "solana") continue;
        const addr = p.baseToken?.address;
        if (!addr) continue;
        if (isBetterPair(p, byMint.get(addr))) {
          byMint.set(addr, p);
        }
      }
      for (const p of byMint.values()) {
        if (resultSeen.has(p.baseToken.address)) continue;
        resultSeen.add(p.baseToken.address);
        results.push(pairToMarketToken(p));
      }
    }

    // Strip dead / incomplete tokens before caching.
    const live = results.filter((t) => !isDeadToken(t));
    setCacheValue(key, JSON.stringify(live));
    lastTrendingUpdate = Date.now();
    trendingTokenCount = live.length;
    return live;
  } catch (e) {
    logger.warn({ err: e }, "Trending fetch failed");
    const last = getCacheValue(key);
    if (last) {
      try {
        const cached = JSON.parse(last) as MarketToken[];
        trendingTokenCount = cached.length;
        return cached;
      } catch {
        // ignore
      }
    }
    return [];
  }
}
