import axios from "axios";
import { getCacheValue, setCacheValue, isCacheFresh } from "./database.js";
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
}

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
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

function pickBestPair(pairs: DexPair[], mint: string): DexPair | null {
  const solanaPairs = (pairs ?? []).filter(
    (p) =>
      p.chainId === "solana" &&
      p.baseToken?.address?.toLowerCase() === mint.toLowerCase(),
  );
  if (solanaPairs.length === 0) return null;
  return solanaPairs.sort(
    (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
  )[0];
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

/** Current price in SOL for a mint (used by trade execution / position valuation). */
export async function getTokenPriceSol(mint: string): Promise<number | null> {
  const bonding = pumpportal.getBondingPrice(mint);
  if (bonding) return bonding.priceSol;
  const info = await getTokenInfo(mint);
  return info && info.priceSol > 0 ? info.priceSol : null;
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
      const existing = byMint.get(addr);
      if (!existing || (p.liquidity?.usd ?? 0) > (existing.liquidity?.usd ?? 0)) {
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

// ── Market status tracking ────────────────────────────────────────────────
let lastTrendingUpdate: number | null = null;
let trendingTokenCount = 0;

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
 * Exclude tokens that are effectively dead: no symbol/name, no price, no
 * market cap, or insufficient liquidity (< $200).
 */
function isDeadToken(t: MarketToken): boolean {
  if (!t.symbol || !t.name) return true;
  if (t.priceUsd == null || t.priceUsd === 0) return true;
  if (t.marketCapUsd == null) return true;
  if (t.liquidityUsd == null || t.liquidityUsd < 200) return true;
  return false;
}

/**
 * Trending Solana tokens. Merges "latest" boosts (fresh activity) with "top"
 * boosts (sustained momentum), hydrates via DexScreener pair stats, then
 * filters dead tokens. Result is cached 60 s.
 */
export async function getTrendingTokens(): Promise<MarketToken[]> {
  const key = "market_trending";
  if (isCacheFresh(key, 60 * 1000)) {
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
        const existing = byMint.get(addr);
        if (!existing || (p.liquidity?.usd ?? 0) > (existing.liquidity?.usd ?? 0)) {
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
