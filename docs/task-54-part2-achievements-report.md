# Task #54 Part 2 — Achievement Catalog & Feed Integration

**Project:** BlackPebble (reputation layer for Solana traders)
**Scope:** Additive only. No schema migration (only new `badge_key` values).
**Status:** Complete — backend + client typecheck clean; API + web boot clean.

This report walks the 13 deliverables, what was built, and where.

---

## 1. Expanded achievement catalogue organized into collections

`BADGE_DEFINITIONS` was rebuilt from a flat list into **35 achievements** across
named collection arrays, flattened into the exported catalogue:

| Collection | Count | Examples |
|---|---|---|
| Trading | 5 | First Trade, 10/50/100 Trades, Top 100 Trader |
| Profit | 5 | First Profit, Positive ROI, +10/+100/+1000 SOL |
| Calls | 8 | First/5/20 Calls, 10× Caller, Sharpshooter, Top Caller |
| Research | 3 | First Thesis, Researcher, Consistent Analyst |
| **Wallet Utilities** | 9 | (deliverable 2) |
| Community | 2 | Early User, Networked |
| Profile | 2 | Profile Complete, Watchlist Builder |
| Special | 1 | Triple Threat |
| Hidden | 3 | (deliverable 3) |

The `BadgeCategory` union gained `profit`, `wallet`, and `profile`. Verified: 35
total, zero duplicate keys, every badge has a `rarity` and `icon`.

**Files:** `artifacts/api-server/src/lib/badges.ts`

## 2. Signature "Wallet Utilities" collection from real verified recovery data

Nine achievements driven exclusively by **chain-verified** recovery events
(`verified = true`) — never self-reported numbers:

- First Recovery, Wallet Cleaner (5 cleanups)
- 10 / 100 Accounts Closed
- 1 / 10 SOL Recovered
- Token Burner (10 tokens), Elite Cleaner (≥50 accounts **and** ≥5 SOL)

`getUserBadges` aggregates recovery metrics per linked wallet from the verified
recovery tables (read-only, `.catch`-guarded so a recovery read failure never
breaks the badge response). Metrics feed `recoveryAccountsClosed`,
`recoverySolRecovered`, `recoveryCleanups`, `recoveryTokensBurned`.

**Files:** `artifacts/api-server/src/lib/badges.ts`

## 3. Hidden achievements

Three hidden achievements: **Moonshot** (50× call), **Perfectionist** (≥90% hit
rate over ≥10 graded calls), **Rent Reaper** (recovery milestone).

- `BadgeDefinition` gained an optional `hidden?` flag.
- Hidden + unearned tiles are **never** rendered — the profile filters them out
  (`b.earned || !b.hidden`) before any grid, locked toggle, or filtered view, so
  there is no name, hint, or silhouette leak. Once earned they appear normally.

**Files:** `artifacts/api-server/src/lib/badges.ts`,
`artifacts/blackpebble/src/pages/profile.tsx`

## 4. Progress tracking (current / target + bar)

`evaluateBadges(metrics)` is the single source of unlock thresholds and returns
`{ earned, progress }` per key. Count-based badges carry
`progress: { current, target }` (clamped); boolean badges carry `progress: null`.

- `BadgeEntry.progress` is surfaced through the API and client types.
- The achievement tile renders a thin progress bar + `current / target` for
  unearned count-based badges that have real progress.

**Files:** `artifacts/api-server/src/lib/badges.ts`,
`artifacts/blackpebble/src/components/achievement-badge.tsx`

## 5. Idempotent premium feed cards (exactly ONE per user + achievement)

Achievement feed rows come from `user_achievements`, which has one row per
`(user_id, badge_key)` and is upserted on earn — so a card cannot duplicate.
The feed achievement union additionally **excludes** non-feed setup badges via
`NON_FEED_BADGE_KEYS` (`profile_complete`, `watchlist_builder`) so trivial
account setup never posts a card. Keys are code-controlled constants
(alphanumeric/underscore), inlined into the `NOT IN (...)` clause safely.

**Files:** `artifacts/api-server/src/lib/feed.ts`,
`artifacts/api-server/src/lib/badges.ts`

## 6. Share-card readiness data

