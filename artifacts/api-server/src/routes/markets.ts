import { Router, type IRouter } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  getTrendingTokens,
  forceRefreshTrending,
  getMarketStatus,
  getTokenStatsBatch,
  getSolPriceUsd,
  type MarketToken,
} from "../lib/prices.js";
import { pumpportal } from "../lib/pumpportal.js";

const router: IRouter = Router();

/** Max tokens returned per feed — keeps mobile lists fast and bounded. */
const FEED_LIMIT = 50;

/** Drop any repeated mints so a token never appears twice in one list. */
function dedupe(tokens: MarketToken[]): MarketToken[] {
  const seen = new Set<string>();
  const out: MarketToken[] = [];
  for (const t of tokens) {
    if (!t.mint || seen.has(t.mint)) continue;
    seen.add(t.mint);
    out.push(t);
  }
  return out;
}

// All three list feeds share one cached upstream fetch (getTrendingTokens,
// TRENDING_CACHE_MS / 30s cache) but each derives a genuinely distinct ranking
// so the tabs don't mirror each other:
//   • trending → most active right now (24h transaction count)
//   • gainers  → biggest positive 24h price movers
//   • volume   → highest 24h USD volume
/** Attach feed freshness (when the upstream feed was last fetched) so the
 *  Markets page can render a "Last Updated" timestamp without a second call. */
function withFreshness(tokens: MarketToken[]) {
  const status = getMarketStatus();
  return {
    tokens: tokens.slice(0, FEED_LIMIT),
    lastUpdated: status.lastUpdated,
    cacheAge: status.cacheAge,
  };
}

router.get(
  "/markets/trending",
  asyncHandler(async (_req, res) => {
    const tokens = dedupe(await getTrendingTokens());
    const sorted = [...tokens].sort(
      (a, b) => (b.txns24h ?? 0) - (a.txns24h ?? 0),
    );
    return res.json(withFreshness(sorted));
  }),
);

router.get(
  "/markets/gainers",
  asyncHandler(async (_req, res) => {
    const tokens = dedupe(await getTrendingTokens());
    const sorted = tokens
      .filter((t) => (t.priceChange24h ?? 0) > 0)
      .sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0));
    return res.json(withFreshness(sorted));
  }),
);

router.get(
  "/markets/volume",
  asyncHandler(async (_req, res) => {
    const tokens = dedupe(await getTrendingTokens());
    const sorted = tokens
      .filter((t) => (t.volume24hUsd ?? 0) > 0)
      .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
    return res.json(withFreshness(sorted));
  }),
);

/**
 * Manual refresh for the Markets page. Bypasses the trending cache (refetches
 * upstream) and clears the migrated-feed cache so the user always gets fresh
 * listings on demand. There is no background worker — refresh only happens here
 * or when a feed cache naturally expires on page open.
 */
router.post(
  "/markets/refresh",
  asyncHandler(async (_req, res) => {
    migratedCache = null;
    await forceRefreshTrending();
    return res.json(getMarketStatus());
  }),
);

router.get(
  "/markets/new",
  asyncHandler((_req, res) => {
    return res.json({ tokens: pumpportal.getNewTokens(40) });
  }),
);

/**
 * Recently migrated (graduated to Raydium) tokens, hydrated with DexScreener
 * stats so the Markets "Just Migrated" feed can show market cap, liquidity and
 * volume alongside time-since-migration. Hydration is best-effort and cached
 * briefly so rapid client polling doesn't hammer DexScreener.
 */
interface MigratedToken {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  migratedAt: number;
  priceUsd: number | null;
  priceChange24h: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
}

let migratedCache: { at: number; tokens: MigratedToken[] } | null = null;
const MIGRATED_CACHE_MS = 20_000;

router.get(
  "/markets/migrated",
  asyncHandler(async (_req, res) => {
    if (migratedCache && Date.now() - migratedCache.at < MIGRATED_CACHE_MS) {
      return res.json({
        tokens: migratedCache.tokens,
        connected: pumpportal.isConnected(),
      });
    }

    const events = pumpportal.getMigrations(40);
    const stats = await getTokenStatsBatch(events.map((e) => e.mint));

    const tokens: MigratedToken[] = events.map((e) => {
      const s = stats.get(e.mint);
      return {
        mint: e.mint,
        name: s?.name ?? e.name ?? null,
        symbol: s?.symbol ?? e.symbol ?? null,
        logo: s?.logo ?? null,
        migratedAt: e.migratedAt,
        priceUsd: s?.priceUsd ?? null,
        priceChange24h: s?.priceChange24h ?? null,
        marketCapUsd: s?.marketCapUsd ?? null,
        liquidityUsd: s?.liquidityUsd ?? null,
        volume24hUsd: s?.volume24hUsd ?? null,
      };
    });

    migratedCache = { at: Date.now(), tokens };
    return res.json({ tokens, connected: pumpportal.isConnected() });
  }),
);

router.get(
  "/markets/status",
  asyncHandler((_req, res) => {
    return res.json(getMarketStatus());
  }),
);

/**
 * The current SOL/USD rate (cached 30s upstream). Lets any page render USD
 * values even when it has no positions/trades to derive a rate from — needed
 * because USD is the default display currency app-wide.
 */
router.get(
  "/markets/sol-price",
  asyncHandler(async (_req, res) => {
    return res.json({ solUsd: await getSolPriceUsd() });
  }),
);

export default router;
