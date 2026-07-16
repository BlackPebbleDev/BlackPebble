import axios from "axios";
import {
  getCacheValue,
  setCacheValue,
  isCacheFresh,
  deleteCacheValue,
} from "./database.js";
import { pumpportal } from "./pumpportal.js";
import { recordPriceSnapshot } from "./priceHistory.js";
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
  /** Pair creation time (ms epoch) - used to render token age. */
  pairCreatedAt?: number | null;
  volume6hUsd?: number | null;
  volume1hUsd?: number | null;
  /** Token identity links from DexScreener (display-only). */
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  telegramUrl?: string | null;
  /** Banner / header image URL from DexScreener (display-only, optional). */
  bannerUrl?: string | null;
  /** DEX identifier from DexScreener (e.g. "raydium", "meteora", "orca") - display-only. */
  dexId?: string | null;
}

interface DexPair {
  chainId: string;
  dexId?: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken?: { address: string; name?: string; symbol?: string };
  priceNative: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  pairCreatedAt?: number;
  marketCap?: number;
  fdv?: number;
  info?: {
    imageUrl?: string;
    /** Banner / header image URL - shown as background art on the token card. */
    header?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
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

// Short in-memory cache for the per-mint DexScreener pair. This is the shared
// "live market data layer": clients can poll active tokens aggressively (every
// few seconds) while external API load stays bounded - concurrent reads for the
// same mint within the TTL collapse to a single upstream fetch. On a fetch
// failure we serve the last-known-good pair rather than null so position values
// never wipe to zero on a transient blip.
const DEX_PAIR_CACHE_MS = 3000;
const DEX_PAIR_CACHE_MAX = 1000;
const dexPairCache = new Map<string, { pair: DexPair | null; ts: number }>();
// Singleflight: collapse concurrent cache-misses for the same mint into one
// upstream request so a burst of aggressive client polls can't fan out into a
// burst of DexScreener calls.
const dexPairInflight = new Map<string, Promise<DexPair | null>>();

async function fetchDexScreener(mint: string): Promise<DexPair | null> {
  const cached = dexPairCache.get(mint);
  if (cached && Date.now() - cached.ts < DEX_PAIR_CACHE_MS) {
    return cached.pair;
  }
  // If a fetch for this mint is already in flight, await it instead of starting
  // a second one.
  const inflight = dexPairInflight.get(mint);
  if (inflight) return inflight;

  const fetchPromise = (async (): Promise<DexPair | null> => {
    try {
      const res = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
        { timeout: 8000 },
      );
      const pair = pickBestPair(res.data?.pairs ?? [], mint);
      // Bound the map: drop the oldest insertion when we hit the cap.
      if (dexPairCache.size >= DEX_PAIR_CACHE_MAX) {
        const oldest = dexPairCache.keys().next().value;
        if (oldest !== undefined) dexPairCache.delete(oldest);
      }
      dexPairCache.set(mint, { pair, ts: Date.now() });
      return pair;
    } catch (e) {
      logger.warn({ err: e, mint }, "DexScreener fetch failed");
      // Last-known-good on transient failure.
      if (cached) return cached.pair;
      return null;
    } finally {
      dexPairInflight.delete(mint);
    }
  })();

  dexPairInflight.set(mint, fetchPromise);
  return fetchPromise;
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
    // Feed the sparkline snapshot store (L5) from a price we already fetched.
    if (priceUsd != null) {
      recordPriceSnapshot(mint, priceUsd, dex.marketCap ?? dex.fdv ?? null);
    }
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
      websiteUrl: dex.info?.websites?.[0]?.url ?? null,
      twitterUrl:
        dex.info?.socials?.find((s) => s.type === "twitter")?.url ?? null,
      telegramUrl:
        dex.info?.socials?.find((s) => s.type === "telegram")?.url ?? null,
      bannerUrl: dex.info?.header ?? null,
      dexId: dex.dexId ?? null,
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
  // ── Trending-quality signals (all already present in the DexScreener pair we
  //    fetch; surfaced so the trending ranker can score momentum + buy pressure
  //    without any extra upstream calls). All optional / display-only. ──
  buys24h?: number | null;
  sells24h?: number | null;
  buys1h?: number | null;
  sells1h?: number | null;
  volume6hUsd?: number | null;
  volume1hUsd?: number | null;
  pairCreatedAt?: number | null;
  /** Server-computed trending score (0..100). Higher = hotter right now. */
  trendingScore?: number | null;
  /**
   * True circulating market cap (DexScreener pair.marketCap only), null when the
   * upstream did not provide one. Kept SEPARATE from `marketCapUsd` (which falls
   * back to FDV) so callers can avoid silently presenting FDV as market cap.
   */
  trueMarketCapUsd?: number | null;
  /** Fully-diluted valuation (DexScreener pair.fdv only), null when absent. */
  fdvUsd?: number | null;
}

function pairToMarketToken(p: DexPair): MarketToken {
  const base = pairToSearchResult(p);
  const h24 = p.txns?.h24;
  const h1 = p.txns?.h1;
  // Feed the sparkline snapshot store (L5) from the trending price we already have.
  if (base.priceUsd != null) {
    recordPriceSnapshot(base.mint, base.priceUsd, base.marketCapUsd);
  }
  return {
    ...base,
    txns24h: h24 ? (h24.buys ?? 0) + (h24.sells ?? 0) : null,
    buys24h: h24?.buys ?? null,
    sells24h: h24?.sells ?? null,
    buys1h: h1?.buys ?? null,
    sells1h: h1?.sells ?? null,
    volume6hUsd: p.volume?.h6 ?? null,
    volume1hUsd: p.volume?.h1 ?? null,
    pairCreatedAt: p.pairCreatedAt ?? null,
    trueMarketCapUsd: p.marketCap ?? null,
    fdvUsd: p.fdv ?? null,
  };
}

/** Result of a status-aware token-stats batch lookup. */
export interface TokenStatsBatchResult {
  stats: Map<string, MarketToken>;
  /**
   * Whether EVERY upstream chunk request succeeded. When false, the batch hit a
   * transport-level failure (outage/timeout) for at least one chunk, so a mint
   * being absent from `stats` does NOT prove it has no market - callers that
   * make trust decisions must treat absent mints as UNKNOWN, not "no market".
   */
  ok: boolean;
}

/**
 * Hydrate a set of mints into MarketToken stats (price, market cap, liquidity,
 * volume) via the DexScreener batch tokens endpoint, while reporting whether the
 * upstream lookup actually succeeded. Best-effort for data, but `ok` lets
 * trust-sensitive callers (e.g. wallet-cleanup risk classification) distinguish
 * a genuine "no market" from a transient outage.
 */
export async function getTokenStatsBatchWithStatus(
  mints: string[],
): Promise<TokenStatsBatchResult> {
  const out = new Map<string, MarketToken>();
  const unique = [...new Set(mints.filter(Boolean))];
  if (unique.length === 0) return { stats: out, ok: true };

  let ok = true;
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
      // A swallowed chunk failure must still surface via `ok` so callers don't
      // mistake an outage for an authoritative empty result.
      ok = false;
      logger.warn({ err: e }, "Token stats batch fetch failed");
    }
  }
  return { stats: out, ok };
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
  const { stats } = await getTokenStatsBatchWithStatus(mints);
  return stats;
}

