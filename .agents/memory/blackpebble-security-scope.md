---
name: Blackpebble security scope
description: What "harden security" means for this paper-trading site — protect linked accounts only, keep public/guest open.
---

Blackpebble is a paper-trading site. The owner explicitly wants public viewing
and guest trading to behave exactly as before. The ONLY security concern is a
linked wallet or X account being hijacked.

**Rule:** ownership checks apply ONLY to mutations on LINKED accounts (X accounts
`x:<id>` and wallets present in `user_identities`). Unlinked/guest wallets must
pass through `requireOwnership` via `next()` — never block guest reads, quotes,
or trades.

**Why:** an earlier pass added read-side auth + an unlinked-wallet
proof-of-possession (`__wallet_session`) flow. The owner pushed back hard: it
changed paid-for, working behavior. Code review will flag public read endpoints
as "vulnerabilities" — that flag is overridden by the owner's intent; document
it as drift rather than re-adding read restrictions.

**Two real fixes that ARE wanted:**
- Wallet linking must require a signed nonce challenge (link-wallet-challenge →
  link-wallet with Ed25519 sig). No auto-link in the OAuth callback.
- `linkWalletToUser` must reject cross-user reassignment (409).
