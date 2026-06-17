---
name: Tier relabel is display-only
description: Reputation tier names are a display-only label layer; renaming must never touch stored values, rank, or trust math.
---

Reputation tier names shown in the web app are a DISPLAY-ONLY relabel layer.

**Rule:** The server/DB own the stored tier (legacy keys), all thresholds, and
all ranking + trust math. The client label layer maps both legacy keys and the
display names (case-insensitive) and mirrors the server thresholds — it must
stay in lockstep with the server's tier table.

**Why:** A rename must never alter a stored value, leaderboard rank, or trust
score — only the label a user sees.

**How to apply:** To rename a tier, change only the display name + its mapping;
never edit thresholds without matching the server. There is a base tier every
account always carries, and the tier badge always renders (no null path), so a
tier is never absent from a user's identity.
