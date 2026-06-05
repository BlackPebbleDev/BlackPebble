---
name: Leaderboard tier consistency
description: Why leaderboard tier badges use stored all-time tier, not period PnL
---

The leaderboard supports daily/weekly/all periods, and each entry's `realized_pnl`
is scoped to that period. The portfolio page shows the account's stored all-time
`graduation_tier`.

**Rule:** Tier badges everywhere (leaderboard rows, portfolio) must render the
account's stored all-time `graduation_tier`, not a tier derived from a
period-scoped `realized_pnl`.

**Why:** Deriving the leaderboard tier from period PnL meant the same user showed
a different tier on the daily/weekly tabs than on their portfolio — tiers are a
lifetime-progression concept and must be stable across views.

**How to apply:** The leaderboard SQL (`getLeaderboard` in api trading.ts) selects
`a.graduation_tier` from accounts and returns it on each entry; the web
`LeaderboardEntry` carries `graduation_tier` and `<TierBadge tier={e.graduation_tier}>`
renders it. Do not reintroduce `tierFromRealizedPnl(e.realized_pnl)` for the badge.
