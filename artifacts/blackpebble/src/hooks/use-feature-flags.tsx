import { useQuery } from "@tanstack/react-query";
import { api, type FeatureFlags } from "@/lib/api";

const DEFAULT_FLAGS: FeatureFlags = {
  buy_limits: true,
  tp_sl: true,
  multi_target_tp: true,
  experimental_utilities: true,
  // Leverage is the one capability that ships off - never reveal it until the
  // server confirms it is enabled.
  leverage: false,
  real_trading_analysis: false,
  community_campaigns: false,
};

/**
 * Reads the public feature flags. While loading (or on error) it falls back to
 * the defaults above so the trading UI never hides an always-on capability
 * spuriously. The query key is shared so every consumer dedupes onto one
 * request.
 *
 * `ready` is true once the server has actually answered — pages that redirect
 * away when their flag is off MUST wait for it, otherwise a direct navigation
 * bounces on the defaults before the real flags arrive.
 */
export function useFeatureFlags(): FeatureFlags & { ready: boolean } {
  const { data, isSuccess } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => api.featureFlags(),
    staleTime: 60_000,
  });
  return { ...(data?.flags ?? DEFAULT_FLAGS), ready: isSuccess };
}
