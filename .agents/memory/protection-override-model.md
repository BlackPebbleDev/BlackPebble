---
name: Wallet-cleanup protection override model
description: Why default protection needs a separate un-protect override set, not a single user-protect set.
---

# Protection override model (wallet cleanup suite)

A token is protected when the user protected it, OR it is default-protected (verified / meaningfully realizable) AND the user has not explicitly un-protected it.

**Why:** a single `userProtected` set with `protected = default || user` makes it impossible to un-protect a default-protected asset — re-adding it is a no-op, so the "remove protection" confirm dialog becomes dead UI. Two independent override sets (protect / un-protect) are required.

**How to apply:**
- Protect and un-protect must be idempotent and mutually-clearing (each adds to its set and removes from the other) so a mint is never in both, making them order-independent.
- Persist both sets per-wallet; reload on wallet change. Treat tampered storage where a mint is in both as un-resolved (don't trust either).
- Removing default protection must route through an extra confirmation; all other transitions apply immediately.
- Invariant: a protected token can never be burn-selected — enforce on every selection path AND clear any existing burn selection when a mint becomes protected.
