/**
 * Central multichain registry for BlackPebble Academy.
 *
 * The Academy is currently Solana-first, but its architecture must not be
 * trapped there. Every chain-aware surface (lesson chain scope, chain modules,
 * search address detection, chain badges) reads from THIS registry instead of
 * hardcoding chain metadata across lesson files or components. New networks are
 * added here as configuration, without touching lesson components.
 *
 * `enabled` reflects whether the network is live in the wider BlackPebble
 * product. `academySupport` reflects whether the Academy currently ships
 * meaningful content for that chain. Neither flag should ever falsely advertise
 * live support for a network that is not yet supported.
 */

export type ChainEcosystem = "solana" | "evm" | "bitcoin" | "other";

/** Address encoding family used by a chain (drives client-side detection). */
export type ChainAddressType = "solana-base58" | "evm-hex" | "bitcoin" | "other";

export type ChainKey =
  | "solana"
  | "ethereum"
  | "base"
  | "arbitrum"
  | "optimism"
  | "bnb"
  | "avalanche"
  | "bitcoin";

export interface AcademyChain {
  /** Numeric or CAIP-style identifier where one is well defined. */
  chainId: string;
  /** Canonical, URL-safe key used throughout the Academy. */
  key: ChainKey;
  displayName: string;
  shortName: string;
  ecosystem: ChainEcosystem;
  nativeAsset: string;
  /** Lucide icon name reference; resolved by the UI icon map. */
  icon: string;
  explorer: { name: string; baseUrl: string } | null;
  addressType: ChainAddressType;
  /** Live in the wider BlackPebble product today. */
  enabled: boolean;
  /** Academy currently ships meaningful content for this chain. */
  academySupport: boolean;
}

export const CHAINS: Record<ChainKey, AcademyChain> = {
  solana: {
    chainId: "solana:mainnet",
    key: "solana",
    displayName: "Solana",
    shortName: "SOL",
    ecosystem: "solana",
    nativeAsset: "SOL",
    icon: "link",
    explorer: { name: "Solscan", baseUrl: "https://solscan.io" },
    addressType: "solana-base58",
    enabled: true,
    academySupport: true,
  },
  ethereum: {
    chainId: "eip155:1",
    key: "ethereum",
    displayName: "Ethereum",
    shortName: "ETH",
    ecosystem: "evm",
    nativeAsset: "ETH",
    icon: "link",
    explorer: { name: "Etherscan", baseUrl: "https://etherscan.io" },
    addressType: "evm-hex",
    enabled: false,
    academySupport: false,
  },
  base: {
    chainId: "eip155:8453",
    key: "base",
    displayName: "Base",
    shortName: "BASE",
    ecosystem: "evm",
    nativeAsset: "ETH",
    icon: "link",
    explorer: { name: "Basescan", baseUrl: "https://basescan.org" },
    addressType: "evm-hex",
    enabled: false,
    academySupport: false,
  },
  arbitrum: {
    chainId: "eip155:42161",
    key: "arbitrum",
    displayName: "Arbitrum",
    shortName: "ARB",
    ecosystem: "evm",
    nativeAsset: "ETH",
    icon: "link",
    explorer: { name: "Arbiscan", baseUrl: "https://arbiscan.io" },
    addressType: "evm-hex",
    enabled: false,
    academySupport: false,
  },
  optimism: {
    chainId: "eip155:10",
    key: "optimism",
    displayName: "Optimism",
    shortName: "OP",
    ecosystem: "evm",
    nativeAsset: "ETH",
    icon: "link",
    explorer: { name: "Optimistic Etherscan", baseUrl: "https://optimistic.etherscan.io" },
    addressType: "evm-hex",
    enabled: false,
    academySupport: false,
  },
  bnb: {
    chainId: "eip155:56",
    key: "bnb",
    displayName: "BNB Chain",
    shortName: "BNB",
    ecosystem: "evm",
    nativeAsset: "BNB",
    icon: "link",
    explorer: { name: "BscScan", baseUrl: "https://bscscan.com" },
    addressType: "evm-hex",
    enabled: false,
    academySupport: false,
  },
  avalanche: {
    chainId: "eip155:43114",
    key: "avalanche",
    displayName: "Avalanche",
    shortName: "AVAX",
    ecosystem: "evm",
    nativeAsset: "AVAX",
    icon: "link",
    explorer: { name: "Snowtrace", baseUrl: "https://snowtrace.io" },
    addressType: "evm-hex",
    enabled: false,
    academySupport: false,
  },
  bitcoin: {
    chainId: "bip122:000000000019d6689c085ae165831e93",
    key: "bitcoin",
    displayName: "Bitcoin",
    shortName: "BTC",
    ecosystem: "bitcoin",
    nativeAsset: "BTC",
    icon: "link",
    explorer: { name: "mempool.space", baseUrl: "https://mempool.space" },
    addressType: "bitcoin",
    enabled: false,
    academySupport: false,
  },
};

export const CHAIN_KEYS = Object.keys(CHAINS) as ChainKey[];

export function getChain(key: string): AcademyChain | undefined {
  return (CHAINS as Record<string, AcademyChain>)[key];
}

export function isChainKey(key: string): key is ChainKey {
  return Object.prototype.hasOwnProperty.call(CHAINS, key);
}

/** Chains that are live in the product today. */
export function enabledChains(): AcademyChain[] {
  return CHAIN_KEYS.map((k) => CHAINS[k]).filter((c) => c.enabled);
}

/**
 * Scope describing how a lesson relates to specific chains. Kept small and
 * descriptive; it drives an optional badge, never a good/bad judgement.
 */
export type ChainScope =
  | "universal" // concept applies to any chain (PnL, risk-reward, position sizing)
  | "multichain" // has a neutral core plus chain-specific modules
  | "solana" // Solana-specific mechanics
  | "evm" // EVM-specific mechanics
  | "chain-comparison"; // explicitly compares networks

export const CHAIN_SCOPE_LABELS: Record<ChainScope, string> = {
  universal: "Universal",
  multichain: "Multichain",
  solana: "Solana",
  evm: "EVM",
  "chain-comparison": "Chain comparison",
};

// ── Address / mint detection (chain-aware, deterministic) ───────────────────

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_HEX_RE = /^0x[0-9a-fA-F]{40}$/;

/** A syntactically valid EVM 0x address. */
export function isEvmAddress(value: string): boolean {
  return EVM_HEX_RE.test(value.trim());
}

/**
 * A syntactically valid Solana address / mint. Base58, 32-44 chars, and NOT an
 * EVM hex address. Note: this is a shape check, not an on-chain existence check.
 */
export function isSolanaAddress(value: string): boolean {
  const v = value.trim();
  if (isEvmAddress(v)) return false;
  return SOLANA_BASE58_RE.test(v);
}

/**
 * Returns the chain keys whose address format matches the given string. Empty
 * when the input does not look like any supported address. Only checks shape,
 * so it never blindly assumes a long string is a Solana mint.
 */
export function detectAddressChains(value: string): ChainKey[] {
  const v = value.trim();
  if (!v) return [];
  const matches: ChainKey[] = [];
  if (isEvmAddress(v)) {
    for (const k of CHAIN_KEYS) {
      if (CHAINS[k].addressType === "evm-hex") matches.push(k);
    }
    return matches;
  }
  if (isSolanaAddress(v)) matches.push("solana");
  return matches;
}

/** True when the query is (shaped like) any supported chain address/mint. */
export function looksLikeAddress(value: string): boolean {
  return detectAddressChains(value).length > 0;
}
