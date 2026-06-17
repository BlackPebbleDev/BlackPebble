---
name: DexScreener pair selection
description: Why token price/MC/24h-change can be wildly inflated, and the trusted-quote rule that fixes it.
---

A token mint has many DexScreener pools. Selecting "best pair" by raw
`liquidity.usd` alone can pick a manipulated pool quoted in a junk/scam token,
which reports an inflated USD price, market cap, AND an impossible `priceChange.h24`
(established tokens showed ~+520,000% with ~1000× price).

**Rule:** prefer a pool whose `quoteToken.address` is trusted (wSOL / USDC / USDT)
over any untrusted pool, regardless of liquidity; deepest liquidity only breaks
ties among same-trust pools. A trusted pool must still hold >= ~$1k liquidity to
win (so a dead trusted pool can't beat a deep active one).

**Why:** the USD price of a pair is computed from the quote token's value; a
worthless/fake quote makes the base token look astronomically priced.

**How to apply:** `comparePairs`/`isBetterPair` in `artifacts/api-server/src/lib/prices.ts`
is the single selection primitive. There are FOUR per-mint selection sites
(pickBestPair sort, searchTokens byMint, getTokenStatsBatch bestPair,
getTrendingTokens byMint) — any new DexScreener aggregation path MUST use it too,
or the bug regresses on that surface only.

**Display safety net (separate):** `fmtPercentSafe`/`pnlColorSafe` in the web
`format.ts` render externally-sourced 24h change as "Data Error" when |%|>100,000
(PERCENT_SANITY_CEILING) and "—" when null. Applied ONLY to market 24h-change
displays — NOT to position/portfolio P&L, where a paper memecoin can legitimately
exceed 1000× (100,000%). Internal P&L formulas were audited and are already
guarded for div-by-zero/null/near-zero baselines.
