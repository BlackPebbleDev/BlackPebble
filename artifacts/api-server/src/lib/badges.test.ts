import { describe, it, expect } from "vitest";
import {
  evaluateBadges,
  BADGE_DEFINITIONS,
  NON_FEED_BADGE_KEYS,
  type BadgeMetrics,
} from "./badges.js";

/** Zeroed metrics; override only the fields a case cares about. */
function metrics(overrides: Partial<BadgeMetrics> = {}): BadgeMetrics {
  return {
    userId: 1000,
    closedTrades: 0,
    realizedPnlSol: 0,
    roiPercent: 0,
    traderRank: null,
    callsMade: 0,
    bestMultiple: null,
    callerRank: null,
    hitRate: 0,
    gradedCalls: 0,
    thesisCount: 0,
    watchlistCount: 0,
    followers: 0,
    hasBio: false,
    hasAvatar: false,
    recoveryAccountsClosed: 0,
    recoverySolRecovered: 0,
    recoveryCleanups: 0,
    recoveryTokensBurned: 0,
    realTradesAnalyzed: 0,
    hasVerifiedWalletAnalysis: false,
    ...overrides,
  };
}

describe("watchlist achievements", () => {
  it("unlocks nothing with an empty watchlist", () => {
    const e = evaluateBadges(metrics({ watchlistCount: 0 }));
    expect(e.first_watch.earned).toBe(false);
    expect(e.watchlist_builder.earned).toBe(false);
  });

  it("unlocks First Watch at the first token (>=1)", () => {
    const e = evaluateBadges(metrics({ watchlistCount: 1 }));
    expect(e.first_watch.earned).toBe(true);
    expect(e.watchlist_builder.earned).toBe(false);
    // Count-based progress is exposed for the UI bar.
    expect(e.watchlist_builder.progress).toEqual({ current: 1, target: 3 });
  });

  it("unlocks Watchlist Builder at 3 tokens (both earned)", () => {
    const e = evaluateBadges(metrics({ watchlistCount: 3 }));
    expect(e.first_watch.earned).toBe(true);
    expect(e.watchlist_builder.earned).toBe(true);
  });
});

describe("watchlist achievements are feed-worthy", () => {
  it("both watchlist badges exist in the catalogue", () => {
    const keys = new Set(BADGE_DEFINITIONS.map((d) => d.key));
    expect(keys.has("first_watch")).toBe(true);
    expect(keys.has("watchlist_builder")).toBe(true);
  });

  // Regression guard for the exact bug: watchlist unlocks never reached the
  // feed because they were flagged feed:false and excluded from the feed union.
  it("does not exclude watchlist badges from the feed", () => {
    expect(NON_FEED_BADGE_KEYS).not.toContain("first_watch");
    expect(NON_FEED_BADGE_KEYS).not.toContain("watchlist_builder");
  });

  it("still treats profile_complete as a non-feed setup badge", () => {
    expect(NON_FEED_BADGE_KEYS).toContain("profile_complete");
  });
});
