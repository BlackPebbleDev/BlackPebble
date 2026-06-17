/**
 * Wallet-cleanup classification + value logic (client-side, position-aware).
 *
 * The backend supplies position-INDEPENDENT token intelligence (price,
 * liquidity, market cap, market/route/authority signals, risk class). This
 * module combines that intelligence with the holder's real on-chain balance to
 * derive the position-AWARE figures the suite needs: USD value, realizable
 * value, sellability, fake-value detection, and which cleanup bucket a token
 * falls into.
 *
 * Trust rules enforced here:
 *   • Nothing is fabricated — when a price/liquidity signal is null the value is
 *     null and the token degrades to a conservative bucket, never silently safe.
 *   • Nothing is auto-selected and nothing is hidden. Buckets only *suggest*;
 *     the user always makes the final call, and a user-protected token can never
 *     be a dust/burn candidate.
 */

import type { TokenIntel } from "@/lib/api";
import type { WalletAsset } from "@/lib/recovery-scan";

export type Sellability =
  | "Excellent"
  | "Good"
  | "Fair"
  | "Poor"
  | "Very Poor";

/** Which cleanup category a held token falls into (exactly one). */
export type CleanupBucket = "protected" | "burn" | "dust" | "keep";

export type SuggestedAction =
  | "Keep"
  | "Review"
  | "Burn candidate"
  | "Protected";

export interface EnrichedToken {
  asset: WalletAsset;
  /** Position-independent intelligence; null while loading or unresolved. */
  intel: TokenIntel | null;
  /** Displayed USD value (balance × price); null when price is unknown. */
  valueUsd: number | null;
  /** Realistically obtainable USD if sold today (depth-capped). */
  realizableUsd: number;
  sellability: Sellability;
  /** True when displayed value is unlikely to be realizable. */
  fakeValue: boolean;
  bucket: CleanupBucket;
  protectedByDefault: boolean;
  protectedByUser: boolean;
  isProtected: boolean;
  suggestedAction: SuggestedAction;
  /** Heuristic NFT/collectible (0 decimals). Never a burn candidate in V1. */
  isLikelyNft: boolean;
}

/**
 * The largest fraction of a pool's liquidity a holder could realistically sell
 * into without collapsing the price. Selling more than this moves the market so
 * far that the displayed value is not obtainable — this is the core of
 * fake-value detection.
 */
const REALIZABLE_DEPTH_FRACTION = 0.05;

/** A realizable holding at/above this USD value is meaningful enough to protect. */
const MEANINGFUL_REALIZABLE_USD = 5;

/** Displayed values below this are treated as economically zero ("dust"). */
const DUST_VALUE_USD = 1;

/**
 * Realistic exit value. With no sell route nothing is obtainable (0). With a
 * route, it is the displayed value capped at a small fraction of pool depth, so
 * a $4,200 position in an $18 pool realizes only a few dollars.
 */
export function computeRealizableUsd(
  valueUsd: number | null,
  intel: TokenIntel | null,
): number {
  if (!intel || !intel.hasSellRoute) return 0;
  const v = valueUsd ?? 0;
  const liq = intel.liquidityUsd ?? 0;
  if (v <= 0 || liq <= 0) return 0;
  return Math.min(v, liq * REALIZABLE_DEPTH_FRACTION);
}

/**
 * Sellability rating — how realistically the displayed value can be obtained.
 * Verified blue chips are always Excellent. With no trusted market or no sell
 * route, the value is unobtainable → Very Poor. Otherwise it scales with pool
 * depth and how large the position is relative to that depth.
 */
export function computeSellability(
  valueUsd: number | null,
  intel: TokenIntel | null,
): Sellability {
  if (intel?.verified) return "Excellent";
  if (!intel || !intel.hasMarket || !intel.hasSellRoute) return "Very Poor";

  const liq = intel.liquidityUsd ?? 0;
  const v = valueUsd ?? 0;
  const ratio = liq > 0 ? v / liq : 1;

  if (liq >= 50_000 && ratio < 0.01) return "Excellent";
  if (liq >= 10_000 && ratio < 0.03) return "Good";
  if (liq >= 1_000 && ratio < 0.08) return "Fair";
  if (liq >= 100 && ratio < 0.25) return "Poor";
  return "Very Poor";
}

