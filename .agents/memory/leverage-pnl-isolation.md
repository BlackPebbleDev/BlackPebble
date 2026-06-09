---
name: Leverage P&L isolation from spot stats
description: Leverage trading must never write to spot leaderboard/account stat columns; only paper_balance.
---

Leverage (paper) trading P&L is intentionally kept SEPARATE from the spot
leaderboard and competition stats.

The rule: leverage open/close/liquidation may only mutate `accounts.paper_balance`
(and `last_active`). They must NOT touch `accounts.realized_pnl`, `total_pnl`,
`total_trades`, `winning_trades`, `best_trade`, `worst_trade`, `current_streak`,
or `participation_points`. All leverage realized P&L lives in the leverage tables
(`paper_leverage_positions`, `paper_leverage_trades`) only.

**Why:** product decision — leverage is a higher-variance mode that ships behind a
flag (default OFF) and must not pollute or inflate the spot leaderboard rankings.

**How to apply:** when extending the leverage engine (`artifacts/api-server/src/lib/leverage.ts`)
or adding shorts/Phase 2, keep the account write surface limited to paper_balance.
If a future request wants a leverage leaderboard, build it off the leverage tables,
not the spot account stat columns.

Balance model: open debits margin; non-liq close credits `max(0, margin + realizedPnl)`
where `realizedPnl = max(rawPnl, -margin)`; liquidation credits 0 (pnl = -margin).
Equity can never go negative. Close/liq is concurrency-safe via withTx +
`UPDATE ... SET status='closing' WHERE status='open' RETURNING *` claim.
