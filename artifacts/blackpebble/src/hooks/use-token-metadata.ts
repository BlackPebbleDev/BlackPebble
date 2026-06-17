import { useEffect, useMemo, useRef, useState } from "react";
import { api, type RecoveryTokenMeta } from "@/lib/api";

export interface UseTokenMetadata {
  /** Resolved metadata keyed by mint. Absent entries are still loading. */
  metaByMint: Map<string, RecoveryTokenMeta>;
  /** True while a batch lookup for newly-seen mints is in flight. */
  isLoading: boolean;
}

const UNKNOWN: RecoveryTokenMeta = { symbol: null, name: null, logo: null };

/**
 * Resolve token metadata (symbol/name/logo) for a set of mints via the batch
 * recovery endpoint. Purely a display enrichment for the recovery list — it
 * never affects scanning or the close/recovery flow. Results are remembered for
 * the lifetime of the hook, so re-scans and selection changes never refetch a
 * mint we have already seen. Best-effort: on failure, mints fall back to the
 * UI's "Unknown Token" rendering.
 */
export function useTokenMetadata(mints: string[]): UseTokenMetadata {
  const [metaByMint, setMetaByMint] = useState<Map<string, RecoveryTokenMeta>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);
  // Persistent cache across renders so we only ever fetch a mint once.
  const cacheRef = useRef<Map<string, RecoveryTokenMeta>>(new Map());

  const uniqueMints = useMemo(
    () => [...new Set(mints.filter(Boolean))].sort(),
    [mints],
  );
  const key = uniqueMints.join(",");

  useEffect(() => {
    const missing = uniqueMints.filter((m) => !cacheRef.current.has(m));

    if (missing.length === 0) {
      // Everything is cached — reflect the current selection from the cache.
      setMetaByMint(new Map(cacheRef.current));
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    api.recovery
      .tokenMetadata(missing)
      .then((res) => {
        if (cancelled) return;
        const tokens = res.tokens ?? {};
        for (const mint of missing) {
          cacheRef.current.set(mint, tokens[mint] ?? UNKNOWN);
        }
        setMetaByMint(new Map(cacheRef.current));
      })
      .catch(() => {
        // Leave missing mints uncached; the row renders its loading/unknown
        // fallback. A later scan can retry them.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `key` is the stable identity of uniqueMints; depending on the array
    // itself would refire every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { metaByMint, isLoading };
}
