---
name: BlackPebble guest-mode anti-whale supply cap
description: Why guest buys must enforce the supply cap locally, since the server quote can't enforce it for guests.
---

# Guest supply cap enforcement

The anti-whale supply cap (max `MAX_SUPPLY_PCT` = 4% of a token's supply, supply = marketCap/price) is enforced server-side in `executeBuy` against the trader's wallet holding. The `POST /trade/quote` endpoint can also mirror it — BUT only when a wallet is supplied so it knows current holdings.

**Why guests are special:** guest trades never hit the server execute path; `guestBuy` in `lib/guest-store.ts` applies a server quote locally. Guest quote requests carry no wallet, so the server assumes `held = 0` and the cumulative cap is NOT enforced for guests. Without a local check, repeated guest buys could exceed the 4% cap.

**How to apply:**
- `guestBuy` must re-derive and enforce the cap itself: `supply = entryMc / rawPriceUsd`, `maxTokens = supply * GUEST_MAX_SUPPLY_PCT`, block when `held(existing position) + tokensReceived > maxTokens`.
- `GUEST_MAX_SUPPLY_PCT` (guest-store.ts) is a hand-mirror of the server's `MAX_SUPPLY_PCT`; if one changes, change the other in lockstep or guest vs signed-in behavior drifts.
- Use the RAW USD price (`quote.rawPriceUsd`) for the supply math, matching `maxTokensForSupply(marketCapUsd, priceUsd)` on the server.
