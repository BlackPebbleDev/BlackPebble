---
name: BlackPebble trade-count semantics
description: How "executions", "closedTrades", and "bestTrade" are defined and surfaced in BlackPebble portfolio stats.
---

# Trade-count semantics (portfolio stats)

`getClosedTradeStats` and `/portfolio/stats/:wallet` distinguish two counts. Keep
them distinct everywhere — the UI labels must never conflate them.

- **executions** (`totalExecutions` in the API): every buy + sell action since
  the account's last reset. This is the "how active are you" number.
- **closedTrades**: sell exits only (sell rows with realized pnl) since reset. A
  buy alone is NOT a closed trade. `winRate` is computed against this, not executions.

**bestTrade is `number | null`, never 0 as a fallback.**
- `null` = no winning closed trade exists.
- The UI is tri-state: numeric → show amount; `null` && closedTrades>0 →
  "No winning trades yet"; `null` && closedTrades==0 → "No closed trades yet".

**Why:** showing "Best Trade: 0.00 SOL" was misleading — it read like a real
break-even trade when the user simply had no winners (or no closed trades) yet.

**How to apply:** if you add new stats or labels, keep executions vs closedTrades
separate, and preserve the nullable bestTrade contract end-to-end
(trading.ts → portfolio route → api.ts type → portfolio.tsx BestTradeStat).