Each `BadgeEntry` now exposes `globalEarnedPercent` — the % of registered users
holding that badge — computed from holder counts / total users. The profile's
per-tile **Share** button (self only; clipboard-guarded) composes a ready line:

> I unlocked "Sharpshooter" (Epic) on BlackPebble · held by 4% of traders. <url>

The clipboard guard checks `navigator.clipboard?.writeText` exists before
awaiting (it resolves `undefined` silently when unavailable, which would
otherwise fire a false "Copied" toast).

**Files:** `artifacts/api-server/src/lib/badges.ts`,
`artifacts/blackpebble/src/components/achievement-badge.tsx`,
`artifacts/blackpebble/src/pages/profile.tsx`

## 7. Premium unlock toast + shimmer

On the **self** profile, the section diffs the current earned set against
`localStorage["bp_seen_achievements_<userId>"]`. Newly-earned keys trigger a
toast ("Achievement unlocked!") and a gold shimmer ring on the fresh tiles
(`justUnlocked`, auto-clears after 6s). First-ever load seeds the baseline
silently so the entire backlog is not celebrated at once.

**Files:** `artifacts/blackpebble/src/pages/profile.tsx`,
`artifacts/blackpebble/src/components/achievement-badge.tsx`

## 8. Filtering / search

A collapsible filter panel (off by default to keep the view clean) provides:

- **Search** by name/description
- **Collection** pills (built from collections actually present)
- **Status** pills (All / Earned / Locked)
- **Rarity** pills (All / Common / Rare / Epic / Legendary)
- **Sort** (Rarity / Recent / Progress / Name)

When no filter is active, the default summary-first grouped view is shown
(earned tiles by collection + a locked toggle). When any filter is active, a
flat sorted grid replaces it. Hidden-unearned never appear in either path.

**Files:** `artifacts/blackpebble/src/pages/profile.tsx`,
`artifacts/blackpebble/src/components/filter-pills.tsx`

## 9. Centralized progression source

New `progression.ts` is the single home for badge → trust math:
`RARITY_POINTS`, `achievementScore`, `badgeTrustContribution`,
`BADGE_TRUST_CAP`, `BADGE_TRUST_MAX_POINTS`. `computeTrustScore` now consumes
`badgeTrustContribution(earnedBadgeCount)` instead of an inline formula —
**behavior is numerically identical** (`min(count,5)/5 * 10`), just centralized.

**Files:** `artifacts/api-server/src/lib/progression.ts`,
`artifacts/api-server/src/lib/badges.ts`

## 10. Identity + achievement audit

The three identity axes stay strictly separate (per existing convention):

- **Status** (guest / member) — unchanged
- **Roles** (official role badges) — unchanged; achievements never grant a role
- **Progression** (tiers + Trust Score) — achievements contribute only the
  capped badge component of Trust, now via `progression.ts`

Achievements are a fourth, decorative collectible axis. They never grade, rank,
or alter trading stats. Hidden badges leak nothing pre-unlock.

## 11. This 13-point report

You're reading it.

## 12. Additive DB only (no migration)

No DDL, no Drizzle changes. The only new persisted data is additional
`badge_key` string values written into the existing `user_achievements` table by
the existing upsert path. Nothing was altered or dropped.

## 13. No impact to trading / portfolio / positions / recovery / markets

Changes are confined to the achievement + feed surfaces:

- `badges.ts`, `progression.ts`, `feed.ts` (achievement union only — spot,
  leverage, callout, thesis, recovery unions untouched)
- Client: `api.ts` (types), `achievement-badge.tsx`, `profile.tsx`
  (BadgesSection only), `feed-card.tsx` (achievement card tint only)

Trading accounting, portfolio, positions, recovery history, paper-trade engine,
Live PnL, market and token pages are untouched. Recovery data is **read**
(read-only, guarded) to derive Wallet Utilities badges — never written.

---

## Verification

- `tsc --noEmit` clean for **api-server** and **blackpebble**.
- API Server boots; `/feed/global` returns 200.
- Web app boots with no console errors.
- Catalogue integrity check: 35 badges, 0 duplicate keys, all rarity/icon set,
  3 hidden, `NON_FEED_BADGE_KEYS` all valid.
- Dev DB has no users, so live per-user badge rendering wasn't exercised against
  real data; logic validated via the pure `evaluateBadges` + typecheck.
