---
name: Guest funnel analytics
description: How BlackPebble counts the guest funnel (created/traded/converted) given guests are client-only.
---

# Guest funnel analytics

Guests live entirely client-side (localStorage `bp_guest_state_v1`). The server
has no guest concept, so the only way to populate the admin guest funnel is a
beacon: a public fire-and-forget `POST /analytics/event` writing to an
append-only `analytics_events` table (idempotent `CREATE TABLE IF NOT EXISTS`,
no migration). No PII — `anon_id` is a random per-device id in the guest state.

**Funnel event definitions (must stay consistent):**
- `guest_created` — fired once per device (localStorage dedupe flag) when a
  device has no identity.
- `guest_first_trade` — fired once per device on the guest's FIRST successful
  trade. Capture `first_trade_at == null` BEFORE calling guestBuy/guestSell
  (those set it), then fire only if it was null and the trade returned ok.
- `guest_converted` — fired ONLY when migration actually carried ≥1 position to
  the wallet (`migratedMints.length > 0`). A migration run where nothing moved
  is NOT a conversion. **Why:** an earlier version fired unconditionally and
  over-counted partial/failed migrations.

**anon_id consistency rule:** both the expiry reset in `load()` and the runtime
expiry reset (`resetExpiredGuest`, used by the countdown) must PRESERVE the
existing anon_id so one device dedupes to one funnel identity across resets.
`resetGuest()` (manual "start fresh") intentionally regenerates it.

**How to apply:** the 24h guest countdown starts at `first_trade_at` (not
account creation). Page-view beacons (`portfolio_view`/`leaderboard_view`) are
once-per-session (sessionStorage). Admin `/admin/stats` calls
`ensureAnalyticsTable()` so fresh deploys return zeros instead of erroring.
