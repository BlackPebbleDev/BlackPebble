/**
 * Lightweight funnel / activity beacons.
 *
 * Guests live entirely client-side, so these fire-and-forget POSTs are the only
 * way the admin dashboard can see the guest funnel (created → traded →
 * converted) and basic page activity. Failures are swallowed - analytics must
 * never affect the user's session. No PII is sent; `anonId` is the random
 * per-device id from the guest store.
 */
import { api, type AnalyticsEventType, type AnalyticsEventProps } from "./api";

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

function fire(
  type: AnalyticsEventType,
  anonId?: string | null,
  props?: AnalyticsEventProps,
): void {
  void api.analytics.track(type, anonId, props).catch(() => {});
}

/** Academy events never carry an anonId; they carry a typed props payload. */
function fireAcademy(
  type: AnalyticsEventType,
  props?: AcademyEventProps,
): void {
  fire(type, null, props);
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

// ── Academy (education) ─────────────────────────────────────────────────────
// Beacons carry a small, typed, non-sensitive props payload (lesson slug,
// category, module id, chain scope, source surface, etc). The backend
// re-validates every field against an allowlist. Session dedup keys include the
// relevant identity so per-lesson / per-module events are not over-suppressed.

/** Where an Academy event originated (feeds `sourceSurface`). */
export type AcademySourceSurface =
  | "academy-home"
  | "category-page"
  | "lesson-page"
  | "global-search"
  | "learning-path"
  | "product-portfolio"
  | "product-trading-desk"
  | "product-markets"
  | "product-wallet"
  | "product-trader-intelligence";

export type AcademyEventProps = AnalyticsEventProps;

/** Academy homepage viewed (once per session). */
export function trackAcademyViewed(props?: AcademyEventProps): void {
  if (oncePerSession("academy_viewed")) fireAcademy("academy_viewed", props);
}

/** An Academy search was performed (first per session). */
export function trackAcademySearchPerformed(props?: AcademyEventProps): void {
  if (oncePerSession("academy_search_performed")) {
    fireAcademy("academy_search_performed", props);
  }
}

/** An Academy search returned no results (first per session). */
export function trackAcademySearchZeroResults(props?: AcademyEventProps): void {
  if (oncePerSession("academy_search_zero_results")) {
    fireAcademy("academy_search_zero_results", props);
  }
}

/** A category page was viewed. */
export function trackAcademyCategoryViewed(props?: AcademyEventProps): void {
  fireAcademy("academy_category_viewed", props);
}

/** A lesson page was viewed. */
export function trackAcademyLessonViewed(props?: AcademyEventProps): void {
  fireAcademy("academy_lesson_viewed", props);
}

/** A related lesson link was clicked. */
export function trackAcademyRelatedLessonClicked(props?: AcademyEventProps): void {
  fireAcademy("academy_related_lesson_clicked", props);
}

/** A related BlackPebble feature link was clicked from a lesson. */
export function trackAcademyRelatedFeatureClicked(
  props?: AcademyEventProps,
): void {
  fireAcademy("academy_related_feature_clicked", props);
}

/** An interactive module was opened (first per module per session). */
export function trackAcademyInteractiveStarted(props?: AcademyEventProps): void {
  const key = `academy_interactive_started:${props?.moduleId ?? "unknown"}`;
  if (oncePerSession(key)) fireAcademy("academy_interactive_started", props);
}

/** The user meaningfully completed an interactive module (first per module). */
export function trackAcademyInteractiveCompleted(
  props?: AcademyEventProps,
): void {
  const key = `academy_interactive_completed:${props?.moduleId ?? "unknown"}`;
  if (oncePerSession(key)) fireAcademy("academy_interactive_completed", props);
}

/** A practice challenge / practice CTA was started (first per module). */
export function trackAcademyPracticeStarted(props?: AcademyEventProps): void {
  const key = `academy_practice_started:${props?.moduleId ?? "unknown"}`;
  if (oncePerSession(key)) fireAcademy("academy_practice_started", props);
}

/** A lesson share action was used. */
export function trackAcademyShareClicked(props?: AcademyEventProps): void {
  fireAcademy("academy_share_clicked", props);
}

/** A learning path was started (first per path per session). */
export function trackAcademyPathStarted(props?: AcademyEventProps): void {
  const key = `academy_path_started:${props?.learningPathId ?? "unknown"}`;
  if (oncePerSession(key)) fireAcademy("academy_path_started", props);
}

/** A learning-path step was viewed. */
export function trackAcademyPathStepViewed(props?: AcademyEventProps): void {
  fireAcademy("academy_path_step_viewed", props);
}

/** A learning path was completed (first per path per session). */
export function trackAcademyPathCompleted(props?: AcademyEventProps): void {
  const key = `academy_path_completed:${props?.learningPathId ?? "unknown"}`;
  if (oncePerSession(key)) fireAcademy("academy_path_completed", props);
}
