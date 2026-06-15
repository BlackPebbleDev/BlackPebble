---
name: Shared UserIdentity component
description: Rule that all user-identity rendering goes through one shared component, plus the non-obvious handle-line and decorative-tier constraints.
---

# Shared user identity rendering

Every surface that shows a user (feed, all leaderboard tabs, profile header,
portfolio summary, token callouts/theses, user search popup) renders through the
shared UserIdentity component. Do not hand-roll avatar/name/badge/tier/@handle
clusters — extend the shared component instead.

**Handle-line rule:** the separate `@handle` line is suppressed when the display
name is already the handle (no real display name) UNLESS the handle itself is a
link. **Why:** without this the feed showed `@handle` twice; the profile header
still needs its external "View on X" handle link even when display name is null.

**Decorative tier/badges are presentation-only.** Tier and official badges shown
next to a user are best-effort decoration sourced from the same batch maps the feed
uses; they must NEVER feed grading, ranking, caller score, or trade accounting. Any
new user-bearing response that should show them joins the existing tier/badge batch
lookups rather than recomputing.

**Every user-bearing list must expose a stable user id.** Decorative badges/tier are
attached by batch lookups keyed on user id, so any leaderboard/feed list that lacks
one will silently render without badges while sibling lists show them. **Why:** the
trade leaderboard was the odd one out and dropped official badges until it surfaced a
user id.

**Leaderboard card unity:** the three tabs share one base card style; only the rank
accent differs (#1 gold / #2 silver / #3 bronze / #4+ none). Self-row uses an accent
ring, not a rank accent.
