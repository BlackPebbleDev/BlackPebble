---
name: BlackPebble dev-only live feed throttle
description: How PumpPortal websocket feeds are throttled so dev/preview loads without starving feeds
---

`artifacts/api-server/src/lib/pumpportal.ts` throttles incoming websocket events
ONLY in dev/preview (`NODE_ENV !== "production"`); in production the interval is 0
(no throttle, full live feed).

- New-token firehose: single global throttle (`lastNewTokenAt`) is fine.
- Trade events: throttle must be PER-MINT (`Map<mint, lastTradeAt>`), not a single
  global timestamp.

**Why:** A global trade throttle lets noisy unrelated tokens consume the rate budget,
starving the specific token the user is actively viewing so its live-trades feed shows
empty. Per-mint gating guarantees the viewed token keeps updating. Subscriptions are
capped (~50) so the map stays small.

**How to apply:** Dev env is set via `export NODE_ENV=development` in the api-server
`dev` script. When adding any new high-volume feed, gate throttling on
`NODE_ENV !== "production"` and key per-entity, not globally.
