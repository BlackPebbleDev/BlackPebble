---
name: BlackPebble leaderboard anti-cheat
description: Rules and rationale behind the server-authoritative leaderboard ranking in api-server trading.ts / getLeaderboard
---

# Leaderboard anti-cheat

The leaderboard is recomputed from the immutable `trades` table on every request
(`getLeaderboard(period)` in `artifacts/api-server/src/lib/trading.ts`). Never
trust any client-supplied PnL/ROI.

Ranking rules (all enforced in SQL):
- Only CLOSED trades count: `side='sell' AND pnl IS NOT NULL`. Open positions are
  ignored so unrealized paper gains can't inflate a rank.
- A wallet needs `MIN_LEADERBOARD_TRADES` (5) closed trades and account age
  `>= MIN_ACCOUNT_AGE_SECONDS` (1h) to appear.
- Per-wallet floor is `max(periodStart, last_reset_at)`: trades before a reset are
  excluded, so resetting wipes leaderboard standing (can't bank gains then reset
  to dodge later losses). This matches `getClosedTradeStats`' reset handling.
- ROI = `realized_pnl / cost_basis` where `cost_basis = SUM(sol_amount - pnl)`
  over the sell rows, guarded against divide-by-zero. ROI is NOT relative to
  STARTING_BALANCE.

**Why the query uses two CTEs (`agg` + `ident`) joined last:** joining the
identity tables (`user_identities`/`users`) directly into the GROUPed trade
aggregate duplicates rows when a user has multiple identity rows, inflating
counts/sums. Pre-aggregate trades and identity separately, then LEFT JOIN one
identity row per wallet.

Identity fields (`x_username`, `x_avatar_url`, `x_display_name`) come from the
wallet→user→x-identity chain and are all null until X OAuth is implemented; the
schema already supports them (no migration needed).

**Trade integrity guards** (also in trading.ts executeBuy/executeSell): reject if
any price component (`priceSol`, `priceUsd`, `solUsd`) is non-finite or <= 0, and
an idempotency guard rejects an identical buy/sell within
`DUPLICATE_WINDOW_SECONDS` (2s) — accepted tradeoff: blocks intentional rapid
identical trades, but satisfies the "prevent duplicate submissions" requirement.
