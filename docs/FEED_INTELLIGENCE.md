# BlackPebble Feed — Activity Intelligence Engine

Status: Phase 1 shipped (aggregation, reactions, milestone events, tabs).
Phase 2 shipped (canonical Activity Layer taxonomy + publisher router + noise
toolbox — additive, no schema change). Owner doc for the feed upgrade. Read
alongside `lib/feed.ts`, `lib/feed-aggregate.ts`, `lib/feed-service.ts`,
`lib/feed-schema.ts`, and `lib/activity/*` (taxonomy, publishers, rate-limit).

---

## 1. Phase 0 audit (what existed before this upgrade)

### Sources
The feed was a read-time SQL UNION in `lib/feed.ts` over seven tables:

| Arm | Table | Notes |
|---|---|---|
| spot | `trades` | every buy/sell = one card (spam) |
| leverage | `paper_leverage_trades` | open/close/liquidated |
| callout | `callouts` | live perf enrichment (Called MC / Current X / ATH X) |
| thesis | `token_theses` | research posts |
| achievement | `user_achievements` | lazily awarded on profile view |
| recovery | `recovery_events` | verified cleanups only |
| campaign | `campaign_events` | launched / funded / completed |

### What was missing
- **No reactions, no comments** — zero infrastructure anywhere.
- **No aggregation** — 5 quick buys = 5 cards.
- **No milestone events** — tier changes, follower milestones, DNA changes
  happen in code but publish nothing.
- **No spot market cap at execution** — `executeBuy/Sell` had `marketCapUsd`
  in scope but never wrote it to `trades` (only `positions.entry_market_cap`,
  which is deleted on full close).
- **No server-side filtering / params** — routes hardcoded `limit: 40`; all
  six frontend tabs fetched the same global list and filtered client-side, so
  low-volume kinds starved when trades dominated.
- **Field overloading** — the UNION reused columns (`pnl_sol` carried
  recovered SOL, `leverage` carried accounts closed). Unsustainable.
- **No privacy control** — being X-authed was the implicit opt-in.

### What was worth keeping
The UNION itself. It derives events from source-of-truth tables at read time,
which means: no dual-write drift, retroactive history, and verification-gated
sources (recovery, campaigns) stay correct because the read always sees the
current row state. The upgrade keeps it and extends it rather than replacing
it with a write-time event log.

---

## 2. Architecture

### Two event sources, one feed

1. **Derived events (the UNION)** — anything with a source-of-truth table
   keeps deriving cards from it: trades, perps, callouts, theses,
   achievements, recovery, campaigns. Retroactive and drift-free.

2. **Published events (`feed_events`)** — anything with *no* source table
   publishes through `feedService.publishEvent()` at the moment it happens:
   tier promotions, follower milestones, future DNA changes, future AI
   insights. The UNION gains one arm reading this table.

Every arm now carries a structured `meta jsonb` column instead of overloading
scalar columns. `FeedActivityItem.meta` is the typed payload consumed by
cards, future share cards, and future AI summaries.

### `feed_events` table (`lib/feed-schema.ts`)

```
feed_events(
  id, actor_user_id, kind, category, title, summary,
  meta jsonb, visibility ('public'|'followers'|'private'),
  dedupe_key unique, created_at
)
```

- `dedupe_key` makes publishers idempotent (e.g. `tier:{userId}:{tier}` can
  never double-post).
- `visibility` is enforced in the UNION arm (only `public` in global feed;
  `followers` shows in following feeds of followers; `private` only in the
  owner's My Activity).

### `feed_reactions` table

```
feed_reactions(
  id, event_id text, user_id, reaction, created_at,
  UNIQUE(event_id, user_id)
)
```

- `event_id` is the feed item's stable string id (`spot-123`, `agg-buy-123`,
  `lev-5`, `ach-9`, `camp-2`, `fe-14`) — reactions attach to *any* feed item,
  derived or published, without foreign keys into seven tables.
- One reaction per user per event (upsert replaces; delete on toggle-off).
- 16 reaction kinds: `rocket fire gem brain clap eyes moneybag flag poop
  target raise salute thinking heart thumbs_up thumbs_down`
  (🚀 🔥 💎 🧠 👏 👀 💰 🚩 💩 🎯 🙌 🫡 🤔 ❤️ 👍 👎).

### Trade aggregation (`lib/feed-aggregate.ts`, pure + unit-tested)

Aggregation happens at **read time** — deterministic, retroactive, no
write-time state to corrupt:

- Spot trades group per (user, token, side) with a **30-minute gap window**
  (a trade joins the group if it is within 30m of the previous trade in the
  group).
- Groups of 1 render as plain trade cards; groups of ≥2 become aggregated
  cards: **"accumulated X"** (buys) / **"exited X" or "took profits on X"**
  (sells, wording by realized PnL sign).
