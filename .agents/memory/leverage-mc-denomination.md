---
name: Leverage liquidation/P&L must be USD-MC-denominated
description: Why leverage longs were liquidated on the way up, and the unit rule that fixes it
---

Leverage liquidation AND P&L must track the token's **USD market cap**, never the
SOL-denominated token price (`priceUsd/solUsd`).

**Why:** The entry MC, the chart (MCAP/USD), the TP/SL triggers, the stored
`liq_market_cap`, and the entire frontend liquidation display are all USD-MC based.
The engine previously liquidated on SOL price (`price <= liq_price_sol`) and valued
P&L on SOL price move. When SOL/USD appreciates, a token's SOL price falls even
though its USD market cap rises — so profitable LONGS got liquidated on the way up
(confirmed: TROLL 5x/20x opened ~74.3-74.4M MC, liquidated at 74.79M, MC UP). The
same engine was internally inconsistent: liquidation in SOL, TP/SL in USD MC.

**How to apply:** Liquidation triggers on `mc <= liq_market_cap` (both already
stored/valued in USD). `priceMovePercent = (currentMc - entryMc)/entryMc`; unrealized
and realized P&L both use it: `pnlSol = notional_sol * priceMovePercent`. Keep a
SOL-price fallback (`price <= liq_price_sol`, SOL move) ONLY when MC is null, so
MC-less tokens still have liquidation protection without reintroducing the SOL/USD
bug. `liq_market_cap = entryMc * (1 - (1/lev - MAINTENANCE_BUFFER))` is computed at
open and is slippage-free (slippage cancels in liqPriceSol/entryPriceSol ratio).
Invariants unchanged: liquidation loses exactly `-margin`, `credit = max(0, margin +
max(rawPnl, -margin))`, equity never negative. System is longs-only (no shorts).
