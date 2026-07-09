/**
 * BlackPebble Activity Layer — canonical event taxonomy (Phase 2 foundation).
 *
 * This is the ONE normalized vocabulary that every surface reads from: the
 * feed today, and premium toasts + the notification center + profile activity
 * + reputation + share cards later. It is a thin, additive normalization over
 * the existing feed model: the read model still derives cards from source
 * tables and publishes milestones exactly as before; this module simply maps
 * each item's loose (kind, action) pair onto a stable `ActivityType` plus a
 * `surfaces` routing descriptor.
 *
 * Pure and dependency-free on purpose — no DB, no I/O, unit-tested — so it can
 * be reused from the read model, publishers, and (later) the toast/notification
 * fan-out without risk.
 */

export type ActivityDomain =
  | "trade"
  | "social"
  | "progression"
  | "campaign"
  | "wallet"
  | "activity";

/**
 * The canonical, namespaced event type. Derived events (trades, calls, etc.)
 * and published milestones both normalize onto this. Fallback members
 * (`*.milestone`, `activity.other`) keep classification total for future
 * kinds we haven't modeled yet.
 */
export type ActivityType =
  // ── Trading ────────────────────────────────────────────────────────────
  // WIRED (derived from source tables today):
  | "trade.buy"
  | "trade.sell"
  | "trade.accumulation"
  | "trade.exit"
  | "trade.perp_opened"
  | "trade.perp_closed"
  | "trade.liquidation"
  // PREPARED (no publisher emits these yet):
  | "trade.tp_hit"
  | "trade.sl_hit"
  | "trade.pnl_milestone"
  | "trade.best_trade"
  // ── Social ─────────────────────────────────────────────────────────────
  // WIRED:
  | "social.call"
  | "social.thesis"
  | "social.follower_milestone"
  // PREPARED:
  | "social.follow"
  | "social.reaction"
  | "social.reaction_aggregate"
  | "social.reply"
  | "social.mention"
  // ── Progression / reputation ─────────────────────────────────────────────
  // WIRED:
  | "progression.achievement_unlocked"
  | "progression.tier_upgraded"
  // PREPARED:
  | "progression.rank_changed"
  | "progression.score_changed"
  | "progression.streak_milestone"
  // ── Campaigns ────────────────────────────────────────────────────────────
  // WIRED:
  | "campaign.created"
  | "campaign.goal_hit"
  | "campaign.executed"
  // PREPARED:
  | "campaign.contribution"
  | "campaign.goal_progress"
  | "campaign.failed"
  | "campaign.expired"
  | "campaign.refunded"
  // ── Wallet utilities ─────────────────────────────────────────────────────
  // WIRED:
  | "wallet.cleanup_completed"
  // PREPARED:
  | "wallet.recovered_sol"
  | "wallet.burn_completed"
  | "wallet.burn_proof"
  | "wallet.account_closed"
  | "wallet.safety_warning"
  // ── Generic fallbacks (keep classification total) ─────────────────────────
  | "progression.milestone"
  | "social.milestone"
  | "activity.other";

/** How loud an event is allowed to be. Phase 3 toasts consume this. */
export type ToastPriority = "none" | "low" | "normal" | "high";

/**
 * How an event should be rolled up when it bursts. Phase 3/4 aggregation
 * (reaction rollups, trade bursts, campaign progress) consume this; the read
 * model already collapses `trade_burst` for spot trades today.
 */
export type AggregatePolicy =
  | "none"
  | "trade_burst"
  | "reaction"
  | "campaign_progress";

/**
 * Where a single event is allowed to appear and how loudly. This is the
 * event's INTRINSIC importance — the recipient/viewer decision (self vs
 * follower vs global) is made later by the toast/notification layer.
 */
export interface ActivitySurfaces {
  /** Renders as a feed card. */
  feed: boolean;
  /** Toast loudness (Phase 3). `none` = never interrupts. */
  toast: ToastPriority;
  /** Eligible for the notification center (Phase 3). */
  notify: boolean;
  /** Roll-up policy for bursts (Phase 3/4). */
  aggregate: AggregatePolicy;
}

