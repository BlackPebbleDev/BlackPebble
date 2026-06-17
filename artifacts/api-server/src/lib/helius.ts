import axios from "axios";
import { getCacheValue, setCacheValue, isCacheFresh } from "./database.js";
import { logger } from "./logger.js";

const HELIUS_API_KEY = process.env["HELIUS_API_KEY"] || "";

export function heliusRpcUrl(): string {
  return `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
}

export function hasHelius(): boolean {
  return Boolean(HELIUS_API_KEY);
}

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  logo: string | null;
}

const META_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch token metadata (name, symbol, logo) via the Helius DAS getAsset method.
 * Cached for an hour. Returns a best-effort object even on failure.
 */
export async function getTokenMetadata(mint: string): Promise<TokenMetadata> {
  const cacheKey = `meta:${mint}`;
  if (isCacheFresh(cacheKey, META_TTL_MS)) {
    const cached = getCacheValue(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as TokenMetadata;
      } catch {
        // fall through and refetch
      }
    }
  }

  const fallback: TokenMetadata = {
    mint,
    name: `${mint.slice(0, 4)}...${mint.slice(-4)}`,
    symbol: mint.slice(0, 4).toUpperCase(),
    logo: null,
  };

  if (!HELIUS_API_KEY) return fallback;

  try {
    const res = await axios.post(
      heliusRpcUrl(),
      {
        jsonrpc: "2.0",
        id: "metadata",
        method: "getAsset",
        params: { id: mint },
      },
      { timeout: 8000 },
    );

    const asset = res.data?.result;
    if (!asset) return fallback;

    const meta = asset.content?.metadata ?? {};
    const links = asset.content?.links ?? {};
    const files = asset.content?.files ?? [];
    const logo =
      links.image ||
      (Array.isArray(files) && files[0]?.uri) ||
      (Array.isArray(files) && files[0]?.cdn_uri) ||
      null;

    const result: TokenMetadata = {
      mint,
      name: meta.name || fallback.name,
      symbol: meta.symbol || fallback.symbol,
      logo: logo || null,
    };

    setCacheValue(cacheKey, JSON.stringify(result));
    return result;
  } catch (e) {
    logger.warn({ err: e, mint }, "Helius metadata fetch failed");
    return fallback;
  }
}

/**
 * Per-mint metadata as returned to the recovery UI. Every field is nullable: a
 * null means "not resolvable", so the client owns the human-facing fallback
 * ("Unknown Token" + short mint). We never fabricate a symbol/name here.
 */
export interface TokenMetaResult {
  symbol: string | null;
  name: string | null;
  logo: string | null;
}

const UNKNOWN_META: TokenMetaResult = { symbol: null, name: null, logo: null };

/** Distinct cache namespace from getTokenMetadata — the stored shape differs. */
function batchCacheKey(mint: string): string {
  return `tokmeta:${mint}`;
}

/** Extract a best-effort {symbol,name,logo} from a Helius DAS asset object. */
function parseAsset(asset: any): TokenMetaResult {
  const meta = asset?.content?.metadata ?? {};
  const links = asset?.content?.links ?? {};
  const files = asset?.content?.files ?? [];
  const logo =
    links.image ||
    (Array.isArray(files) && files[0]?.uri) ||
    (Array.isArray(files) && files[0]?.cdn_uri) ||
    null;
  const symbol =
    typeof meta.symbol === "string" && meta.symbol.trim()
      ? meta.symbol.trim()
      : null;
  const name =
    typeof meta.name === "string" && meta.name.trim() ? meta.name.trim() : null;
  return { symbol, name, logo: logo || null };
}

/**
 * Batch-resolve token metadata for a set of mints via the Helius DAS
 * getAssetBatch method. Per-mint results are cached for an hour; only uncached
 * mints hit the network. Best-effort: any failure (or missing Helius key)
 * yields null fields for the affected mints rather than throwing, so the
 * recovery flow is never blocked by metadata.
 */
export async function getTokenMetadataBatch(
  mints: string[],
): Promise<Record<string, TokenMetaResult>> {
  const out: Record<string, TokenMetaResult> = {};
  const unique = [...new Set(mints)];
  const toFetch: string[] = [];

  for (const mint of unique) {
    const key = batchCacheKey(mint);
    if (isCacheFresh(key, META_TTL_MS)) {
      const cached = getCacheValue(key);
      if (cached) {
        try {
          out[mint] = JSON.parse(cached) as TokenMetaResult;
          continue;
        } catch {
          // fall through and refetch
        }
      }
    }
    toFetch.push(mint);
  }

  if (toFetch.length === 0) return out;

  if (!HELIUS_API_KEY) {
    for (const mint of toFetch) out[mint] = { ...UNKNOWN_META };
    return out;
  }

  // Helius getAssetBatch accepts up to 1000 ids; chunk conservatively.
  const CHUNK = 100;
  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const chunk = toFetch.slice(i, i + CHUNK);
    try {
      const res = await axios.post(
        heliusRpcUrl(),
        {
          jsonrpc: "2.0",
          id: "metadata-batch",
          method: "getAssetBatch",
          params: { ids: chunk },
        },
        { timeout: 10000 },
      );
      const assets = Array.isArray(res.data?.result) ? res.data.result : [];
      for (let j = 0; j < chunk.length; j++) {
        const mint = chunk[j]!;
        const asset = assets[j];
        const result = asset ? parseAsset(asset) : { ...UNKNOWN_META };
        out[mint] = result;
        setCacheValue(batchCacheKey(mint), JSON.stringify(result));
      }
    } catch (e) {
      logger.warn({ err: e }, "Helius batch metadata fetch failed");
      for (const mint of chunk) {
        if (!(mint in out)) out[mint] = { ...UNKNOWN_META };
      }
    }
  }

  return out;
}
