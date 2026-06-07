---
name: BlackPebble trade execution pricing
description: How paper-trade quantity/valuation pricing must be sourced and validated in the api-server.
---

# Trade execution & valuation pricing (api-server)

Rule: paper-trade quantity and position valuation must both flow through
`getExecutionPrice(mint)` in `prices.ts`, which anchors on the trusted USD price
from `getTokenInfo` (DexScreener priceUsd → PumpPortal bonding → Jupiter) and
derives `priceSol = priceUsd / solUsd`. `getTokenPriceSol` delegates to it.

**Why:** execution previously used a bonding-curve-price-first path that returned
a stale/frozen price for *migrated* tokens, producing wrong token quantities
(e.g. far too few tokens for a low-cap token). DexScreener is the source of truth
for migrated tokens; anchoring entry and valuation on the same USD price keeps
quantity, SOL cost basis, unrealized/realized PnL and equity consistent.

**How to apply:**
- Quantity math is USD-based: `amountInUsd = solAmount * solUsd`,
  `tokenQuantity = (amountInUsd / priceUsd) * SLIPPAGE`. Never derive quantity
  from marketCap/FDV or any formatted/displayed value.
- Block the trade with the exact string `"Price data unavailable. Trade not
  executed."` whenever `getExecutionPrice` returns null.
- Staleness: the token USD price is fetched live each call (inherently fresh) and
  the bonding price self-expires (~10 min). The only open-ended stale vector is
  `getSolPriceUsd`, which serves a last-known fallback indefinitely on repeated
  upstream failure — so `getExecutionPrice` rejects when
  `isCacheFresh("sol_usd", 120s)` is false.
- Dev-only debug logging uses `logger.debug("[trade-debug] ...")`; pino level is
  `debug` in development / `info` in production (see `logger.ts`), so debug logs
  are visible in dev only.

## Recent Paper Trades panel (frontend)
The trading-desk side panel shows the user's *own* paper trades from
`api.history(wallet)` (query key `["paper-feed", wallet]`), not an on-chain feed
— so it persists across refresh and updates after a trade (the trade mutation
invalidates `["history"]` and `["paper-feed"]`). Status is honest: green "Live"
only when the newest trade is < 120s old, otherwise gray "Idle". Do not show a
green LIVE badge driven purely by websocket connectivity.

## Frontend: getting SOL/USD on the trading page
`TokenInfo` (api.getToken) does NOT carry `solUsd`, but the rate is derivable
from the same payload: `solUsd = priceUsd / priceSol` (guard `priceSol > 0`).
Used by the Mini Trade Planner to convert a USD investment amount into the SOL
buy-field value. Elsewhere `solUsd` comes from `api.positions`/chart/quote
responses or `guestValued.solUsd`. No standalone "sol price" endpoint exists.
