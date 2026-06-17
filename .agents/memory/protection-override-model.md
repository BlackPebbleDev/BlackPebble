---
name: Wallet-cleanup protection override model
description: How user protect/unprotect overrides combine with default protection so a verified/valuable asset can actually be made cleanup-eligible.
---

# Protection override model (wallet cleanup suite)

A token's `isProtected` is computed in `enrichToken` (recovery-classify.ts) as:

```
isProtected = protectedByUser || (protectedByDefault && !userUnprotected)
```

- `protectedByDefault` = verified token OR realizable ≥ MEANINGFUL_REALIZABLE_USD ($5).
- Two independent persisted override sets in the cleaner hook: `userProtected` and `userUnprotected`.

**Why:** a single `userProtected` set with `isProtected = protectedByDefault || protectedByUser` made it IMPOSSIBLE to unprotect a default-protected asset — adding it to the protect set was a no-op, so the "remove protection" confirm dialog was functionally broken.

**How to apply:**
- `protectToken(mint)` and `unprotectToken(mint)` must be idempotent and mutually-clearing (protect removes from unprotected, unprotect removes from protected) so a mint is never in both lists; this makes them order-independent.
- UI: clicking protect on an `isProtected && protectedByDefault` token must route through the extra-confirm dialog before calling `unprotectToken`; all other transitions apply immediately.
- Invariant preserved elsewhere: protected tokens can never be burn-selected (guards in toggleBurn / selectAllInBucket / burnSelectedTokens, and protectToken drops any existing burn selection for the mint).
