---
name: Tier relabel is display-only
description: How BlackPebble reputation tier names are relabeled without touching server/DB or any calculation.
---

The reputation tier names shown in the web app (Black Label / Elite / Premium /
Pro / Verified / Member) are a DISPLAY-ONLY relabel layer in
`artifacts/blackpebble/src/lib/tiers.ts`.

**Rule:** The server/DB still store the legacy keys (legend/diamond/gold/silver/
bronze/none) and own all thresholds + ranking + trust math. `tierMeta()` maps
BOTH legacy keys and the new display names (case-insensitive) to display
metadata. `tierFromRealizedPnl` returns the new names and they round-trip
through `tierMeta`. Thresholds mirror the server's TIERS table in
`artifacts/api-server/src/lib/trading.ts` and must stay in lockstep.

**Why:** A rename must never alter any stored value, leaderboard rank, or trust
score — only the label a user sees.

**How to apply:** To rename a tier, change only the display name in tiers.ts and
its mapping; never edit thresholds without matching the server. The base tier is
"Member" and `tier-badge.tsx` always renders (no null-return), so a tier is
always visible on every user via the shared UserIdentity.