/**
 * Resolve each mint to the address of its best (trusted-quote) DexScreener pool.
 * On Solana a DexScreener `pairAddress` IS the on-chain AMM pool account, which
 * is the same address GeckoTerminal uses for its OHLCV endpoint - so this lets
 * the sparkline read its history from the SAME pool that prices/MC come from
 * (via the shared `isBetterPair` selection), keeping them consistent. Best
 * effort: mints with no usable Solana pair simply won't appear in the map.
 */
/**
 * The trusted-quote best pair for a mint, reduced to exactly what the sparkline
 * resolver needs: the pool address (for GeckoTerminal OHLCV), the current price,
 * the market cap, and the multi-window price-change percentages (for deriving a
 * coarse real series). Exposed instead of the internal `DexPair` so callers
 * don't depend on the full upstream shape.
 */
export interface MintPair {
  poolAddress: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  priceChange: { m5?: number; h1?: number; h6?: number; h24?: number };
}

/**
 * Resolve a set of mints to their trusted-quote best pair (batched, 30/request).
 * One DexScreener call per chunk yields the pool address AND the price/MC/change
 * fields - so the sparkline resolver gets both its OHLCV pool (L2) and its
 * DexScreener-derived series (L3) from a single batched lookup, adding no extra
 * upstream load. Every observed price is also fed into the snapshot store (L5).
 */
