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

**Coverage reality:** only ~20-30% of leaderboard tokens have GeckoTerminal
OHLCV history; the rest are illiquid/new with no usable series. So a "draw real
or nothing" policy leaves most cards blank — looks broken.

**Fallback policy (current — Smart Sparkline Fallback System):** ordered
real-data-first resolver in `getSparklines`, returning `{points, source}` per
mint. Levels: L1 cache → L2 GeckoTerminal OHLCV → L3 series DERIVED from real
DexScreener priceChange windows (`past = price/(1+pct/100)` for m5/h1/h6/h24, ≥3
anchors) → L4 Birdeye (gated on `BIRDEYE_API_KEY`, inert without it) → L5 bounded
in-memory snapshot store (`priceHistory.ts`, prices already fetched, ≥4 pts over
≥3min) → L6 CLIENT artificial placeholder (`sparkline-placeholder.ts`,
deterministic mulberry32 seeded by mint, ~10 templates).
**Key trick:** L2 pool + L3 derived series come from ONE batched `getBestPairs`
call (returns pool addr + price + priceChange) — L3/L5 add NO upstream load.
Snapshots recorded in getTokenInfo, trending hydration, and getBestPairs.
**Honesty rule (do not weaken):** real always wins; placeholder drawn at reduced
opacity + dashed + testid `sparkline-placeholder` (real = `sparkline` w/
`data-source`), never claims to be real. `undefined`=loading shimmer. Old
`fallbackPercent`/`fallbackSeries` client-synth approach is GONE.
