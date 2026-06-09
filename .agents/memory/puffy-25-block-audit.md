---
name: "$25 PUFFY block" was correct behavior, not a bug
description: Why a small buy gets blocked on some same-name tokens, and the sell dedup gotcha that bites tests
---

A "$25 buy on PUFFY is blocked" report turned out to be correct behavior, not a
calc/conversion/unit bug. Root causes / durable facts:

- There are MANY tokens with the same symbol (e.g. ~13 "PUFFY"). Search returns them
  sorted by liquidity desc. A user can pick a near-dead duplicate. Real liquid pairs
  ($6K–$62K liq) pass a $25 buy fine (impact <0.5%); the blocked ones have $0.05–$15
  liquidity (impact 164%–50000%) and are correctly rejected.
- The USD/SOL conversion and `impact = tradeUSD/liquidityUSD*100` math are correct.
  Search liquidity == quote/execution liquidity for the same mint (same `pickBestPair`).
- **Decision:** do NOT lower the liquidity block threshold to "fix" this. 20% is the
  cap; lowering to 10% is STRICTER (blocks more) and would not change the PUFFY outcome.
  The real lever, if any, is UX around picking the right same-name token.

**Sell dedup test gotcha:** the sell idempotency guard matches an earlier sell with the
SAME `token_amount` within `DUPLICATE_WINDOW_SECONDS` (2s). Selling 50% then 100% of the
remainder produces identical token amounts → second sell rejected as duplicate even after
the window in fast tests. Use non-colliding percents (e.g. 40% then 100%) or a direct
full sell when regression-testing closes.
