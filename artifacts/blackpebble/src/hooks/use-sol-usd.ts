import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  selectTradeRate,
  solUsdFromInfo,
  type TradeRate,
} from "@/lib/trade-rate";

/**
 * The current SOL/USD rate, fetched once and refreshed on a slow cadence and
 * shared across the app via a single query key. Pages use it so USD values
 * (the default display currency) render even when there are no positions or
 * trades to derive a rate from. Returns 0 until the first fetch resolves.
 */
export function useSolUsd(): number {
  const { data } = useQuery({
    queryKey: ["sol-usd"],
    queryFn: () => api.solPrice(),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
  return data?.solUsd ?? 0;
}

/**
 * The SOL/USD rate the trade panels (spot, leverage, planners) MUST use. It
 * prefers the authoritative, position-independent app rate and only falls back
 * to the per-token quote for USD *display* while that rate loads — never for
 * sizing or validating an order. `rateReady` gates order submission so a trade
 * can never execute against an untrusted rate, and a wild divergence between the
 * token quote and the authoritative rate is logged as a desync diagnostic.
 */
export function useTradeRate(info: {
  mint?: string;
  priceUsd: number | null;
  priceSol: number | null;
}): TradeRate {
  const authoritative = useSolUsd();
  const result = selectTradeRate(authoritative, solUsdFromInfo(info));

  // Desync detection: a token quote that diverges wildly from the authoritative
  // rate means the quote is stale/partial. We never size against it (selectTradeRate
  // already ignores it), but we log it once per token so the anomaly is visible
  // in diagnostics rather than silently corrupting a USD display.
  const warnedMint = useRef<string | null>(null);
  useEffect(() => {
    if (result.anomaly && warnedMint.current !== (info.mint ?? null)) {
      warnedMint.current = info.mint ?? null;
      console.warn(
        "[balance] SOL/USD rate anomaly — token quote diverges from the authoritative rate; using authoritative.",
        {
          mint: info.mint,
          authoritative,
          tokenDerived: solUsdFromInfo(info),
          priceUsd: info.priceUsd,
          priceSol: info.priceSol,
        },
      );
    }
    if (!result.anomaly && warnedMint.current === (info.mint ?? null)) {
      warnedMint.current = null;
    }
  }, [result.anomaly, info.mint, authoritative, info.priceUsd, info.priceSol]);

  return result;
}
