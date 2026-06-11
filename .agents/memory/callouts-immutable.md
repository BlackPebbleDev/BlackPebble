---
name: Callouts are intentionally append-only
description: Why the callouts/callout_updates data layer has no edit/delete/hide path, and how to extend it.
---

Callouts (`callouts` table) and their follow-up notes (`callout_updates` table) are an immutable, append-only record of a trader's calls. The only write helpers are `createCallout` (new immutable call) and `addCalloutUpdate` (append a note to an existing call). There is deliberately NO updateCallout / deleteCallout / hideCallout, and no route that mutates or removes a callout.

**Why:** The permanence of a caller's track record is a core product guarantee for BlackPebble (Top-Callers / Reputation). Letting users edit or delete past calls would let them launder a bad record. The append-only update trail is how a caller revises a thesis without erasing history.

**How to apply:** When building the callout posting/feed/leaderboard UI, only ever INSERT — corrections go in `callout_updates`, never as edits to the original row. Do not add a mutation/delete path even if asked for "edit a typo"; append a correction instead. Schema + helpers live in `artifacts/api-server/src/lib/profiles.ts` (mirrored in `lib/db/src/schema/index.ts`), bootstrapped lazily via `ensureProfileSchema()`.
