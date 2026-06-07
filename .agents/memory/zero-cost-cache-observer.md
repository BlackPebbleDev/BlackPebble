---
name: Zero-cost react-query cache observers
description: Pattern for piggybacking on an existing polled query without adding new fetches; and the public-wallet-read API convention.
---

## Observe-only react-query, no new external calls
To react to data from a query that some page already polls (e.g. the positions
query, or guest token-info queries) WITHOUT adding a second always-on poll, mount
an observe-only instance: same `queryKey`, but `enabled: false` (and for
`useQueries`, also `refetchInterval: false`). It still subscribes to the shared
cache and re-renders when the polling page updates it, but never issues its own
requests.

**Why:** a feature mounted globally in the app shell (e.g. TP/SL fill-toast hook)
must not turn a per-page 15s poll into an all-pages 15s poll — that silently adds
external API cost on pages that otherwise wouldn't fetch. For BlackPebble the
explicit guarantee was "zero new external API calls for the order CHECK"; the
server only evaluates orders when `/trade/positions` is fetched, so a passive
observer is also functionally complete.

**How to apply:** when adding a global hook that needs another query's data,
prefer an observe-only instance over a fresh polling query. For shared
`useGuestValuedPositions`, pass an `observeOnly` flag from the global consumer.

## API auth convention
GET-by-wallet reads in `artifacts/api-server` (positions, history) are
intentionally PUBLIC. But data that reveals future intent (pending TP/SL orders)
should be guarded with `requireOwnership((req) => req.params.wallet)` like the
create/cancel routes — public for executed data, owner-only for pending intent.
