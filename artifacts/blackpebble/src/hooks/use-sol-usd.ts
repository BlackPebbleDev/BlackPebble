import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

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