/**
 * Combine a held asset with its intelligence and the user's protect list into a
 * fully-classified token. Pure and deterministic.
 */
export function enrichToken(
  asset: WalletAsset,
  intel: TokenIntel | null,
  userProtected: boolean,
  userUnprotected = false,
): EnrichedToken {
  const valueUsd =
    intel && intel.priceUsd != null ? asset.uiAmount * intel.priceUsd : null;
  const realizableUsd = computeRealizableUsd(valueUsd, intel);
  const sellability = computeSellability(valueUsd, intel);

  // Fake value: a real displayed value exists but barely any of it is
  // realizable. Tokens with no displayed value at all are dust, not "fake".
  const fakeValue =
    valueUsd != null &&
    valueUsd >= DUST_VALUE_USD &&
    realizableUsd < valueUsd * 0.5;

  // NFTs/collectibles use 0 decimals (Metaplex convention). NFT cleanup is
  // "Coming Soon" in V1, so these are protected by default and never burnable.
  const isLikelyNft = asset.decimals === 0;

  const protectedByDefault =
    isLikelyNft ||
    intel?.verified === true ||
    realizableUsd >= MEANINGFUL_REALIZABLE_USD;
  const protectedByUser = userProtected;
  // A user can explicitly override default protection (userUnprotected) to make
  // a verified/valuable asset eligible for cleanup, or explicitly protect any
  // token (userProtected). Explicit protection always wins.
  const isProtected =
    protectedByUser || (protectedByDefault && !userUnprotected);

  // Bucket priority: protection always wins; NFTs and unresolved-intel assets
  // are NEVER burn candidates; then concrete junk signals; then tiny leftovers.
  // An asset is only ever made removable on POSITIVE evidence (real intel that
  // shows no market or a scam-risk verdict) — never on missing information.
  let bucket: CleanupBucket;
  if (isProtected) {
    bucket = "protected";
  } else if (isLikelyNft) {
    // Even if a user removed NFT default-protection, NFTs stay out of burn in V1.
    bucket = "keep";
  } else if (!intel) {
    // Intelligence unavailable — degrade to a non-removable review state, never
    // burn. The UI surfaces an explicit "analysis unavailable" reason.
    bucket = "keep";
  } else if (
    !intel.hasMarket ||
    intel.risk === "spam" ||
    intel.risk === "high_risk" ||
    intel.risk === "suspicious"
  ) {
    bucket = "burn";
  } else if (valueUsd == null || valueUsd < DUST_VALUE_USD) {
    bucket = "dust";
  } else {
    bucket = "keep";
  }

  // Unresolved-intel assets in the keep bucket still warrant a "Review" nudge
  // rather than a confident "Keep", since we lack the signals to vouch for them.
  let suggestedAction: SuggestedAction;
  if (bucket === "protected") {
    suggestedAction = "Protected";
  } else if (bucket === "burn") {
    suggestedAction = "Burn candidate";
  } else if (bucket === "dust") {
    suggestedAction = "Review";
  } else if (!intel && !isLikelyNft) {
    suggestedAction = "Review";
  } else {
    suggestedAction = "Keep";
  }

  return {
    asset,
    intel,
    valueUsd,
    realizableUsd,
    sellability,
    fakeValue,
    bucket,
    protectedByDefault,
    protectedByUser,
    isProtected,
    suggestedAction,
    isLikelyNft,
  };
}

/** Format a USD figure for the cleanup UI (null → "—", sub-cent honest). */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  if (value > 0 && value < 0.01) return "<$0.01";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

/** Compact balance formatting that never shows a misleading rounded-to-zero. */
export function formatTokenAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  if (amount === 0) return "0";
  if (amount > 0 && amount < 0.0001) return "<0.0001";
  if (amount >= 1_000_000)
    return amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return amount.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