export async function getBestPairs(
  mints: string[],
): Promise<Map<string, MintPair>> {
  const out = new Map<string, MintPair>();
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
        if (out.has(addr)) continue;
        const priceUsd = p.priceUsd ? Number(p.priceUsd) : null;
        const marketCapUsd = p.marketCap ?? p.fdv ?? null;
        if (priceUsd != null && Number.isFinite(priceUsd)) {
          recordPriceSnapshot(addr, priceUsd, marketCapUsd);
        }
        out.set(addr, {
          poolAddress: p.pairAddress,
          priceUsd: priceUsd != null && Number.isFinite(priceUsd) ? priceUsd : null,
          marketCapUsd,
          priceChange: p.priceChange ?? {},
        });
      }
    } catch (e) {
      logger.warn({ err: e }, "Best-pair batch fetch failed");
    }
  }
  return out;
}

/**
 * Back-compat thin wrapper: mint → pool address only. Retained for callers that
 * just need the OHLCV pool; new code should prefer `getBestPairs`.
 */
export async function getBestPairAddresses(
  mints: string[],
): Promise<Map<string, string>> {
  const pairs = await getBestPairs(mints);
  const out = new Map<string, string>();
  for (const [mint, p] of pairs) out.set(mint, p.poolAddress);
  return out;
}

/**
 * Reconstruct a coarse but REAL close-price series from a pair's current price
 * and its multi-window percentage changes (sparkline fallback level L3). For a
 * window whose change is `pct`, the price `t` ago was `price / (1 + pct/100)`;
 * stitched oldest→newest this yields anchors at ~24h, 6h, 1h, 5m ago and now.
 * Returns null when fewer than three anchors are available (too thin to draw a
 * meaningful shape - let the next fallback level handle it).
 */
