/**
 * Wallet Cleanup token intelligence (position-independent).
 *
 * For a set of mints, this rolls up everything the wallet-cleanup suite needs to
 * judge a token WITHOUT trusting the client: live market signals (price,
 * liquidity, market cap, whether a trusted market and a sell route exist) and
 * on-chain authority signals (mint authority, freeze authority, mutable
 * metadata). From those signals it derives a conservative risk classification
 * plus human-readable reasons and structured factor flags.
 *
 * Trust rules enforced here:
 *   • Nothing is fabricated. A signal we cannot resolve is reported as `null`
 *     and the risk engine treats it as UNKNOWN, never silently "safe".
 *   • This module is read-only - it never closes, burns, hides or selects
 *     anything, and it never writes to recovery tables.
 *   • Sellability, per-token USD value and realizable value are intentionally
 *     NOT computed here: those depend on the holder's on-chain balance and are
 *     derived client-side from these signals × the real balance.
 */

import {
  getMintAuthoritiesBatch,
  getMutableFlagsBatch,
} from "./helius.js";
import { getTokenStatsBatchWithStatus } from "./prices.js";
import { getCacheValue, setCacheValue, isCacheFresh } from "./database.js";
import { logger } from "./logger.js";

/** Conservative risk classes, worst → best handled explicitly in the UI. */
export type RiskClass =
  | "verified"
  | "normal"
  | "unknown"
  | "suspicious"
  | "spam"
  | "high_risk";

/** Structured factor flags so the UI can render consistent factor chips. */
export type RiskFactorKey =
  | "market"
  | "sell-route"
  | "mint-auth"
  | "freeze-auth"
  | "mutable-metadata"
  | "low-liq";

export interface RiskFactor {
  key: RiskFactorKey;
  /** "ok" = healthy signal, "warn" = caution, "bad" = serious red flag. */
  level: "ok" | "warn" | "bad";
  label: string;
}

export interface TokenIntel {
  mint: string;
  // ── Market signals (null = not resolvable) ──
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  /**
   * Whether a trusted-quote DexScreener market exists. `true`/`false` are
   * positive determinations from a SUCCESSFUL lookup; `null` means the market
   * lookup itself failed (outage) so we genuinely don't know - the risk engine
   * must treat null as UNKNOWN and never as "no market / junk".
   */
  hasMarket: boolean | null;
  /** hasMarket AND liquidity is deep enough to realistically sell into; null when market is unknown. */
  hasSellRoute: boolean | null;
  // ── On-chain authority signals (null = not resolvable) ──
  hasMintAuthority: boolean | null;
  hasFreezeAuthority: boolean | null;
  mutableMetadata: boolean | null;
  // ── Verification ──
  /** On the curated verified-token allow-list (blue chips / stables). */
  verified: boolean;
  // ── Derived (position-independent) ──
  risk: RiskClass;
  riskReasons: string[];
  riskFactors: RiskFactor[];
}

/** Minimum trusted liquidity (USD) for a realistic sell route to exist. */
const MIN_SELL_LIQUIDITY_USD = 100;
/** Below this trusted liquidity (USD) we flag the token as low-liquidity. */
const LOW_LIQUIDITY_USD = 1_000;

/**
 * Curated allow-list of verified mints (SOL + major stables + a few blue chips).
 * Verification is a deliberate whitelist, never inferred from liquidity, so a
 * deep-liquidity scam can never auto-promote itself to "Verified".
 */
const VERIFIED_MINTS = new Set<string>([
  "So11111111111111111111111111111111111111112", // Wrapped SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // mSOL
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj", // stSOL
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
]);

const INTEL_TTL_MS = 10 * 60 * 1000; // 10 minutes

function intelCacheKey(mint: string): string {
  return `recintel:${mint}`;
}

/**
 * Derive the risk class + reasons + factor chips from raw signals. Pure and
 * deterministic so the same signals always yield the same verdict. Conservative
 * by design: a serious on-chain capability (freeze authority) outranks a missing
 * market, and anything we genuinely cannot resolve degrades to UNKNOWN rather
 * than being presented as safe.
 */
