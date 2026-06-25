---
name: Badge minting is push-based
description: Why every qualifying action must fire a badge mint, and the rules for doing it safely
---

Achievement rows in `user_achievements` are minted (persisted) only by
`getUserBadges` in api-server `lib/badges.ts`. Historically that ran only on a
profile/badges view, so the system was PULL-based.

**The trap:** the activity feed is a live UNION over `user_achievements`. If a row
is not minted at action time, the feed has nothing to surface — so a thesis
publish or watchlist build produced no feed card until someone opened the
author's profile.

**The rule:** every qualifying action must fire a mint at action time via
`lib/badge-mint.ts` (`mintBadgesAsync(userId)` or `mintBadgesForWalletAsync(wallet)`).

**Why it's safe:**
- `getUserBadges` inserts with `ON CONFLICT DO NOTHING` → idempotent, no
  duplicate rows / no repeat feed cards.
- The `*Async` variants are fire-and-forget and swallow errors → a mint can never
  block or fail the user-facing request.
- `getProfile(String(id), null)` returns null for non-X users; mint no-ops for
  them, matching the X-identity-gated feed/profile surface.

**How to apply:** when you add any new action that could cross a badge threshold
(trade, thesis, callout, follow, watchlist, recovery, profile/avatar/bio update,
login refresh), wire a fire-and-forget mint after the action succeeds. For
post-commit reads (e.g. `profile_complete` needs the freshly-written avatar+bio),
fire the mint AFTER the transaction commits, not inside it. `watchlist_builder`
and `profile_complete` are in `NON_FEED_BADGE_KEYS` (unlock but post no feed card)
by design — keep them that way.

**Critical wallet key format bug (fixed):** X-authenticated users have `accountKey = "x:<x_id>"` in
the frontend (see `use-account.tsx`). The watchlist and trade routes receive this key as `wallet`,
so watchlist rows are stored with `wallet = "x:12345"` — NOT a Solana address. The badge query
was doing `WHERE wallet IN (SELECT wallet_address FROM user_identities ...)` which ONLY matches
Solana addresses — so X users always got watchlistCount=0. Same for `resolveUserIdByWallet("x:12345")`
which was doing `WHERE wallet_address = 'x:12345'` → null.
Fixes: (1) `resolveUserIdByWallet` branches on `x:` prefix → looks up by `provider='x' AND provider_user_id`
instead. (2) watchlist count UNION-ALLs `'x:' || provider_user_id FROM user_identities WHERE provider='x'`
so both key formats match. **This affects every wallet-keyed badge for X users (watchlist, trades, recovery).
Always handle both "x:<id>" and bare Solana address formats in any wallet→userId or wallet→data lookup.**

**Integrity check:** `GET /admin/achievements/audit` reports per-badge
`hasUnlockPath` (definition↔evaluator consistency via zeroed BadgeMetrics →
evaluateBadges keys), `feedEligible`, holders, and integrity violations.
