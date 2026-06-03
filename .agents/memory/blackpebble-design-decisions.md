---
name: BlackPebble design decisions
description: Intentional architecture/scope decisions for the BlackPebble Solana paper-trading platform — read before "fixing" flagged issues.
---

# BlackPebble design decisions

## Wallet connect is identity-only — no signature auth on mutation routes
Trade/account/watchlist routes trust the caller-supplied `wallet` string with no
signed-nonce/session proof. This is **intentional**, not a bug.

**Why:** This is a paper-trading app — balances are simulated, there are no real
funds or real on-chain transactions. Wallet connect exists purely to give each
user a stable identity to scope their fake portfolio. The v3 spec does not request
auth. A malicious actor can only corrupt their own (or another's) *simulated*
balance, which carries no real value.

**How to apply:** Do not add signed-message auth unless the user explicitly asks
or real value (real trades, payments, prizes) is introduced. An architect review
will flag this as "broken access control" — that finding is acknowledged and
deliberately out of scope.

## Paper-trade execution must be atomic inside one better-sqlite3 transaction
`executeBuy`/`executeSell` fetch the price first (async), then do ALL reads
(balance, position, position-count) AND writes inside a single synchronous
`db.transaction(() => …)` that returns the result object.

**Why:** Pre-transaction checks against stale state allowed concurrent requests to
overspend balance, double-sell a position, or breach the max-position limit.
better-sqlite3 transactions are synchronous and return values, so re-reading state
inside the transaction makes the read-check-write atomic.

**How to apply:** Never validate balance/position outside the transaction and then
mutate inside it. Keep the authoritative guard inside the txn.