export function deriveSeriesFromPair(pair: MintPair): number[] | null {
  const price = pair.priceUsd;
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const pc = pair.priceChange ?? {};
  const series: number[] = [];
  const anchor = (pct?: number) => {
    if (typeof pct === "number" && Number.isFinite(pct) && 1 + pct / 100 > 0) {
      series.push(price / (1 + pct / 100));
    }
  };
  anchor(pc.h24);
  anchor(pc.h6);
  anchor(pc.h1);
  anchor(pc.m5);
  series.push(price);
  return series.length >= 3 ? series : null;
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
 * volatile memecoins still pass - only pairs that are effectively dead or have
 * had their liquidity pulled are dropped.
 */
const MIN_LIQUIDITY_USD = 500;
const MIN_VOLUME_24H_USD = 250;

/**
 * Exclude tokens that are effectively dead or rugged:
 *  - missing symbol/name, price, or market cap,
 *  - extremely low liquidity - this also catches collapsed-liquidity rugs whose
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

// ── "Hot right now" trending ranker ─────────────────────────────────────────
// The Markets "Trending" tab and the Feed "Hot Tokens" rail must read like a
// credible read on what serious traders are actually piling into RIGHT NOW —
// not "whatever paid for a boost and once had volume". Volume alone is a bad
// signal: a token can post huge 24h volume that has entirely rolled over into
// sells (a dying pump). So we (1) apply stricter quality FLOORS than the base
// dead-token filter to drop dead/rug/micro-cap noise, then (2) SCORE the
// survivors on the signals the big platforms weight — recent momentum, buy
// pressure, transaction breadth, liquidity health and bounded price action.
// Every signal comes from the DexScreener pair we already fetched, so ranking
// is effectively free (no extra upstream calls). Unique makers / holder growth
// (which DexScreener/Pump.fun weight heavily) aren't in our data, so buy/sell
// balance + txn breadth stand in as the "organic interest" proxy.

/** Stricter floors for the trending/hot list — kills the embarrassing micro-cap
 *  corpses that clear the base dead-token bar but nobody would call "hot". */
const TRENDING_MIN_LIQUIDITY_USD = 15_000;
const TRENDING_MIN_VOLUME_24H_USD = 10_000;
const TRENDING_MIN_MARKET_CAP_USD = 50_000;
/** A 24h book more than ~70% sells is a token being dumped, not a hot one. */
const TRENDING_MIN_BUY_RATIO = 0.3;

/** 24h buy pressure in 0..1 (buys / total txns), or null when unknown. */
function buyRatio24h(t: MarketToken): number | null {
  const buys = t.buys24h;
  const sells = t.sells24h;
  if (buys == null || sells == null) return null;
  const total = buys + sells;
  if (total <= 0) return null;
  return buys / total;
}

/**
 * Whether a token is credible enough to appear in the trending/hot list. Beyond
 * the base dead-token bar this requires real market cap + liquidity + volume,
 * that it isn't a stale pair (no recent volume while posting 24h volume), and
 * that it isn't overwhelmingly being sold off.
 */
export function passesTrendingFloor(t: MarketToken): boolean {
  if (isDeadToken(t)) return false;
  if ((t.marketCapUsd ?? 0) < TRENDING_MIN_MARKET_CAP_USD) return false;
  if ((t.liquidityUsd ?? 0) < TRENDING_MIN_LIQUIDITY_USD) return false;
  if ((t.volume24hUsd ?? 0) < TRENDING_MIN_VOLUME_24H_USD) return false;
  // Stale/dead: reports 24h volume but has gone quiet across the last 6h.
  if (
    t.volume1hUsd != null &&
    t.volume6hUsd != null &&
    t.volume1hUsd <= 0 &&
    t.volume6hUsd <= 0
  ) {
    return false;
  }
  // Sell-dominated: mostly exits, so not "hot" in any real sense.
  const ratio = buyRatio24h(t);
  if (ratio != null && ratio < TRENDING_MIN_BUY_RATIO) return false;
  return true;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Trending score in 0..100 for a token that already cleared the floor. Weighted
 * blend of the signals the major platforms rank on:
 *  - momentum/velocity 32% — recent hourly trade rate vs the 24h baseline
 *    (acceleration is what "trending" really means),
 *  - buy pressure 24% — recent buys / total (real demand, not a dump),
 *  - txn breadth 18% — log-scaled 24h transaction count (proxy for wide interest),
 *  - liquidity health 14% — log-scaled liquidity (deep enough to be real),
 *  - price action 12% — bounded 24h change (reward up-moves, cap blow-off spikes).
 */
export function scoreTrending(t: MarketToken): number {
  const vol24 = t.volume24hUsd ?? 0;

  // 1) Momentum: recent hourly volume rate ÷ 24h average hourly rate. >1 means
  //    it's heating up. Prefer the 1h window; fall back to 6h; neutral if blind.
  let momentum = 0.3;
  if (vol24 > 0) {
    const baseHourly = vol24 / 24;
    if (t.volume1hUsd != null) {
      momentum = clamp01(t.volume1hUsd / baseHourly / 3);
    } else if (t.volume6hUsd != null) {
      momentum = clamp01(t.volume6hUsd / 6 / baseHourly / 3);
    }
  }

  // 2) Buy pressure: prefer the 1h book, fall back to 24h, neutral if unknown.
  let buyPressure = 0.5;
  const b1 = t.buys1h;
  const s1 = t.sells1h;
  if (b1 != null && s1 != null && b1 + s1 > 0) {
    buyPressure = b1 / (b1 + s1);
  } else {
    const r = buyRatio24h(t);
    if (r != null) buyPressure = r;
  }

  // 3) Transaction breadth: log-scaled toward ~5k txns/24h (Solana-competitive).
  const txns = t.txns24h ?? 0;
  const breadth = clamp01(Math.log10(txns + 1) / Math.log10(5000));

  // 4) Liquidity health: log-scaled toward ~$250k (deep, not necessarily huge).
  const liq = t.liquidityUsd ?? 0;
  const liquidity = liq > 0 ? clamp01(Math.log10(liq) / Math.log10(250_000)) : 0;

  // 5) Price action: flat = 0.5, +100% → 1, −50% → 0. Positive favoured, spikes capped.
  const pc = t.priceChange24h ?? 0;
  const price =
    pc >= 0 ? clamp01(0.5 + Math.min(pc / 200, 0.5)) : clamp01(0.5 + pc / 100);

  const score =
    0.32 * momentum +
    0.24 * buyPressure +
    0.18 * breadth +
    0.14 * liquidity +
    0.12 * price;
  return Math.round(score * 1000) / 10;
}

/**
 * The ranked trending/hot list: dead + micro-cap + sell-dominated tokens
 * filtered out, survivors scored and sorted hottest-first, each tagged with its
 * `trendingScore`. Reads the same 30s-cached candidate set as everything else,
 * so this adds no upstream cost. Powers both the Markets "Trending" tab and the
 * Feed "Hot Tokens" rail.
 */
export async function getRankedTrendingTokens(): Promise<MarketToken[]> {
  const tokens = await getTrendingTokens();
  return tokens
    .filter(passesTrendingFloor)
    .map((t) => ({ ...t, trendingScore: scoreTrending(t) }))
    .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
}

/**
 * Trending Solana tokens. Merges "latest" boosts (fresh activity) with "top"
 * boosts (sustained momentum), hydrates via DexScreener pair stats, then
 * filters dead tokens. Result is cached for TRENDING_CACHE_MS.
 */
// Singleflight for the trending refresh so concurrent cache-misses (and
// background revalidations) collapse into ONE upstream hydration instead of
// stampeding DexScreener.
let trendingRefreshInFlight: Promise<MarketToken[]> | null = null;

function ensureTrendingRefresh(): Promise<MarketToken[]> {
  if (!trendingRefreshInFlight) {
    trendingRefreshInFlight = fetchTrendingFromUpstream().finally(() => {
      trendingRefreshInFlight = null;
    });
  }
  return trendingRefreshInFlight;
}

export async function getTrendingTokens(): Promise<MarketToken[]> {
  const key = "market_trending";
  const parseCached = (raw: string | null): MarketToken[] | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MarketToken[];
    } catch {
      return null;
    }
  };

  // Fresh cache: serve immediately.
  if (isCacheFresh(key, TRENDING_CACHE_MS)) {
    const fresh = parseCached(getCacheValue(key));
    if (fresh) {
      trendingTokenCount = fresh.length;
      return fresh;
    }
  }

  // Stale-while-revalidate: if we still hold a usable list, serve it instantly
  // and refresh in the background so NO user request pays the multi-second
  // hydration cost. Only block on the network when we have nothing to show.
  const stale = parseCached(getCacheValue(key));
  if (stale && stale.length > 0) {
    trendingTokenCount = stale.length;
    void ensureTrendingRefresh();
    return stale;
  }

  // Cold start: no usable cache, so fetch synchronously (singleflight).
  return ensureTrendingRefresh();
}

async function fetchTrendingFromUpstream(): Promise<MarketToken[]> {
  const key = "market_trending";
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
    // Never overwrite a good feed with an empty one: if upstream hiccupped and
    // yielded nothing but we still hold a cached list, keep serving that. This
    // is what stops the page from flashing "No tokens available" on a blip.
    if (live.length === 0) {
      try {
        const prev = getCacheValue(key);
        if (prev) {
          const cached = JSON.parse(prev) as MarketToken[];
          if (cached.length > 0) {
            trendingTokenCount = cached.length;
            return cached;
          }
        }
      } catch {
        // fall through and cache the empty result below
      }
    }
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
