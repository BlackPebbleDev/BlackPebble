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

## Burn classification is positive-evidence-only

An asset may only be classified as removable (burn bucket) on POSITIVE evidence: real intel that shows no market, or a scam-risk verdict (spam/high_risk/suspicious). Missing/unresolved intel must NEVER map to burn — degrade it to a non-selectable review state and surface an explicit "analysis unavailable" reason in the UI.

NFTs/collectibles (0-decimal mints, Metaplex convention) are protected by default and stay out of the burn bucket even if a user removes that protection (NFT cleanup is "Coming Soon").

**Why:** an intel outage or unknown token must not silently make assets burnable; burning is irreversible, so the safe failure is keep/review, never burn. A code review rejected the build when `!intel` mapped straight to burn and NFTs were unprotected.

## "No market" must be a SUCCESSFUL-lookup verdict, not absence-of-data

A market signal must be tri-state (`true` / `false` / `null`), and `false` ("no trusted market") may only be asserted when the upstream lookup actually succeeded. An absent mint under an outage is `null` (UNKNOWN), never `false`.

The trap: a best-effort batch fetcher (e.g. `getTokenStatsBatch`) that swallows per-chunk errors internally and returns a possibly-empty Map will NOT throw, so a `.catch` around the call never fires — the outage is invisible to the caller. Surface success explicitly (e.g. `getTokenStatsBatchWithStatus` → `{ stats, ok }`, flip `ok=false` in the swallowed catch) and propagate it. Rule: resolved mint → `true`; absent + lookup ok → `false`; absent + lookup failed → `null`.

**Why:** two review rounds rejected the build because a DexScreener outage made `hasMarket=!!m` false for legit tokens → classified spam → burn candidate. **How to apply:** any trust decision driven by a best-effort fetch needs the fetch to report whether it succeeded; don't infer "negative" from "missing".
