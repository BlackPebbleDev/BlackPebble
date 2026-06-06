---
name: BlackPebble DexScreener chart iframe lifecycle
description: Why the migrated-token chart must fully remount per token on mobile, and how the TradingDesk routing makes naive iframe src-swapping fail.
---

# DexScreener embed lifecycle (mobile bug)

Migrated tokens render a DexScreener `<iframe>` embed in `PriceChart`/`DexScreenerChart` (`artifacts/blackpebble/src/pages/trading.tsx`). On mobile webviews (Safari, Phantom, in-app browsers), repeatedly swapping a single iframe's `src` as the user hops between tokens accumulates resources until new embeds silently fail to load — only a full browser restart recovers.

**Why this was easy to miss:** TradingDesk is NOT remounted on token navigation. The route is `/` and the token is a `?token=` query param (via `useSearch`/token param), so React reuses the same component tree and the same iframe element across token changes. Without intervention, only `src` changes — never the element.

**How to apply:**
- Force a real element remount, don't just change `src`: keep `key={`${pairAddress}-${nonce}`}` on the iframe and `key={info.mint}` on `<PriceChart>` at the call site. Changing only the URL re-triggers the leak.
- On unmount/reload, clear the timeout AND set the old iframe `src = "about:blank"` (wrapped in try/catch for cross-origin) so the webview can reclaim it.
- Loading UX: spinner until `onLoad`, a ~20s timeout that flips to an error state with a "Reload Chart" button that increments `nonce` (which remounts via the key).
- No polling in the chart component — it must never spam the network or loop.
