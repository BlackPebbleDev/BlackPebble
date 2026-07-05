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

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * The wallet's ACTUAL current token balances (UI amounts, both token programs),
 * read live from the chain. This is the ground truth that trade-history-derived
 * holdings must be reconciled against - swap history alone cannot see
 * transfers, burns, or non-swap exits.
 *
 * Returns null when the lookup fails (missing key, RPC error) so callers can
 * distinguish "wallet holds nothing" from "we couldn't verify" - they must
 * never treat a failed lookup as confirmation of holdings.
 */
export async function getWalletTokenBalances(
  owner: string,
): Promise<Map<string, number> | null> {
  if (!HELIUS_API_KEY) return null;

  const balances = new Map<string, number>();
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const res = await axios.post(
        heliusRpcUrl(),
        {
          jsonrpc: "2.0",
          id: "token-balances",
          method: "getTokenAccountsByOwner",
          params: [owner, { programId }, { encoding: "jsonParsed" }],
        },
        { timeout: 10000 },
      );
      const accounts: Array<{
        account?: {
          data?: {
            parsed?: {
              info?: {
                mint?: string;
                tokenAmount?: { uiAmount?: number | null };
              };
            };
          };
        };
      }> = res.data?.result?.value ?? [];
      for (const acc of accounts) {
        const info = acc.account?.data?.parsed?.info;
        const mint = info?.mint;
        const amount = info?.tokenAmount?.uiAmount;
        if (!mint || amount == null || !Number.isFinite(amount)) continue;
        balances.set(mint, (balances.get(mint) ?? 0) + amount);
      }
    } catch (e) {
      logger.warn({ err: e, owner }, "Wallet token balance lookup failed");
      return null;
    }
  }
  return balances;
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

/** Distinct cache namespace from getTokenMetadata - the stored shape differs. */
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

/**
 * On-chain mint authority signals for a single SPL / Token-2022 mint, read from
 * the parsed mint account. `null` for a field means "not resolvable", which the
 * risk engine treats as unknown rather than safe. Presence of a mint authority
 * means supply can still be inflated; presence of a freeze authority means the
 * holder's balance can be frozen - both are real, on-chain scam vectors.
 */
export interface MintAuthorityInfo {
  /** True when the mint still has an active mint authority (supply inflatable). */
  hasMintAuthority: boolean;
  /** True when the mint has a freeze authority (balances can be frozen). */
  hasFreezeAuthority: boolean;
  decimals: number | null;
}

const MINT_AUTH_TTL_MS = 60 * 60 * 1000; // 1 hour

function mintAuthCacheKey(mint: string): string {
  return `mintauth:${mint}`;
}

/**
 * Batch-read mint authority + freeze authority presence for a set of mints via
 * the Solana RPC `getMultipleAccounts` (jsonParsed). Per-mint results are cached
 * for an hour; only uncached mints hit the network. Best-effort: any failure (or
 * a missing Helius key) yields `null` for the affected mints rather than
 * throwing, so the recovery flow is never blocked. A `null` result is treated as
 * "unknown" by the risk engine - never silently assumed safe.
 */
export async function getMintAuthoritiesBatch(
  mints: string[],
): Promise<Map<string, MintAuthorityInfo | null>> {
  const out = new Map<string, MintAuthorityInfo | null>();
  const unique = [...new Set(mints.filter(Boolean))];
  const toFetch: string[] = [];

  for (const mint of unique) {
    const key = mintAuthCacheKey(mint);
    if (isCacheFresh(key, MINT_AUTH_TTL_MS)) {
      const cached = getCacheValue(key);
      if (cached) {
        try {
          out.set(mint, JSON.parse(cached) as MintAuthorityInfo);
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
    for (const mint of toFetch) out.set(mint, null);
    return out;
  }

  // getMultipleAccounts caps at 100 accounts per request.
  const CHUNK = 100;
  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const chunk = toFetch.slice(i, i + CHUNK);
    try {
      const res = await axios.post(
        heliusRpcUrl(),
        {
          jsonrpc: "2.0",
          id: "mint-auth-batch",
          method: "getMultipleAccounts",
          params: [chunk, { encoding: "jsonParsed", commitment: "confirmed" }],
        },
        { timeout: 10000 },
      );
      const values: any[] = Array.isArray(res.data?.result?.value)
        ? res.data.result.value
        : [];
      for (let j = 0; j < chunk.length; j++) {
        const mint = chunk[j]!;
        const acc = values[j];
        const info = acc?.data?.parsed?.info;
        if (!info || acc?.data?.parsed?.type !== "mint") {
          // Could not parse the mint account - leave unknown (null).
          out.set(mint, null);
          continue;
        }
        const result: MintAuthorityInfo = {
          hasMintAuthority: Boolean(info.mintAuthority),
          hasFreezeAuthority: Boolean(info.freezeAuthority),
          decimals:
            typeof info.decimals === "number" ? info.decimals : null,
        };
        out.set(mint, result);
        setCacheValue(mintAuthCacheKey(mint), JSON.stringify(result));
      }
    } catch (e) {
      logger.warn({ err: e }, "Helius mint authority batch fetch failed");
      for (const mint of chunk) {
        if (!out.has(mint)) out.set(mint, null);
      }
    }
  }

  return out;
}

const MUTABLE_TTL_MS = 60 * 60 * 1000; // 1 hour

function mutableCacheKey(mint: string): string {
  return `assetmut:${mint}`;
}

/**
 * Batch-read the `mutable` flag for a set of mints via the Helius DAS
 * `getAssetBatch` method. Mutable metadata means a token's name/symbol/image can
 * be changed after the fact - a common impersonation vector - so the risk engine
 * surfaces it as a caution factor. Per-mint cached for an hour. Best-effort:
 * failures yield `null` (unknown) rather than throwing.
 */
export async function getMutableFlagsBatch(
  mints: string[],
): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>();
  const unique = [...new Set(mints.filter(Boolean))];
  const toFetch: string[] = [];

  for (const mint of unique) {
    const key = mutableCacheKey(mint);
    if (isCacheFresh(key, MUTABLE_TTL_MS)) {
      const cached = getCacheValue(key);
      if (cached === "true" || cached === "false") {
        out.set(mint, cached === "true");
        continue;
      }
    }
    toFetch.push(mint);
  }

  if (toFetch.length === 0) return out;

  if (!HELIUS_API_KEY) {
    for (const mint of toFetch) out.set(mint, null);
    return out;
  }

  const CHUNK = 100;
  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const chunk = toFetch.slice(i, i + CHUNK);
    try {
      const res = await axios.post(
        heliusRpcUrl(),
        {
          jsonrpc: "2.0",
          id: "mutable-batch",
          method: "getAssetBatch",
          params: { ids: chunk },
        },
        { timeout: 10000 },
      );
      const assets = Array.isArray(res.data?.result) ? res.data.result : [];
      for (let j = 0; j < chunk.length; j++) {
        const mint = chunk[j]!;
        const asset = assets[j];
        const mutable =
          asset && typeof asset.mutable === "boolean" ? asset.mutable : null;
        out.set(mint, mutable);
        if (mutable != null) {
          setCacheValue(mutableCacheKey(mint), mutable ? "true" : "false");
        }
      }
    } catch (e) {
      logger.warn({ err: e }, "Helius mutable flag batch fetch failed");
      for (const mint of chunk) {
        if (!out.has(mint)) out.set(mint, null);
      }
    }
  }

  return out;
}
