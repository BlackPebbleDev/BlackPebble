import { describe, it, expect } from "vitest";
import {
  classifyActivity,
  surfacesFor,
  categoryOf,
  domainOf,
  buildAggregateKey,
  type ActivityType,
} from "./taxonomy.js";

describe("classifyActivity", () => {
  const cases: Array<[string, string, ActivityType]> = [
    ["spot", "buy", "trade.buy"],
    ["spot", "sell", "trade.sell"],
    ["agg", "accumulated", "trade.accumulation"],
    ["agg", "exited", "trade.exit"],
    ["agg", "took_profits", "trade.exit"],
    ["leverage", "open", "trade.perp_opened"],
    ["leverage", "close", "trade.perp_closed"],
    ["leverage", "liquidated", "trade.liquidation"],
    ["callout", "call", "social.call"],
    ["thesis", "thesis", "social.thesis"],
    ["achievement", "earned", "progression.achievement_unlocked"],
    ["recovery", "cleanup", "wallet.cleanup_completed"],
    ["campaign", "launched", "campaign.created"],
    ["campaign", "funded", "campaign.goal_hit"],
    ["campaign", "completed", "campaign.executed"],
    ["milestone", "tier_up", "progression.tier_upgraded"],
    ["milestone", "follower_milestone", "social.follower_milestone"],
  ];

  it.each(cases)("maps (%s, %s) -> %s", (kind, action, expected) => {
    expect(classifyActivity(kind, action).type).toBe(expected);
  });

  it("maps campaign funded event to campaign.goal_hit (renamed)", () => {
    expect(classifyActivity("campaign", "funded").type).toBe(
      "campaign.goal_hit",
    );
  });

  it("falls back to generic milestone for unknown milestone kinds", () => {
    expect(classifyActivity("milestone", "dna_shift").type).toBe(
      "progression.milestone",
    );
  });

  it("falls back to activity.other for unknown kinds", () => {
    expect(classifyActivity("wat", "nope").type).toBe("activity.other");
  });

  it("returns matching surfaces for the type", () => {
    const c = classifyActivity("leverage", "liquidated");
    expect(c.surfaces).toEqual(surfacesFor("trade.liquidation"));
    expect(c.surfaces.toast).toBe("high");
  });
});

describe("prepared ActivityTypes exist with surface defaults", () => {
  // These have no publisher yet, but the contract must expose them so Phase
  // 3/4 can consume a stable vocabulary. surfacesFor must resolve each.
  const prepared: ActivityType[] = [
    "trade.tp_hit",
    "trade.sl_hit",
    "trade.pnl_milestone",
    "trade.best_trade",
    "social.follow",
    "social.reaction",
    "social.reaction_aggregate",
    "social.reply",
    "social.mention",
    "progression.rank_changed",
    "progression.score_changed",
    "progression.streak_milestone",
    "campaign.contribution",
    "campaign.goal_progress",
    "campaign.goal_hit",
    "campaign.failed",
    "campaign.expired",
    "campaign.refunded",
    "wallet.recovered_sol",
    "wallet.burn_completed",
    "wallet.burn_proof",
    "wallet.account_closed",
    "wallet.safety_warning",
  ];

  it.each(prepared)("resolves surfaces for %s", (type) => {
    const s = surfacesFor(type);
    expect(s).toBeDefined();
    expect(["none", "low", "normal", "high"]).toContain(s.toast);
    expect(["none", "trade_burst", "reaction", "campaign_progress"]).toContain(
      s.aggregate,
    );
  });

  it("no source classification still emits the old campaign.funded name", () => {
    const emitted = new Set(
      [
        ["campaign", "launched"],
        ["campaign", "funded"],
        ["campaign", "completed"],
      ].map(([k, a]) => classifyActivity(k, a).type),
    );
    expect(emitted.has("campaign.goal_hit" as ActivityType)).toBe(true);
    expect([...emitted]).not.toContain("campaign.funded");
  });
});

describe("surface defaults for key types", () => {
  it("keeps trades quiet by default", () => {
    expect(surfacesFor("trade.buy")).toEqual({
      feed: true,
      toast: "none",
      notify: false,
      aggregate: "trade_burst",
    });
    expect(surfacesFor("trade.sell").aggregate).toBe("trade_burst");
  });

  it("makes loss/liquidation/goal_hit loud", () => {
    expect(surfacesFor("trade.sl_hit").toast).toBe("high");
    expect(surfacesFor("trade.liquidation").toast).toBe("high");
    expect(surfacesFor("campaign.goal_hit").toast).toBe("high");
  });

  it("keeps interactions off the public feed (notify-only)", () => {
    for (const t of [
      "social.follow",
      "social.reaction",
      "social.reaction_aggregate",
      "social.reply",
      "social.mention",
    ] as ActivityType[]) {
      expect(surfacesFor(t).feed).toBe(false);
    }
  });

  it("hides individual account closes / contributions from the feed", () => {
    expect(surfacesFor("wallet.account_closed").feed).toBe(false);
    expect(surfacesFor("campaign.contribution").feed).toBe(false);
  });

  it("keeps safety warnings personal (notify, never public feed)", () => {
    const s = surfacesFor("wallet.safety_warning");
    expect(s.feed).toBe(false);
    expect(s.notify).toBe(true);
  });

  it("routes progress/contribution through campaign_progress rollup", () => {
    expect(surfacesFor("campaign.goal_progress").aggregate).toBe(
      "campaign_progress",
    );
    expect(surfacesFor("campaign.contribution").aggregate).toBe(
      "campaign_progress",
    );
  });
});

describe("activity.other safety fallback", () => {
  it("never leaks into the public feed and stays silent", () => {
    expect(surfacesFor("activity.other")).toEqual({
      feed: false,
      toast: "none",
      notify: false,
      aggregate: "none",
    });
  });

  it("unknown kinds classify to the safe fallback", () => {
    const c = classifyActivity("mystery", "unknown");
    expect(c.type).toBe("activity.other");
    expect(c.surfaces.feed).toBe(false);
  });
});

describe("categoryOf / domainOf", () => {
  it("preserves existing publisher categories", () => {
    // Behavior-preserving relocation of the two wired publishers.
    expect(categoryOf("progression.tier_upgraded")).toBe("reputation");
    expect(categoryOf("social.follower_milestone")).toBe("social");
  });

  it("derives the namespace domain", () => {
    expect(domainOf("trade.buy")).toBe("trade");
    expect(domainOf("wallet.cleanup_completed")).toBe("wallet");
  });
});

describe("buildAggregateKey", () => {
  it("builds a trade burst key when context is complete", () => {
    expect(
      buildAggregateKey("trade_burst", { userId: 7, mint: "abc", side: "buy" }),
    ).toBe("trade:7:abc:buy");
  });

  it("returns null when trade burst context is incomplete", () => {
    expect(buildAggregateKey("trade_burst", { userId: 7 })).toBeNull();
  });

  it("builds reaction + campaign keys", () => {
    expect(buildAggregateKey("reaction", { eventId: "spot-9" })).toBe(
      "reaction:spot-9",
    );
    expect(
      buildAggregateKey("campaign_progress", { campaignId: "camp1" }),
    ).toBe("campaign:camp1");
  });

  it("returns null for the none policy", () => {
    expect(buildAggregateKey("none", { userId: 1, mint: "x", side: "buy" })).toBeNull();
  });
});