- Aggregated ids are stable (`agg-buy-{firstTradeId}`) so reactions stick
  while a window is still growing.
- Aggregates carry: trade count, window duration, total SOL, weighted average
  entry/exit market cap (from the new `trades.market_cap_usd`), realized PnL
  (sells), and the full per-trade breakdown for the expandable section.
- Perps are **not** aggregated — opens, closes, and liquidations are each
  meaningful. Liquidations get their own card treatment (professional, not
  mocking).

### New market data at execution

`trades.market_cap_usd` (added via `ensureFeedSchema`) is written by
`executeBuy` and `executeSell` from the stats already in scope. Old rows stay
null — cards degrade gracefully.

### Milestone publishers wired in Phase 1

| Publisher | Hook | Event |
|---|---|---|
| Tier promotion | `executeSell` when `graduation_tier` rises | "reached Gold Trader" (`tier:{user}:{tier}` dedupe) |
| Follower milestone | `followUser` at 10/25/50/100/250/500/1000 | "reached N followers" |

Future publishers (designed for, not yet wired): trader DNA archetype change
(real-trading engine), consistency/risk score milestones, campaign
participation once task campaigns ship, AI coaching insights.

### Activity Layer normalization (`lib/activity/*`, Phase 2)

One structured activity vocabulary that every current and future surface reads
from (feed, and later premium toasts, notification center, profile activity,
reputation, share cards). Additive over the existing model — the read model and
publishers are unchanged in behavior; a normalization layer sits on top.

- **`lib/activity/taxonomy.ts` (pure, unit-tested)** — `classifyActivity(kind,
  action)` maps every feed item's loose `(kind, action)` onto a canonical
  namespaced `ActivityType`. The vocabulary is split into **WIRED** (a source
  today produces it) and **PREPARED** (part of the contract, but no publisher
  emits it yet — reserved so Phase 3/4 consume a stable vocabulary):

  | Domain | WIRED (produced today) | PREPARED (contract only, not emitted) |
  |---|---|---|
  | trade | `trade.buy` `trade.sell` `trade.accumulation` `trade.exit` `trade.perp_opened` `trade.perp_closed` `trade.liquidation` | `trade.tp_hit` `trade.sl_hit` `trade.pnl_milestone` `trade.best_trade` |
  | social | `social.call` `social.thesis` `social.follower_milestone` | `social.follow` `social.reaction` `social.reaction_aggregate` `social.reply` `social.mention` |
  | progression | `progression.achievement_unlocked` `progression.tier_upgraded` | `progression.rank_changed` `progression.score_changed` `progression.streak_milestone` |
  | campaign | `campaign.created` `campaign.goal_hit` `campaign.executed` | `campaign.contribution` `campaign.goal_progress` `campaign.failed` `campaign.expired` `campaign.refunded` |
  | wallet | `wallet.cleanup_completed` | `wallet.recovered_sol` `wallet.burn_completed` `wallet.burn_proof` `wallet.account_closed` `wallet.safety_warning` |
  | fallback | — | `progression.milestone` `social.milestone` `activity.other` |

  (`campaign.goal_hit` was renamed from the earlier `campaign.funded` — clearer
  alongside contribution / goal_progress / executed / failed / expired /
  refunded.)

  Each type carries a `surfaces` descriptor — `{ feed, toast (none|low|normal|
  high), notify, aggregate (none|trade_burst|reaction|campaign_progress) }` —
  the event's *intrinsic* importance. **`toast` and `notify` are intent only —
  nothing consumes them yet (no premium toasts, no notification center).**
  Recipient/viewer routing (self vs follower vs global) is NOT expressible in
  `surfaces` yet; Phase 3/4 must add an audience/visibility layer (see below).
  `buildAggregateKey(policy, ctx)` turns a policy into a concrete roll-up key
  (e.g. `trade:{user}:{mint}:{side}`).

  **Aggregation status:** only `trade_burst` is live (read-time spot collapse,
  `feed-aggregate.ts`). `reaction` and `campaign_progress` are declared
  policies with no consumer yet.

  **`activity.other` is a hardened safety net:** `{ feed: false, toast: none,
  notify: false, aggregate: none }` — an unrecognized event must never leak
  into the public feed. (No current source classifies to it; the UNION only
  emits known kinds.)

  **Audience layer (not built — Phase 3/4):** `surfaces` encodes *importance*,
  not *who sees it*. Notify-only interactions (`social.follow/reaction/reply/
  mention`, `campaign.contribution/refunded`, `wallet.account_closed/
  safety_warning`) are marked `feed: false` here, but true actor-only vs
  follower vs global targeting needs a dedicated audience/visibility field
  layered on later. Do not infer audience from `surfaces` today.

