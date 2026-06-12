---
name: Top Caller scoring & aggregation
description: How the Top Caller reputation system derives stats live from immutable callouts
---

Top Caller reputation is derived **live** from the append-only `callouts` table — there is no stored caller score/rank. Recompute on read (cached ~60s), never persist a denormalized score.

**Live multiple** = currentPriceUsd ÷ call_price_usd, fetched per distinct mint with bounded concurrency (pMap). A call is a "hit" at multiple ≥ HIT_MULTIPLE (2×). Calls with no fresh price (dev: dexscreener/helius unreachable) are ungraded → multiple null; they still count in callsMade but not gradedCalls/avg/best/hitRate.

**callerScore** uses Bayesian shrinkage (K=5) so a single lucky 100× call doesn't top a consistent caller — blends hit rate, avg & best multiple, and call volume. Don't "fix" a low score for someone with 1 graded call; shrinkage toward the prior is intentional.

**Why:** callouts are immutable (see callouts-immutable.md), so reputation must be a pure function of the call history + current prices — keeps it tamper-proof and always consistent with the record.

**How to apply:** ranking/stats live in api-server lib/callers.ts (computeCallers/getTopCallers/getCallerStats), exposed via GET /leaderboard/callers and GET /profiles/:id/caller-stats. Feed callout items come from lib/feed.ts getActivity UNION (kind="callout"). In dev, expect empty caller boards + null multiples because price data is unreachable.
