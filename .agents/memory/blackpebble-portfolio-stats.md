---
name: BlackPebble portfolio stats source of truth
description: How portfolio stats (trade count, win rate, best/worst trade, realized PnL) must be computed
---

Portfolio stats must be derived from the immutable `trades` table, NOT from the
incrementally-updated counter columns on `accounts` (total_trades, best_trade, etc.).

`getClosedTradeStats(wallet)` in `artifacts/api-server/src/lib/trading.ts` is the
single source of truth. Used by `/portfolio/stats/:wallet` and by account `shape()`.

Rules:
- A closed trade = a `side='sell'` row with `pnl IS NOT NULL`. A buy alone is NOT a closed trade.
- Only count trades with `executed_at > accounts.last_reset_at`.

**Why:** Old code incremented total_trades on BOTH buy and sell (diluted win rate),
tracked best_trade via Math.max on a column that resetAccount never cleared (stale/0),
and counted pre-reset pnl — which made Total PnL (realized+unrealized) disagree with
equity-based ROI after a reset (resetAccount wipes balance to STARTING_BALANCE but does
NOT delete trade rows).

**How to apply:** Any new portfolio/leaderboard stat that involves trade counts, win
rate, or realized pnl must go through getClosedTradeStats (or replicate its sell+pnl+
last_reset_at filter), never read the account counter columns directly.