/**
 * Surface routing per canonical type. These are sensible, tunable defaults —
 * design metadata only in Phase 2 (nothing consumes toast/notify yet). Trades
 * never toast globally (fill toasts for the actor are a Phase 4 self-notify
 * path); high-signal social/progression/campaign moments are louder.
 */
const SURFACES: Record<ActivityType, ActivitySurfaces> = {
  // Trading — quiet by default (high volume); loud only on notable outcomes.
  "trade.buy": { feed: true, toast: "none", notify: false, aggregate: "trade_burst" },
  "trade.sell": { feed: true, toast: "none", notify: false, aggregate: "trade_burst" },
  "trade.accumulation": { feed: true, toast: "none", notify: false, aggregate: "none" },
  "trade.exit": { feed: true, toast: "none", notify: false, aggregate: "none" },
  "trade.perp_opened": { feed: true, toast: "none", notify: false, aggregate: "none" },
  "trade.perp_closed": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "trade.liquidation": { feed: true, toast: "high", notify: true, aggregate: "none" },
  "trade.tp_hit": { feed: true, toast: "high", notify: true, aggregate: "none" },
  "trade.sl_hit": { feed: true, toast: "high", notify: true, aggregate: "none" },
  "trade.pnl_milestone": { feed: true, toast: "normal", notify: true, aggregate: "none" },
  "trade.best_trade": { feed: true, toast: "high", notify: true, aggregate: "none" },
  // Social — high-signal content is loud; interactions are notify-only.
  "social.call": { feed: true, toast: "normal", notify: true, aggregate: "reaction" },
  "social.thesis": { feed: true, toast: "low", notify: true, aggregate: "reaction" },
  "social.follower_milestone": { feed: true, toast: "normal", notify: true, aggregate: "none" },
  "social.follow": { feed: false, toast: "low", notify: true, aggregate: "none" },
  "social.reaction": { feed: false, toast: "none", notify: false, aggregate: "reaction" },
  "social.reaction_aggregate": { feed: false, toast: "normal", notify: true, aggregate: "reaction" },
  "social.reply": { feed: false, toast: "normal", notify: true, aggregate: "none" },
  "social.mention": { feed: false, toast: "normal", notify: true, aggregate: "none" },
  // Progression — celebratory, escalating with prestige; rate-limited later.
  "progression.achievement_unlocked": { feed: true, toast: "normal", notify: true, aggregate: "none" },
  "progression.tier_upgraded": { feed: true, toast: "high", notify: true, aggregate: "none" },
  "progression.rank_changed": { feed: true, toast: "normal", notify: true, aggregate: "none" },
  "progression.score_changed": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "progression.streak_milestone": { feed: true, toast: "normal", notify: true, aggregate: "none" },
  // Campaigns — funding momentum; per-contribution noise rolls up.
  "campaign.created": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "campaign.goal_hit": { feed: true, toast: "high", notify: true, aggregate: "none" },
  "campaign.executed": { feed: true, toast: "normal", notify: true, aggregate: "none" },
  "campaign.contribution": { feed: false, toast: "none", notify: true, aggregate: "campaign_progress" },
  "campaign.goal_progress": { feed: true, toast: "low", notify: true, aggregate: "campaign_progress" },
  "campaign.failed": { feed: true, toast: "normal", notify: true, aggregate: "none" },
  "campaign.expired": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "campaign.refunded": { feed: false, toast: "low", notify: true, aggregate: "none" },
  // Wallet utilities — share-worthy wins summarized; per-account noise hidden.
  "wallet.cleanup_completed": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "wallet.recovered_sol": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "wallet.burn_completed": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "wallet.burn_proof": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "wallet.account_closed": { feed: false, toast: "none", notify: false, aggregate: "none" },
  "wallet.safety_warning": { feed: false, toast: "high", notify: true, aggregate: "none" },
  // Generic fallbacks. progression/social.milestone back future PUBLISHED
  // milestones (feed-worthy). activity.other is the safety net for anything
  // unrecognized — it must NOT leak into the public feed by default.
  "progression.milestone": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "social.milestone": { feed: true, toast: "low", notify: true, aggregate: "none" },
  "activity.other": { feed: false, toast: "none", notify: false, aggregate: "none" },
};

