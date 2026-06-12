---
name: GeckoTerminal chart embed
description: Why the token-page chart candles fail in dev but work in prod, and the read-path schema-ensure convention.
---

# GeckoTerminal pool embed (Token Page chart)

The migrated-token chart embeds `https://www.geckoterminal.com/solana/pools/<pairAddress>?embed=1...`
(TradingView charting library under the hood) instead of a native TradingView widget —
most SPL memecoins have no TradingView symbol.

**Dev quirk:** in the proxied Replit dev preview, GeckoTerminal's own internal API calls
(`app.geckoterminal.com/api/p1/candlesticks/...`) return CORS/403 and the candles never draw,
even though the TradingView toolbar + "Powered by GeckoTerminal" chrome load fine. This is a
referer/origin block specific to the dev iframe — it resolves on a real published domain.
Do NOT treat the black-chart-in-dev as a bug; verify chrome loads and move on.

# Read-path schema-ensure is an accepted convention

`getTokenIntelligence` (GET /markets/:mint/intelligence) calls `ensureProfileSchema()` +
`ensureJournalSchema()` before its read queries. This mirrors `computeCallers()` (Top Callers
leaderboard read), which does the identical `ensureProfileSchema()` + same callouts⋈user_identities⋈users JOIN.
**Why:** idempotent `IF NOT EXISTS` DDL is the codebase's lazy bootstrap — there is no startup
migration path, so removing it risks relation-not-exist on fresh DBs. It mutates no data
(no account creation, callouts stay append-only), so it satisfies the read-only DATA contract.
An architect review may flag "DDL on GET" without seeing callers.ts — it's consistent, keep it.
