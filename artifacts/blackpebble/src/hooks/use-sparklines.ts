import { useQuery } from "@tanstack/react-query";
import { api, type SparklineWindow } from "@/lib/api";

/**
 * Batched sparkline history for a list of token cards. Every visible mint is
 * fetched in ONE request (the server resolves pools + caches per mint), so a
 * 30-card list costs a single round-trip rather than one call per card.
 *
 * The query key is the SORTED mint set so the cache is stable regardless of the
 * order rows arrive in, and so revealing more rows ("Load More") refetches only
 * when the set actually changes. Returns a lookup:
 *   - `number[]`  → draw the line
 *   - `null`      → no usable history (render neutral placeholder)
 *   - `undefined` → still loading (render loading placeholder)
 */
export function useSparklines(
  mints: string[],
  window: SparklineWindow = "24h",
): Record<string, number[] | null | undefined> {
  const unique = [...new Set(mints.filter(Boolean))];
  const sortedKey = [...unique].sort();

  const { data } = useQuery({
    queryKey: ["sparklines", window, sortedKey],
    queryFn: () => api.sparklines(unique, window),
    enabled: unique.length > 0,
    // Match the server's 24h cache cadence so we don't refetch needlessly.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return data?.sparklines ?? {};
}
