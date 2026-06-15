---
name: Shared UserIdentity component
description: All user-identity rendering (avatar+name+badges+tier+@handle) must go through one shared component; how its handle line behaves and how decorative tier is sourced.
---

# Shared user identity rendering

All surfaces that render a user (feed cards, every leaderboard tab, profile header,
token-intel theses + recent callouts) render through `UserIdentity`
(`artifacts/blackpebble/src/components/user-identity.tsx`). Do not hand-roll
avatar/name/badge/tier/@handle clusters in new code — extend `UserIdentity`.

**Handle-line rule:** the separate `@handle` line renders only when a display name
exists OR a `handleLink` is given. This avoids showing `@handle` twice in the feed
(no display name ⇒ the name itself is `@handle`, so the line is suppressed) while
still letting the profile header show its external "View on X" link + Rank even when
display name is null (accepted as a rare visual dup).
**Why:** consistency requirement of the user-status task; the feed double-render was
the specific regression to avoid.

**Decorative tier sourcing:** tiers shown next to users are display-only and come
from `getUserTiers` (`api-server/src/lib/trading.ts`) — the same best-effort,
never-throws batch map the feed uses. token-intel callouts/theses are enriched this
way after the core sentiment/grading computation.
**How to apply:** never derive or mutate grading/ranking/caller-score from tier; tier
is presentation only. Any new user-bearing API response that should show a tier joins
via `getUserTiers`, not by recomputing.

**Leaderboard card unity:** the three tabs share `LB_CARD`/`LB_CARD_CLICK` base
classes; only rank accents differ via `rankAccent()` (#1 gold / #2 silver / #3 bronze
/ #4+ none); `isMe` uses an accent ring, not a rank accent.
