# BlackPebble Feed — Activity Intelligence Engine

Status: Phase 1 shipped (aggregation, reactions, milestone events, tabs).
Owner doc for the feed upgrade. Read alongside `lib/feed.ts`,
`lib/feed-aggregate.ts`, `lib/feed-service.ts`, `lib/feed-schema.ts`.

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
- Exactly 10 reaction kinds: `rocket fire gem brain clap eyes moneybag flag
  poop target` (🚀 🔥 💎 🧠 👏 👀 💰 🚩 💩 🎯).

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
- **Phase 2:** comments (lightweight trader commentary), user privacy
  opt-out toggle, DNA/consistency publishers, campaign participation events.
- **Phase 3:** trending tab (reaction-quality ranking), share-card generation
  from `meta`, notifications fed by `feed_events`.
- **Phase 4:** relevance-scored discover feed, AI-generated weekly summaries
  consuming the same structured events.
