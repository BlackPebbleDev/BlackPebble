---
name: Cash-balance desync (rate + account freshness)
description: Why trade panels must use the authoritative SOL/USD rate and why the account must be a React Query, not Context state.
---

# Cash-balance desync

Two independent bugs produced a wrong cash balance + false "insufficient balance"
(the "$56.83" symptom).

## Rule 1: trade sizing/validation must use the authoritative rate, never the token quote
Deriving SOL/USD from a per-token quote (`priceUsd / priceSol`) is unsafe: a stale
or partial quote collapses both numbers and the ratio drifts toward ~1, so a USD
amount gets sized into a wildly wrong SOL amount.

**How to apply:** any panel that sizes/validates a USD order (spot, leverage,
planners) must use `useTradeRate(info)` — `rate`/`rateReady` for sizing+gating,
`solUsd` for display only. The token-derived value is a *display fallback* while
the authoritative `useSolUsd()` loads; it must never size an order. Gate submit on
`rateReady` so an order can't execute against an untrusted rate. Server routes
re-convert `usdAmount`/`marginUsd` via `getSolPriceUsd()` as defense-in-depth — the
client rate is never trusted for execution.

## Rule 2: the account (cash balance) must be a React Query, not Context useState
When `account` was Context `useState`, every `invalidateQueries(["account"])` after
a trade/fill was a silent no-op, so the balance went stale. It's now
`useQuery(["account", accountKey])`. `getAccount` is upsert-safe server-side
(`ensureAccount` ON CONFLICT DO NOTHING), so refetching never resets a balance.

**Why:** invalidation only works on data that actually lives in the query cache.
**How to apply:** keep the cash balance in React Query; never reintroduce a
useState mirror. Refetch at staleness moments (token open, spot/leverage switch,
pre-submit). Existing `["account"]`/`["pf"]`/`["pf-stats"]` invalidations across
the app (including order-fill hooks) depend on this staying a query.