function classify(signals: {
  verified: boolean;
  hasMarket: boolean | null;
  hasSellRoute: boolean | null;
  liquidityUsd: number | null;
  priceUsd: number | null;
  hasMintAuthority: boolean | null;
  hasFreezeAuthority: boolean | null;
  mutableMetadata: boolean | null;
}): { risk: RiskClass; reasons: string[]; factors: RiskFactor[] } {
  const reasons: string[] = [];
  const factors: RiskFactor[] = [];

  // ── Factor chips (always rendered, consistent order) ──
  if (signals.hasMarket === true) {
    factors.push({ key: "market", level: "ok", label: "Tradable market" });
  } else if (signals.hasMarket === false) {
    factors.push({ key: "market", level: "bad", label: "No trusted market" });
  } else {
    factors.push({ key: "market", level: "warn", label: "Market unknown" });
  }
  if (signals.hasSellRoute === true) {
    factors.push({ key: "sell-route", level: "ok", label: "Sell route" });
  } else if (signals.hasSellRoute === false) {
    factors.push({ key: "sell-route", level: "bad", label: "No sell route" });
  } else {
    factors.push({ key: "sell-route", level: "warn", label: "Sell route unknown" });
  }
  if (signals.hasFreezeAuthority === true) {
    factors.push({
      key: "freeze-auth",
      level: "bad",
      label: "Freeze authority",
    });
  } else if (signals.hasFreezeAuthority === false) {
    factors.push({ key: "freeze-auth", level: "ok", label: "No freeze" });
  } else {
    factors.push({ key: "freeze-auth", level: "warn", label: "Freeze unknown" });
  }
  if (signals.hasMintAuthority === true) {
    factors.push({ key: "mint-auth", level: "warn", label: "Mint authority" });
  } else if (signals.hasMintAuthority === false) {
    factors.push({ key: "mint-auth", level: "ok", label: "Mint revoked" });
  } else {
    factors.push({ key: "mint-auth", level: "warn", label: "Mint unknown" });
  }
  if (signals.mutableMetadata === true) {
    factors.push({
      key: "mutable-metadata",
      level: "warn",
      label: "Mutable metadata",
    });
  } else if (signals.mutableMetadata === false) {
    factors.push({
      key: "mutable-metadata",
      level: "ok",
      label: "Immutable",
    });
  }
  if (
    signals.liquidityUsd != null &&
    signals.liquidityUsd > 0 &&
    signals.liquidityUsd < LOW_LIQUIDITY_USD
  ) {
    factors.push({ key: "low-liq", level: "warn", label: "Low liquidity" });
  }

  // ── Reason lines (only the meaningful ones) ──
  if (signals.hasFreezeAuthority === true) {
    reasons.push("Has a freeze authority - your balance can be frozen.");
  }
  if (signals.hasMintAuthority === true) {
    reasons.push("Mint authority is still active - supply can be inflated.");
  }
  if (signals.mutableMetadata === true) {
    reasons.push("Metadata is mutable - name, symbol or image can change.");
  }
  if (signals.hasMarket === false) {
    reasons.push("No trusted market - this token cannot be priced or sold.");
  } else if (signals.hasMarket === true && signals.hasSellRoute === false) {
    reasons.push("Liquidity is too thin to realistically sell into.");
  } else if (
    signals.hasMarket === true &&
    signals.liquidityUsd != null &&
    signals.liquidityUsd < LOW_LIQUIDITY_USD
  ) {
    reasons.push("Low liquidity - selling may move the price sharply.");
  } else if (signals.hasMarket == null) {
    reasons.push(
      "Market data is temporarily unavailable - we can't assess this token right now.",
    );
  }

  // ── Classification (priority order: worst capability first) ──
  let risk: RiskClass;
  if (signals.verified) {
    risk = "verified";
  } else if (signals.hasFreezeAuthority === true) {
    // A live freeze authority is the single most dangerous capability.
    risk = "high_risk";
  } else if (
    signals.hasMarket === false &&
    (signals.priceUsd == null || signals.priceUsd <= 0)
  ) {
    // CONFIRMED no market (successful lookup) and no price - overwhelmingly
    // airdropped spam / junk. A failed lookup (hasMarket === null) never lands
    // here: missing data must not manufacture a removable verdict.
    risk = "spam";
  } else if (
    (signals.hasMintAuthority === true && signals.mutableMetadata === true) ||
    (signals.hasMarket === true && signals.hasSellRoute === false)
  ) {
    // Inflatable + impersonatable, or a market with no realistic exit.
    risk = "suspicious";
  } else if (signals.hasMarket == null) {
    // Market lookup failed / unresolved - be honest that we just don't know.
    risk = "unknown";
  } else {
    risk = "normal";
  }

  return { risk, reasons, factors };
}

