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

## Responsive token lists: dual render, not one overflowing table
Token lists (Markets, etc.) render TWO siblings: a `md:hidden` card list and a
`hidden md:block` table — not a single table inside `overflow-x-auto`.

**Why:** Spec requires zero horizontal scroll under 768px. A 6-column table can't
collapse cleanly; a card (rank+logo+symbol+name+price left / marketcap+24h right)
fits any width. Tailwind `md` = 768px = the breakpoint.

**How to apply:** New token-discovery surfaces should follow this dual-render
pattern. Market Cap is the primary metric; price is secondary/muted.

## Wallet button is styled via global CSS overrides, not props
`@solana/wallet-adapter-react-ui`'s `WalletMultiButton` is restyled with
`!important` overrides on `.wallet-adapter-button-trigger` in `src/index.css`
(graphite bg, gold text, 36px height, square corners). The component takes no
style props.

**Why:** The adapter ships its own large purple stylesheet; the only reliable way
to match the black/graphite/gold theme is CSS overrides.

## X login is intentionally inert scaffolding
`x-login-button.tsx` has `X_LOGIN_ENABLED = false` and shows "Login with X
(Coming Soon)". `users` + `user_identities` tables exist in `database.ts` as
additive scaffold. No OAuth is implemented — do NOT build fake/simulated X auth.
Wallet stays the primary identity. `pnl-card.tsx` is a `return null` placeholder.

**How to apply:** Only flip the flag once real server-side X OAuth (PKCE) and
`/auth/x/*` routes exist.
