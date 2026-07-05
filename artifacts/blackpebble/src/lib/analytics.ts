/**
 * Lightweight funnel / activity beacons.
 *
 * Guests live entirely client-side, so these fire-and-forget POSTs are the only
 * way the admin dashboard can see the guest funnel (created → traded →
 * converted) and basic page activity. Failures are swallowed - analytics must
 * never affect the user's session. No PII is sent; `anonId` is the random
 * per-device id from the guest store.
 */
import { api, type AnalyticsEventType } from "./api";

const FLAG_PREFIX = "bp:analytics:";

/** Returns true the first time `key` is seen on this device, then marks it. */
function oncePerDevice(key: string): boolean {
  try {
    const k = FLAG_PREFIX + key;
    if (localStorage.getItem(k)) return false;
    localStorage.setItem(k, "1");
    return true;
  } catch {
    return true;
  }
}

/** Returns true the first time `key` is seen this session (tab), then marks it. */
function oncePerSession(key: string): boolean {
  try {
    const k = FLAG_PREFIX + key;
    if (sessionStorage.getItem(k)) return false;
    sessionStorage.setItem(k, "1");
    return true;
  } catch {
    return true;
  }
}

function fire(type: AnalyticsEventType, anonId?: string | null): void {
  void api.analytics.track(type, anonId).catch(() => {});
}

/** A device became a guest (first time the guest store is initialized). */
export function trackGuestCreated(anonId: string): void {
  if (oncePerDevice("guest_created")) fire("guest_created", anonId);
}

/** A guest placed their first-ever trade. Deduped per device. */
export function trackGuestFirstTrade(anonId: string): void {
  if (oncePerDevice("guest_first_trade")) fire("guest_first_trade", anonId);
}

/** A guest placed their second-ever trade. Deduped per device. */
export function trackGuestSecondTrade(anonId: string): void {
  if (oncePerDevice("guest_second_trade")) fire("guest_second_trade", anonId);
}

/** A guest converted to a registered wallet (migration succeeded). */
export function trackGuestConverted(anonId: string): void {
  fire("guest_converted", anonId);
}

/** First time a guest searches on this device (funnel: discovery). */
export function trackWalletSearch(anonId?: string | null): void {
  if (oncePerDevice("wallet_search")) fire("wallet_search", anonId);
}

/** First time a guest opens a token's detail/trading view on this device. */
export function trackTokenView(anonId?: string | null): void {
  if (oncePerDevice("token_view")) fire("token_view", anonId);
}

/** A guest connected an X account (login redirect succeeded). First-touch. */
export function trackXConnect(anonId?: string | null): void {
  if (oncePerDevice("x_connect")) fire("x_connect", anonId);
}

/** Portfolio page viewed (once per session). */
export function trackPortfolioView(): void {
  if (oncePerSession("portfolio_view")) fire("portfolio_view");
}

/** Leaderboard page viewed (once per session). */
export function trackLeaderboardView(): void {
  if (oncePerSession("leaderboard_view")) fire("leaderboard_view");
}

// ── Social layer (Phase 1) ──────────────────────────────────────────────────

/** Feed page viewed (once per session). */
export function trackFeedView(): void {
  if (oncePerSession("feed_view")) fire("feed_view");
}

/** Profile page viewed (every view). */
export function trackProfileView(): void {
  fire("profile_view");
}

/** A follow relationship was created. */
export function trackFollowCreated(): void {
  fire("follow_created");
}

/** A follow relationship was removed. */
export function trackFollowRemoved(): void {
  fire("follow_removed");
}

/** The user switched the active feed tab. */
export function trackFeedTabChanged(): void {
  fire("feed_tab_changed");
}

/** An outbound link to an X profile was clicked. */
export function trackXProfileLinkClicked(): void {
  fire("x_profile_link_clicked");
}
