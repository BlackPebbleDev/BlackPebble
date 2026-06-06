---
name: BlackPebble slippage simulation
description: How paper-trade slippage/liquidity-impact is modeled and why, plus the consistency constraints that keep the leaderboard fair.
---

# Slippage / liquidity-impact simulation

The model lives in `artifacts/api-server/src/lib/slippage.ts` (`computeSlippage`). Trade impact = `tradeUsdValue / liquidityUsd * 100`, mapped through tiers to a slippage fraction. Buys fill at `raw*(1+frac)`, sells at `raw*(1-frac)`. Normal-liquidity impact above the cap is blocked with "Order too large for current simulated liquidity."

**Low-data fallback:** when liquidity is missing/≤0/invalid but `marketCapUsd` is usable, `computeSlippage` enters low-data mode instead of blocking: synthetic depth = `marketCap * LOW_DATA_LIQUIDITY_FRACTION` (0.01), harsher `LOW_DATA_TIERS`, reject above `LOW_DATA_MAX_IMPACT_PERCENT` (5%), fills flagged `lowData:true` + `warningLevel:"extreme"`. Block only when neither liquidity NOR MC is usable → "Trading unavailable: insufficient live market data." `computeSlippage` takes `marketCapUsd` as a param; all 3 call sites (executeBuy/executeSell/getTradeQuote) must pass it.

**Why:** Without this, a user could "buy" a huge amount of a thin, illiquid token at its quoted price and bank fake realized PnL to climb the leaderboard. Slippage scaled to pool size makes large fills into thin pools execute at a worse price, so the exploit no longer pays.

**How to apply:**
- The pre-trade quote (`getTradeQuote` → `POST /trade/quote`) and the actual execution (`executeBuy`/`executeSell`) MUST both call `computeSlippage`. If you ever fork the math, the on-screen estimate stops matching the fill and trust breaks.
- Leaderboard fairness is automatic: realized `pnl` on sell rows is computed from the slippage-adjusted effective price, and the leaderboard aggregates only closed sell rows. No separate leaderboard change is needed when the slippage model changes — but any change to fill math implicitly changes rankings.
- Sell impact is valued at the RAW price (`tokenAmount * rawPriceUsd`), and sell slippage is computed INSIDE the DB transaction (after re-reading the position) so concurrent sells can't race the impact calc.
- Jupiter-sourced / pre-migration tokens have `liquidityUsd = null`; they are NO LONGER hard-blocked — if marketCap is usable they trade in low-data mode (small size only); only no-MC tokens are blocked. Bonding-curve (PumpPortal) tokens carry synthetic liquidity and use the normal path.
- The anti-whale supply cap (`MAX_SUPPLY_PCT` 4%, `maxTokensForSupply` = supply*pct, supply = MC/price) applies ON TOP of slippage in BOTH normal and low-data mode — whichever is stricter wins.
- Trades store a 7-column audit trail (raw/effective price, slippage %, impact %, liquidity, sol/usd, trade USD). These are added via the additive `ensureColumns()` helper in `database.ts`; older rows keep NULLs.
