import { useQuery } from "@tanstack/react-query";
import { api, type FeatureFlags } from "@/lib/api";

const DEFAULT_FLAGS: FeatureFlags = {
  buy_limits: true,
  tp_sl: true,
  multi_target_tp: true,
  experimental_utilities: true,
  // Leverage is the one capability that ships off — never reveal it until the
  // server confirms it is enabled.
  leverage: false,
};

/**
 * Reads the public feature flags. While loading (or on error) it falls back to
 * the defaults above so the trading UI never hides an always-on capability
 * spuriously. The query key is shared so every consumer dedupes onto one
 * request.
 */
export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => api.featureFlags(),
    staleTime: 60_000,
  });
  return data?.flags ?? DEFAULT_FLAGS;
}
