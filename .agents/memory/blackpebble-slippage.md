---
name: BlackPebble slippage simulation
description: How paper-trade slippage/liquidity-impact is modeled and why, plus the consistency constraints that keep the leaderboard fair.
---

# Slippage / liquidity-impact simulation

The model lives in `artifacts/api-server/src/lib/slippage.ts` (`computeSlippage`). Trade impact = `tradeUsdValue / liquidityUsd * 100`, mapped through tiers to a slippage fraction. Buys fill at `raw*(1+frac)`, sells at `raw*(1-frac)`. Impact >20% is blocked; missing/zero/invalid liquidity is rejected.

**Why:** Without this, a user could "buy" a huge amount of a thin, illiquid token at its quoted price and bank fake realized PnL to climb the leaderboard. Slippage scaled to pool size makes large fills into thin pools execute at a worse price, so the exploit no longer pays.

**How to apply:**
- The pre-trade quote (`getTradeQuote` → `POST /trade/quote`) and the actual execution (`executeBuy`/`executeSell`) MUST both call `computeSlippage`. If you ever fork the math, the on-screen estimate stops matching the fill and trust breaks.
- Leaderboard fairness is automatic: realized `pnl` on sell rows is computed from the slippage-adjusted effective price, and the leaderboard aggregates only closed sell rows. No separate leaderboard change is needed when the slippage model changes — but any change to fill math implicitly changes rankings.
- Sell impact is valued at the RAW price (`tokenAmount * rawPriceUsd`), and sell slippage is computed INSIDE the DB transaction (after re-reading the position) so concurrent sells can't race the impact calc.
- Jupiter-sourced tokens have `liquidityUsd = null` and are therefore blocked from trading; bonding-curve (PumpPortal) tokens carry synthetic liquidity and remain tradeable. This is intended, not a bug.
- Trades store a 7-column audit trail (raw/effective price, slippage %, impact %, liquidity, sol/usd, trade USD). These are added via the additive `ensureColumns()` helper in `database.ts`; older rows keep NULLs.
