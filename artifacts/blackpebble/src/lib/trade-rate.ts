/**
 * Pure SOL/USD rate selection for the trade panels. No React, no I/O - unit-tested.
 *
 * The bug this guards against: the trade panels used to derive the SOL/USD rate
 * straight from the per-token quote (priceUsd / priceSol). When that quote is
 * stale or partial the ratio collapses toward ~1, so a 56.83 SOL balance rendered
 * as "$56.83" and a $500 margin check (500 / 1 = 500 SOL > 56.83) falsely failed.
 *
 * The fix: always SIZE and VALIDATE against the authoritative, position-independent
 * app rate (useSolUsd → /markets/sol-price → getSolPriceUsd). The per-token quote
 * is a DISPLAY fallback only and is never used to size or validate an order.
 */

/** When the token-derived and authoritative rates diverge by more than this
 *  factor the token quote is treated as untrustworthy (anomaly) and never used
 *  for sizing - it only ever feeds USD display before the authoritative rate
 *  loads. */
export const RATE_ANOMALY_FACTOR = 3;

/** Token-derived SOL/USD rate from a quote, or null when not derivable. */
export function solUsdFromInfo(info: {
  priceUsd: number | null;
  priceSol: number | null;
}): number | null {
  const { priceUsd, priceSol } = info;
  return priceUsd != null &&
    priceSol != null &&
    Number.isFinite(priceUsd) &&
    Number.isFinite(priceSol) &&
    priceSol > 0
    ? priceUsd / priceSol
    : null;
}

export interface TradeRate {
  /** Best-effort rate for USD *display* (authoritative preferred, token fallback). */
  solUsd: number;
  /** Trusted rate for sizing/validation. null until the authoritative rate loads. */
  rate: number | null;
  /** Whether an order may be sized/submitted (authoritative rate present). */
  rateReady: boolean;
  /** True when the token quote diverges wildly from the authoritative rate. */
  anomaly: boolean;
}

/**
 * Choose the rate a trade panel should use.
 *
 * @param authoritative app-wide SOL/USD rate (0 until loaded)
 * @param tokenDerived  per-token quote rate (display fallback only; may be null)
 */
export function selectTradeRate(
  authoritative: number,
  tokenDerived: number | null,
): TradeRate {
  const authOk = Number.isFinite(authoritative) && authoritative > 0;
  const tokenOk =
    tokenDerived != null && Number.isFinite(tokenDerived) && tokenDerived > 0;

  const anomaly =
    authOk && tokenOk
      ? tokenDerived! / authoritative > RATE_ANOMALY_FACTOR ||
        authoritative / tokenDerived! > RATE_ANOMALY_FACTOR
      : false;

  return {
    solUsd: authOk ? authoritative : tokenOk ? tokenDerived! : 0,
    rate: authOk ? authoritative : null,
    rateReady: authOk,
    anomaly,
  };
}

/**
 * Convert a raw amount expressed in `unit` to SOL using the TRUSTED rate.
 * Returns NaN when the amount is invalid, or when a USD amount cannot be
 * converted because no trusted rate is available (so callers fail closed).
 */
export function amountToSol(
  raw: string | number,
  unit: "SOL" | "USD",
  rate: number | null,
): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  if (unit === "SOL") return n;
  return rate != null && rate > 0 ? n / rate : NaN;
}
