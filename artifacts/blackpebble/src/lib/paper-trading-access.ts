import type { FeatureFlags } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

/**
 * Centralised access rules for paper trading.
 *
 * The admin-controlled `public_paper_trading` flag lets visitors use Spot and
 * Perps paper trading without an X sign-in — handy during external review. When
 * it is ON, guest/demo trades run entirely client-side (localStorage) and never
 * touch public profiles, reputation, achievements, the feed or the leaderboard;
 * saving to those systems still requires signing in with X.
 *
 * These helpers are the single source of truth for auth-wall / nudge rendering,
 * so the gating logic lives in one place instead of being duplicated across the
 * trading panels.
 */

type FlagCtx = { flags: FeatureFlags; isGuest: boolean };

/** Whether the admin has enabled public (no-login) paper trading. */
export function isPublicPaperTradingEnabled(
  flags: Pick<FeatureFlags, "public_paper_trading">,
): boolean {
  return !!flags.public_paper_trading;
}

/**
 * Spot paper trading has always been guest-capable via the client-side guest
 * engine, so it is available to everyone. Signed-in users additionally persist
 * their trades server-side.
 */
export function canUseSpotPaperTrading(): boolean {
  return true;
}

/**
 * Perps paper trading requires the `leverage` capability to be live. Signed-in
 * users can always use it; guests can only use it (as demo trades) when public
 * paper trading is enabled.
 */
export function canUsePerpsPaperTrading({ flags, isGuest }: FlagCtx): boolean {
  if (!flags.leverage) return false;
  return isGuest ? isPublicPaperTradingEnabled(flags) : true;
}

/**
 * Whether to show the "Connect X" nudges / auth walls to a guest. When public
 * paper trading is on they are suppressed so a reviewer sees a clean product;
 * the X login button in the header stays available regardless.
 */
export function shouldShowXAuthNudge({ flags, isGuest }: FlagCtx): boolean {
  if (!isGuest) return false;
  return !isPublicPaperTradingEnabled(flags);
}

/**
 * A guest operating in demo mode: unauthenticated + public paper trading on.
 * Their trades must never be written to public reputation/profile/leaderboard
 * systems.
 */
export function isGuestDemoTrader({ flags, isGuest }: FlagCtx): boolean {
  return isGuest && isPublicPaperTradingEnabled(flags);
}

/** Live-bound convenience hook composing the flags + auth state. */
export function usePaperTradingAccess() {
  const flags = useFeatureFlags();
  const { isGuest } = useAccount();
  const ctx: FlagCtx = { flags, isGuest };
  return {
    isGuest,
    publicPaperTradingEnabled: isPublicPaperTradingEnabled(flags),
    canUseSpot: canUseSpotPaperTrading(),
    canUsePerps: canUsePerpsPaperTrading(ctx),
    showXAuthNudge: shouldShowXAuthNudge(ctx),
    isGuestDemo: isGuestDemoTrader(ctx),
  };
}
