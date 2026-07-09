import axios from "axios";
import { logger } from "./logger.js";

/**
 * Resolve a Solana token mint (contract address) to its CoinMarketCap currency
 * page, but only when CoinMarketCap actually lists the token.
 *
 * CoinMarketCap publishes an authoritative, keyless mapping of every listed
 * asset (id / name / symbol / slug / active flag / contract addresses) as a
 * static file. We download it once, build an address -> slug index for the
 * Solana mints of *active* listings, and look the mint up. When it's present we
 * return the canonical `/currencies/<slug>/` URL; otherwise `{ url: null }` so
 * the UI hides the link. We never fabricate a slug or a generic search URL for
 * an unlisted token.
 *
 * The index is cached in memory and refreshed on a TTL. Any failure fails
 * closed (no link) while keeping a previously built index if one exists.
 */

const SOURCE_URL =
  "https://s3.coinmarketcap.com/generated/core/crypto/cryptos.json";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const REFRESH_TTL_MS = 12 * 60 * 60 * 1000; // 12h between successful refreshes
const RETRY_TTL_MS = 15 * 60 * 1000; // 15m before retrying after a failure

// Solana mints are base58 pubkeys (32-44 chars). We only index these so the map
// stays tiny and we never collide with EVM (0x...) addresses of the same coin.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface CoinMarketCapResolution {
  url: string | null;
}

interface CryptosFile {
  fields: string[];
  values: unknown[][];
}

interface IndexState {
  /** mint (exact, case-sensitive) -> CoinMarketCap slug */
  bySolanaMint: Map<string, string>;
  /** When this index should be refreshed. */
  expires: number;
}

let index: IndexState | null = null;
let building: Promise<IndexState | null> | null = null;

function buildIndex(file: CryptosFile): Map<string, string> {
  const cols = file.fields;
  const slugIdx = cols.indexOf("slug");
  const activeIdx = cols.indexOf("is_active");
  const addrIdx = cols.indexOf("address");
  const map = new Map<string, string>();
  if (slugIdx < 0 || addrIdx < 0) return map;
  for (const row of file.values) {
    if (!Array.isArray(row)) continue;
    // Only index actively tracked listings so we never link a delisted coin.
    if (activeIdx >= 0 && row[activeIdx] !== 1) continue;
    const slug = row[slugIdx];
    const addrs = row[addrIdx];
    if (typeof slug !== "string" || !slug || !Array.isArray(addrs)) continue;
    for (const raw of addrs) {
      const addr = String(raw);
      if (addr.startsWith("0x")) continue; // EVM, not a Solana mint
      if (!BASE58_RE.test(addr)) continue;
      if (!map.has(addr)) map.set(addr, slug);
    }
  }
  return map;
}

async function refreshIndex(): Promise<IndexState | null> {
  try {
    const res = await axios.get<CryptosFile>(SOURCE_URL, {
      timeout: 15000,
      headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    });
    const bySolanaMint = buildIndex(res.data);
    if (bySolanaMint.size === 0) throw new Error("empty CMC index");
    index = { bySolanaMint, expires: Date.now() + REFRESH_TTL_MS };
    logger.info(
      { entries: bySolanaMint.size },
      "coinmarketcap index refreshed",
    );
    return index;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "coinmarketcap index refresh failed",
    );
    // Keep any existing index but retry sooner on the next request.
    if (index) index.expires = Date.now() + RETRY_TTL_MS;
    return index;
  }
}

async function ensureIndex(): Promise<IndexState | null> {
  if (index && index.expires > Date.now()) return index;
  if (!building) {
    building = refreshIndex().finally(() => {
      building = null;
    });
  }
  return building;
}

export async function resolveCoinMarketCapForMint(
  mint: string,
): Promise<CoinMarketCapResolution> {
  const state = await ensureIndex();
  const slug = state?.bySolanaMint.get(mint);
  if (!slug) return { url: null };
  return { url: `https://coinmarketcap.com/currencies/${slug}/` };
}
