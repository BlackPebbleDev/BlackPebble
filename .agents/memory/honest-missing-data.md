---
name: Honest missing-data treatment (BlackPebble)
description: Which analytics have no backing data and must never be fabricated in UI or mockups.
---

# Peak MC / Drawdown-from-peak are not tracked

BlackPebble stores entry/current market cap per position but does NOT store a
continuous market-cap time series per holding. Therefore **Peak MC** and
**Drawdown From Peak** cannot be computed.

**Rule:** surface these honestly — render `—` with a small "Not tracked yet"
sub-label and a one-line footnote explaining why. Never invent a peak value, a
peak progress bar, or a from-peak percentage.

**Why:** a prior mockup fabricated Peak MC ($1.62B), a 78%-width peak progress
bar, and "From Peak -8.6%". That misrepresents the product and contradicts the
real app, which shows the honest treatment. The user explicitly approved
honesty over fabricated analytics.

**How to apply:** any new position/detail view or mockup that lists market-cap
analytics must keep MC Multiple / MC Gain (computable) live, but gate Peak MC /
From Peak behind the not-tracked treatment until real MC history is stored.
