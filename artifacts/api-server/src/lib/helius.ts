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