- **`lib/activity/publishers.ts`** — `recordActivity()` is the single publish
  entry point for milestone-type events with no source table. It derives
  `feed_events.category` from the type, stamps the canonical `activityType`
  into `meta` (self-describing rows), and delegates durable storage +
  idempotency to `feedService.publishEvent()`. The two wired publishers
  (`publishTierMilestone`, `publishFollowerMilestone`) were relocated here and
  now route through `recordActivity()` — same categories, same dedupe keys.

- **`lib/activity/rate-limit.ts` (pure, unit-tested)** — the noise toolbox for
  future publishers: a sliding-window `createRateLimiter({ windowSec, max })`
  and `dedupeKey`/`createDeduper` helpers. Built, not yet applied — durable
  dedupe is still the `feed_events.dedupe_key` unique constraint.

- **Read model** attaches an additive `type` + `surfaces` to each item
  (`FeedActivityItem`) via the classifier — no query change, no schema change.
  The frontend `FeedActivityItem` type gained optional `type`/`surfaces`;
  current UI ignores them (reserved for Phase 3).

### API surface (`routes/feed.ts`)

- `GET /feed/global?kinds=spot,leverage&limit=60` — server-side kind filter +
  limit; response items include `reactions` (counts) and `viewerReaction`
  when a session exists.
- `GET /feed/following` — same params, follow-scoped.
- `GET /feed/mine` — the viewer's own timeline (My Activity), includes
  private published events.
- `POST /feed/react { eventId, reaction | null }` — X-auth required; null
  clears.

### Privacy

- `feed_events.visibility` enforced per-arm (see above).
- Derived trade/callout arms remain implicit-public for X users (unchanged
  behavior). A per-user "hide my activity" opt-out is the next privacy step:
  add `users.feed_opt_out` and a `WHERE NOT feed_opt_out` in the ident CTE —
  designed, not yet shipped.
- Real-wallet analysis events publish **nothing** by default; when wired they
  will use `visibility='private'` until the user opts in.

### Anti-spam / quality

- Aggregation collapses trade spam (the dominant noise source).
- `dedupe_key` prevents duplicate milestones.
- `NON_FEED_BADGE_KEYS` continues to suppress trivial setup badges.
- Follower/tier milestones only fire at fixed thresholds — no micro-updates.
- Ranking hooks: items already carry trust scores and reaction counts; a
  future scored feed can rank on (recency × trust × reaction quality) without
  schema changes.

---

## 3. Frontend

- `components/feed-reactions.tsx` — the 10-pill ReactionBar: rounded pills,
  active state, optimistic toggle, top-reactions-first ordering, subtle
  "React" affordance when empty, mobile wrapping.
- `components/feed-card.tsx` — premium pass: every card gets the actor row →
  title → metric tiles → reactions layout. New cards: `AggTradeCard`
  (accumulated/exited with expandable per-trade breakdown), `MilestoneCard`
  (published feed_events), enriched perps card (entry MC / liq MC / margin /
  size tiles from `meta`).
- `pages/feed.tsx` — tabs: **All · Trading · Calls · Achievements ·
  Campaigns · Recovery · My Activity**, each a server-filtered query (no more
  client-side starvation). All keeps the Following/Global source toggle.
  Premium empty states per tab.

## 4. Phasing

- **Phase 1 (this build):** meta payloads, aggregation, reactions, milestone
  events (tier + followers), tabs with server filtering, My Activity,
  premium cards.
- **Phase 2 (this build):** Activity Layer foundation — canonical taxonomy
  (`ActivityType` + `surfaces`), the `recordActivity()` publisher router
  (relocating the tier/follower publishers), and the pure noise toolbox
  (rate-limiter + dedupe). Additive normalization on the read model; zero
  schema/API-breaking changes. Prepares Phase 3 without touching the UI.
  Hardening pass: full PREPARED vocabulary (TP/SL/PnL/best-trade, follow/
  reaction/reply/mention, rank/score/streak, campaign contribution/progress/
  failed/expired/refunded, wallet recovered/burn/account/safety), renamed
  `campaign.funded` → `campaign.goal_hit`, hardened `activity.other` to
  `feed:false`. **No new events were wired** — PREPARED types have no
  publisher and are not produced by any source.
- **Phase 3:** premium toast system (consumes `surfaces.toast`) + notification
  center (consumes `surfaces.notify`, fed by `feed_events` / a notifications
  table), reaction/campaign roll-ups (consume `surfaces.aggregate`),
  share-card generation from `meta`. Needs schema (proposed at that point).
- **Phase 4:** wire the new publishers through `recordActivity()` (best-trade /
  PnL milestones, TP/SL/liquidation notifications, rank/score changes, win
  streaks, campaign goal-progress/expired, individual follow notifications),
  each gated by the rate-limiter. Privacy opt-out toggle, comments.
- **Phase 5:** relevance-scored discover feed, AI-generated weekly summaries
  consuming the same structured events.
