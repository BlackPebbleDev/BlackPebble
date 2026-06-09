---
name: USD-default display needs a position-independent SOL/USD rate
description: Why currency display falls back to SOL on empty/guest portfolios and how the shared rate fixes it
---

USD is the default display currency app-wide (`pnl-currency.tsx` defaults to "USD";
only an explicit stored "SOL" survives). The toggle components (`PnlAmount`,
`CurrencyAmount`) only render USD when `solUsd > 0`, otherwise they fall back to SOL.

**Constraint:** the position-derived rate (`portfolio.solUsd` / `guestValued.solUsd`)
is 0 until the trader holds something. So an empty or guest portfolio had no rate and
silently rendered SOL even in USD mode.

**Fix / how to apply:** there is a position-independent rate source —
`GET /markets/sol-price` → `{ solUsd }` (server `getSolPriceUsd`, 30s cached) consumed
via the shared `useSolUsd()` hook (queryKey `["sol-usd"]`). Any page that must show USD
without guaranteed positions should use this as the fallback rate. Cold-start (before
first fetch) still briefly shows SOL — acceptable graceful fallback, not a bug.
