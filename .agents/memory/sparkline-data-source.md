---
name: Sparkline data source
description: How token-card sparklines get their history given BlackPebble stores no time-series.
---

Token-card sparklines (Markets leaderboards + Watchlist) draw short close-price
series fetched on demand — BlackPebble persists NO historical/time-series price
data, so there is no DB-backed source.

**Source:** GeckoTerminal OHLCV, fetched server-side only. The browser-side 403
referer block does NOT apply to server calls. Pool address used is the same
trusted-quote pool the price/MC pipeline picks (reuse `getBestPairAddresses` →
`isBetterPair`), so the line matches the displayed price/MC.

**Why server-batched + in-memory cached:** one HTTP round-trip per visible card
list (not per card); pools resolved + per-(mint,window) cached with per-window
TTL; bounded fetch concurrency; request capped (~60 mints). No DB schema change.

**How to apply:** any new sparkline window/UI must go through the existing
`getSparklines(mints, window)` + `/markets/sparklines` path. Keep the react-query
key on the SORTED unique mint set + window so cache identity is order-stable.
Component states: `undefined`=loading, `null`/<2pts=unavailable(gray dashed),
else green(last>first)/red(last<first)/gray(flat). Fixed SVG dims = no layout shift.
