---
name: Recovery token-metadata enrichment
description: How recovery account rows resolve token symbol/name/logo and the fallback contract
---

Recovery account rows (SOL Recovery / wallet-cleaner) are enriched with token
metadata via a public batch endpoint `POST /recovery/token-metadata` ({mints[]}
-> {tokens: {mint:{symbol,name,logo}}}). Backed by Helius DAS `getAssetBatch`.

**Rule:** the server returns each field as nullable and NEVER fabricates a
symbol/name. The human-facing fallback ("Unknown Token" + short mint) is owned
by the client row, not the server.
**Why:** keeps a single, predictable display contract; lets guests (unlinked
wallets) use recovery; avoids misleading derived symbols leaking into UI.
**How to apply:** when extending recovery display (e.g. preview dialog, Phase C
success screen), reuse `useTokenMetadata(mints)` and the same null->Unknown
rule. `getTokenMetadataBatch` uses a `tokmeta:` cache namespace, distinct from
`getTokenMetadata`'s `meta:` key, because the stored shapes differ — do not
merge them. getAssetBatch returns an index-aligned array with nulls for
not-found ids.
