/**
 * Community Campaigns - pure display + safety helpers.
 *
 * Extracted from the campaigns page so the token-identity fallback rules and
 * the pre-flight balance check can be unit-tested without React or a wallet.
 *
 * Golden rules encoded here:
 *   - Never invent a generic token name. If a mint exists but metadata is
 *     unavailable, fall back to the shortened mint + "Metadata unavailable" —
 *     never the string "Token campaign".
 *   - Market cap is either a real compact value or "MC unavailable"; missing
 *     data is never rendered as $0 or a bare dash.
 *   - A contribution must be blocked when the wallet cannot cover amount + fee.
 */

/** Compact USD: $48.2K, $2.3M, $1.1B (one decimal, trailing .0 trimmed). */
export function fmtCompactUsd(usd: number): string {
  const trim = (n: string) => (n.endsWith(".0") ? n.slice(0, -2) : n);
  if (usd >= 1e9) return `$${trim((usd / 1e9).toFixed(1))}B`;
  if (usd >= 1e6) return `$${trim((usd / 1e6).toFixed(1))}M`;
  if (usd >= 1e3) return `$${trim((usd / 1e3).toFixed(1))}K`;
  return `$${Math.round(usd)}`;
}

/** 4-char…4-char abbreviation of a mint address. */
export function shortenMint(mint: string): string {
  if (mint.length <= 10) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

export interface TokenIdentityInput {
  tokenMint: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenMarketCapUsd: number | null;
  title: string;
}

export interface TokenIdentityView {
  /** Primary line: real name, then $ticker, then shortened mint, then title. */
  name: string;
  /** "$SYM" when a symbol exists, else null. */
  ticker: string | null;
  hasToken: boolean;
  hasMeta: boolean;
  /** True when we're showing the shortened mint because metadata is missing. */
  isMintFallback: boolean;
  /** "$2.3M MC" when known, "MC unavailable" otherwise. */
  mcLabel: string;
}

export function deriveTokenIdentity(c: TokenIdentityInput): TokenIdentityView {
  const hasToken = !!c.tokenMint;
  const hasMeta = !!(c.tokenName || c.tokenSymbol);
  const ticker = c.tokenSymbol ? `$${c.tokenSymbol}` : null;
  const shortMint = c.tokenMint ? shortenMint(c.tokenMint) : null;

  const name = c.tokenName
    ? c.tokenName
    : c.tokenSymbol
      ? `$${c.tokenSymbol}`
      : hasToken
        ? shortMint!
        : c.title;

  const mcLabel =
    c.tokenMarketCapUsd != null
      ? `${fmtCompactUsd(c.tokenMarketCapUsd)} MC`
      : "MC unavailable";

  return {
    name,
    ticker,
    hasToken,
    hasMeta,
    isMintFallback: hasToken && !hasMeta,
    mcLabel,
  };
}

export interface BalanceCheck {
  sufficient: boolean;
  requiredLamports: number;
  availableLamports: number;
  shortfallLamports: number;
}

/**
 * Decide whether a wallet can cover a transfer plus network fee and a small
 * safety buffer. Used to block the request BEFORE opening the wallet so users
 * never trigger an underfunded transaction (a common cause of scary wallet
 * warnings).
 */
export function checkOpeningBalance(
  balanceLamports: number,
  amountLamports: number,
  feeLamports: number,
  bufferLamports = 5000,
): BalanceCheck {
  const required = amountLamports + feeLamports + bufferLamports;
  const shortfall = Math.max(0, required - balanceLamports);
  return {
    sufficient: balanceLamports >= required,
    requiredLamports: required,
    availableLamports: balanceLamports,
    shortfallLamports: shortfall,
  };
}