/** The domain (namespace) of a canonical type, e.g. "trade" for "trade.buy". */
export function domainOf(type: ActivityType): ActivityDomain {
  return type.slice(0, type.indexOf(".")) as ActivityDomain;
}

/**
 * The `feed_events.category` bucket for a canonical type. Matches the values
 * the existing publishers already used ("reputation" for tiers, "social" for
 * follower milestones), so relocating them through the router is behavior-
 * preserving.
 */
export function categoryOf(type: ActivityType): string {
  switch (domainOf(type)) {
    case "trade":
      return "trading";
    case "social":
      return "social";
    case "progression":
      return "reputation";
    case "campaign":
      return "campaign";
    case "wallet":
      return "wallet";
    default:
      return "activity";
  }
}

/** The surface routing for a canonical type. */
export function surfacesFor(type: ActivityType): ActivitySurfaces {
  return SURFACES[type] ?? SURFACES["activity.other"];
}

/** Map a feed item's storage (kind, action) pair onto a canonical type. */
function typeFor(kind: string, action: string): ActivityType {
  switch (kind) {
    case "spot":
      return action === "buy" ? "trade.buy" : "trade.sell";
    case "agg":
      return action === "accumulated" ? "trade.accumulation" : "trade.exit";
    case "leverage":
      if (action === "open") return "trade.perp_opened";
      if (action === "liquidated") return "trade.liquidation";
      return "trade.perp_closed";
    case "callout":
      return "social.call";
    case "thesis":
      return "social.thesis";
    case "achievement":
      return "progression.achievement_unlocked";
    case "recovery":
      return "wallet.cleanup_completed";
    case "campaign":
      // Source event_key 'funded' = the goal was reached.
      if (action === "funded") return "campaign.goal_hit";
      if (action === "completed") return "campaign.executed";
      return "campaign.created";
    case "milestone":
      if (action === "tier_up") return "progression.tier_upgraded";
      if (action === "follower_milestone") return "social.follower_milestone";
      return "progression.milestone";
    default:
      return "activity.other";
  }
}

/**
 * Classify a feed item into the canonical taxonomy. Total (never throws) — an
 * unrecognized (kind, action) falls back to `activity.other`.
 */
export function classifyActivity(
  kind: string,
  action: string,
): { type: ActivityType; surfaces: ActivitySurfaces } {
  const type = typeFor(kind, action);
  return { type, surfaces: surfacesFor(type) };
}

/** Context for building a concrete aggregate key from a policy. */
export interface AggregateContext {
  userId?: number | null;
  mint?: string | null;
  side?: string | null;
  eventId?: string | null;
  campaignId?: string | null;
}

/**
 * Build the concrete roll-up key for an aggregate policy, or null when there
 * isn't enough context (or the policy is `none`). Phase 3/4 uses this to
 * collapse bursts, e.g. `trade:{user}:{mint}:{side}` or `reaction:{eventId}`.
 */
export function buildAggregateKey(
  policy: AggregatePolicy,
  ctx: AggregateContext,
): string | null {
  switch (policy) {
    case "trade_burst":
      if (ctx.userId == null || !ctx.mint || !ctx.side) return null;
      return `trade:${ctx.userId}:${ctx.mint}:${ctx.side}`;
    case "reaction":
      return ctx.eventId ? `reaction:${ctx.eventId}` : null;
    case "campaign_progress":
      return ctx.campaignId ? `campaign:${ctx.campaignId}` : null;
    default:
      return null;
  }
}
