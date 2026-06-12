---
name: Callout live performance (ATH / multiple)
description: How called-token performance (Current X / ATH X) is computed and the constraints that keep it correct.
---

# Callout live performance: Current X / ATH X

Live callout grading shows Called MC, Current MC, Current X (=curPrice/callPrice),
and ATH X (=peakPrice/callPrice). It is computed dynamically on read; the original
Called MC + call price + timestamp are preserved and never recomputed (callouts are
append-only).

**ATH is a peak-since-tracking high-water mark, not a true historical ATH.**
There is no historical OHLCV source available, so ATH only reflects the peak observed
since we started tracking a given call. Persisted in `token_price_peaks` (mint PK,
peak_price_usd, peak_market_cap_usd). It climbs via: (a) a cron over recent-callout
mints, and (b) any read path that already fetched a live price folding its observation
back in. The UI states this honestly ("peak observed since we began tracking").

**Why read/record order does not matter:** `athMultipleFrom(peak, callPrice, currentMultiple)`
clamps the result to `>= currentMultiple`. So the reported ATH X is always
`max(recordedPeak/callPrice, currentMultiple)` — reading the peak *before* folding in
the current sample yields the same value as reading after. Do not "fix" feed/profile
by reordering record-before-read; it changes nothing and adds a round trip.

**How to apply:**
- Enrich ONLY callout items. Theses and trades must never carry Current X / ATH X
  (theses are never graded).
- Batch peak reads/writes per page (one `getTokenPeaks(mints)` + one `recordTokenPeaks`),
  never per-callout — `calloutResult` takes a pre-fetched peak to avoid an N+1.
- Never touch trading/leverage/portfolio/leaderboard accounting from these paths.
