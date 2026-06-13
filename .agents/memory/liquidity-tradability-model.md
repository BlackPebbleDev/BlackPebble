---
name: Paper-trade liquidity / tradability model
description: How computeSlippage decides accept/reject and slippage, and the rule that keeps low-cap tokens tradable without reopening leaderboard-farming.
---

# Paper-trade slippage / tradability model

`computeSlippage` (api-server `lib/slippage.ts`) is the single source of truth for
accept/reject + slippage, called by spot buy/sell, leverage, and the quote
endpoint (all pass `marketCapUsd`). Two paths:

- **Real pool liquidity present:** tiered impact model vs real liquidity, hard cap
  at `MAX_TRADE_IMPACT_PERCENT` (20%).
- **Low-data (liquidity missing/null/zero):** estimate depth =
  `max(marketCapUsd * 0.03, 500)`, apply a harsher (never-null, clamped) slippage
  curve, and reject ONLY when `trade > 25% of market cap`.

**Rule: low-cap meme tokens must stay tradable — prefer slippage over rejection.**
A market-cap-tiered guaranteed floor (`minGuaranteedTradeUsd`: <10k→$25, 10–25k→$50,
25–100k→$100, 100–500k→$250, 500k+→$0) defines a trade size that is NEVER rejected
in either path; it only pays (steep, clamped) slippage.

**Why:** users were blocked with "Order too large for current simulated liquidity"
on $10–$50 buys into low-MC tokens because the old model used 1% of MC as depth and
a 5% impact cap. Normal degen entries must go through.

**Anti-farming guard (do not remove):** the guaranteed-floor bypass applies ONLY
when a valid MC exists (`guaranteedFloorUsd = hasMc ? minGuaranteedTradeUsd(mc) : 0`).
With no usable MC, the honest liquidity-impact cap governs and there is no bypass —
otherwise repeated tiny trades into a thin real pool could farm the per-trade cap on
MC-less tokens. The original cap existed to stop fake-PnL farming; keep that intact.

**How to apply:** tune thresholds here only; never special-case callers. The supply
cap (`maxTokensForSupply`) is independent and is disabled when MC is null — so the
MC-gated bypass above is the only guard in the real-liquidity + null-MC case, which
is exactly why it must stay gated on MC.
