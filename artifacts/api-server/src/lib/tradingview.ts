import axios from "axios";
import { logger } from "./logger.js";

/**
 * Resolve a Solana token mint (contract address) to its TradingView symbol
 * page, when TradingView actually lists it.
 *
 * TradingView's symbol search indexes on-chain Solana DEX pools by contract
 * address, so pasting a mint into their explorer surfaces the token's pools
 * (Raydium / Orca / Meteora / ...). We mirror that exactly: query the same
 * search endpoint with the mint and, if an on-chain Solana result comes back,
 * build the canonical `/symbols/<PREFIX>-<SYMBOL>/` URL. If nothing matches we
 * return `{ url: null }` so the UI simply hides the link — we never fabricate a
 * URL for an unlisted token.
 *
 * Results are cached (positive + negative) to keep this fast and to avoid
 * hammering TradingView. Any failure fails closed (no link).
 */

const SEARCH_URL =
  "https://symbol-search.tradingview.com/symbol_search/v3/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const POSITIVE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const NEGATIVE_TTL_MS = 30 * 60 * 1000; // 30m
const MAX_CACHE_ENTRIES = 5000;

export interface TradingViewResolution {
  url: string | null;
}

interface TvSymbol {
  symbol?: string;
  prefix?: string;
  source_id?: string;
  exchange?: string;
  type?: string;
}

const cache = new Map<string, { value: TradingViewResolution; expires: number }>();

function stripTags(s: string): string {
  return s.replace(/<\/?em>/g, "").trim();
}

/** On-chain Solana DEX result — definitively tied to the searched contract. */
function isSolanaOnchain(sym: TvSymbol): boolean {
  return String(sym.exchange ?? "")
    .toLowerCase()
    .includes("solana");
}

function buildUrl(sym: TvSymbol): string | null {
  // Prefer the plain pool symbol over the `.USD`-suffixed derived variant.
  const symbol = stripTags(String(sym.symbol ?? "")).replace(/\.[A-Za-z]+$/, "");
  const prefix = stripTags(String(sym.prefix ?? sym.source_id ?? ""));
  if (!symbol) return null;
  const path = prefix ? `${prefix}-${symbol}` : symbol;
  // On-chain symbols are limited to [A-Z0-9_]; guard against anything odd so we
  // never emit a malformed URL.
  if (!/^[A-Za-z0-9_.-]+$/.test(path)) return null;
  return `https://www.tradingview.com/symbols/${path}/`;
}

export async function resolveTradingViewForMint(
  mint: string,
  symbol?: string,
): Promise<TradingViewResolution> {
  // The token's own ticker (uppercased, alphanumeric) - used to prefer a pool
  // where our token is the BASE currency, so searching e.g. a USDC mint never
  // links a pool where USDC is merely the quote of another asset.
  const ticker = (symbol ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cacheKey = ticker ? `${mint}|${ticker}` : mint;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  let value: TradingViewResolution = { url: null };
  try {
    const res = await axios.get<{ symbols?: TvSymbol[] }>(SEARCH_URL, {
      timeout: 4500,
      params: {
        text: mint,
        hl: 0,
        lang: "en",
        search_type: "",
        domain: "production",
      },
      headers: {
        "User-Agent": USER_AGENT,
        Origin: "https://www.tradingview.com",
        Referer: "https://www.tradingview.com/",
        accept: "application/json",
      },
    });
    const symbols = Array.isArray(res.data?.symbols) ? res.data.symbols : [];
    const onchain = symbols.filter(isSolanaOnchain);
    const plain = onchain.filter(
      (s) => !stripTags(String(s.symbol ?? "")).includes("."),
    );
    const pool = plain.length > 0 ? plain : onchain;
    // Prefer a pool where our token is the base (symbol starts with the ticker);
    // otherwise fall back to the first on-chain pool for this contract.
    const pick =
      (ticker
        ? pool.find((s) =>
            stripTags(String(s.symbol ?? "")).toUpperCase().startsWith(ticker),
          )
        : undefined) ?? pool[0];
    if (pick) {
      const url = buildUrl(pick);
      if (url) value = { url };
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), mint },
      "tradingview resolve failed",
    );
    // fail closed - no link
  }

  if (cache.size > MAX_CACHE_ENTRIES) cache.clear();
  cache.set(cacheKey, {
    value,
    expires: Date.now() + (value.url ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
  });
  return value;
}
