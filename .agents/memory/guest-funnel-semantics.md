---
name: Guest funnel event semantics
description: How the admin guest funnel beacons must behave so conversion/dropoff stay meaningful.
---

The admin "Guest Funnel" (Sessions → Searches → Token Views → First/Second Trade → X Connect → Registration) is computed from independent `count(*)` per `event_type` in `analytics_events`, windowed by the shared `$1` since-cutoff. There are NO stepwise distinct-`anon_id` joins.

**Rule:** every funnel-stage beacon must be (1) `oncePerDevice` (first-touch-per-device) and (2) fired only for guests (`isGuest`), passing the guest `anon_id`.

**Why:** because counts are independent per event type, if a middle stage fires more than once per device, or fires for already-registered users, a later stage can exceed an earlier one and conversion% goes >100% / dropoff goes negative. First-touch + guest-scoping keeps the funnel monotonic and the percentages well-defined without needing identity-join SQL.

**How to apply:** when adding/moving a funnel beacon, gate it on `isGuest`, dedupe with `oncePerDevice("<event>")`, and add the event name to BOTH `ALLOWED_EVENTS` (api-server analytics route) and `AnalyticsEventType` (web api.ts). Shared components (e.g. token-search) need `useAccount()` to know guest status. Conversion = stage/prev, dropoff = 100−conversion, computed in the web funnel component (guard divide-by-zero).