/**
 * Build token intelligence for a batch of mints. Cached per-mint for 10 minutes
 * to keep repeat scans cheap. Mints we cannot resolve still get a row (with
 * null signals + an UNKNOWN classification, never spam) so the UI can show every
 * asset the wallet holds without inventing data or flagging it as junk.
 */
export async function getTokenIntelBatch(
  mints: string[],
): Promise<Record<string, TokenIntel>> {
  const out: Record<string, TokenIntel> = {};
  const unique = [...new Set(mints.filter(Boolean))];
  if (unique.length === 0) return out;

  const toCompute: string[] = [];
  for (const mint of unique) {
    const key = intelCacheKey(mint);
    if (isCacheFresh(key, INTEL_TTL_MS)) {
      const cached = getCacheValue(key);
      if (cached) {
        try {
          out[mint] = JSON.parse(cached) as TokenIntel;
          continue;
        } catch {
          // fall through and recompute
        }
      }
    }
    toCompute.push(mint);
  }

  if (toCompute.length === 0) return out;

  // Fetch all three signal sources in parallel. Each is independently
  // best-effort and never throws, so a single outage degrades gracefully.
  // `marketOk` tracks whether the market lookup actually succeeded: on failure
  // we must report market as UNKNOWN (null), never as "no market" (false),
  // otherwise a transient outage would flag legitimate tokens as junk.
  let marketOk = true;
  const [marketResult, authorities, mutables] = await Promise.all([
    getTokenStatsBatchWithStatus(toCompute).catch((e) => {
      logger.warn({ err: e }, "recovery-intel: market batch failed");
      return { stats: new Map(), ok: false };
    }),
    getMintAuthoritiesBatch(toCompute).catch((e) => {
      logger.warn({ err: e }, "recovery-intel: authority batch failed");
      return new Map();
    }),
    getMutableFlagsBatch(toCompute).catch((e) => {
      logger.warn({ err: e }, "recovery-intel: mutable batch failed");
      return new Map();
    }),
  ]);

  // `getTokenStatsBatchWithStatus` swallows per-chunk failures internally but
  // reports them via `ok`; propagate that so an outage degrades to UNKNOWN.
  const market = marketResult.stats;
  marketOk = marketResult.ok;

  for (const mint of toCompute) {
    const m = market.get(mint);
    const auth = authorities.get(mint) ?? null;
    const mutable = mutables.has(mint) ? mutables.get(mint)! : null;

    const liquidityUsd = m?.liquidityUsd ?? null;
    const priceUsd = m?.priceUsd ?? null;
    const marketCapUsd = m?.marketCapUsd ?? null;
    // A resolved mint is always a confirmed market (true), even if a sibling
    // chunk failed. An ABSENT mint is only a confirmed "no market" (false) when
    // the whole lookup succeeded; under an outage (marketOk=false) it degrades
    // to UNKNOWN (null) so we never treat missing data as junk.
    const hasMarket: boolean | null = m ? true : marketOk ? false : null;
    const hasSellRoute: boolean | null =
      hasMarket === null
        ? null
        : hasMarket === false
          ? false
          : liquidityUsd != null && liquidityUsd >= MIN_SELL_LIQUIDITY_USD;
    const verified = VERIFIED_MINTS.has(mint);

    const { risk, reasons, factors } = classify({
      verified,
      hasMarket,
      hasSellRoute,
      liquidityUsd,
      priceUsd,
      hasMintAuthority: auth ? auth.hasMintAuthority : null,
      hasFreezeAuthority: auth ? auth.hasFreezeAuthority : null,
      mutableMetadata: mutable,
    });

    const intel: TokenIntel = {
      mint,
      priceUsd,
      liquidityUsd,
      marketCapUsd,
      hasMarket,
      hasSellRoute,
      hasMintAuthority: auth ? auth.hasMintAuthority : null,
      hasFreezeAuthority: auth ? auth.hasFreezeAuthority : null,
      mutableMetadata: mutable,
      verified,
      risk,
      riskReasons: reasons,
      riskFactors: factors,
    };

    out[mint] = intel;
    setCacheValue(intelCacheKey(mint), JSON.stringify(intel));
  }

  return out;
}
