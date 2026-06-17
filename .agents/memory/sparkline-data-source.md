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

**Fallback policy (current):** Sparkline component takes `fallbackPercent` and,
when `points` is null/<2pts, synthesizes a shape from the % change
(`fallbackSeries`): up=positive, down=negative, flat=|%|<0.5. Ripple is zero at
both endpoints so the green/red/gray color rule still holds. Synthetic lines drawn
at strokeOpacity 0.7 (testid `sparkline-fallback`) vs real at 1.0 (`sparkline`).
`undefined`=loading shimmer (only non-line state). NO dashed placeholder anymore.
Fixed SVG dims = no layout shift. Fallback is client-side only (card already has %).
