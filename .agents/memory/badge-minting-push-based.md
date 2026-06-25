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

**Critical wallet-identity bug (fixed):** The watchlist count query AND
`resolveUserIdByWallet` both originally filtered `provider = 'wallet'`. Some
accounts (especially early ones) have `wallet_address` only on their `provider='x'`
identity row (no separate wallet-provider row). Both queries now use
`wallet_address IS NOT NULL` without a provider filter. Same fix applies to the
recovery event lookup. If you ever see a count-based wallet badge not firing,
check which identity rows the user actually has.

**Integrity check:** `GET /admin/achievements/audit` reports per-badge
`hasUnlockPath` (definition↔evaluator consistency via zeroed BadgeMetrics →
evaluateBadges keys), `feedEligible`, holders, and integrity violations.
