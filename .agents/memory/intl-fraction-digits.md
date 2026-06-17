---
name: Intl fraction-digits crash class
description: toLocaleString/Intl.NumberFormat throws RangeError when minimumFractionDigits > maximumFractionDigits; a data-dependent render crash.
---

# Intl fraction-digits RangeError

`Number.prototype.toLocaleString` / `Intl.NumberFormat` throw
`RangeError: maximumFractionDigits value is out of range.` whenever
`minimumFractionDigits > maximumFractionDigits`. This is a **render-phase** throw,
so in React it bubbles to the nearest ErrorBoundary and blanks the whole subtree.

**Why it bit us:** `formatUsd` (recovery-classify.ts) hardcoded
`minimumFractionDigits: 2` but set `maximumFractionDigits: value >= 1000 ? 0 : 2`.
For any value ≥ 1000 (e.g. a token marketCapUsd of 2073), min(2) > max(0) → crash.
The Wallet Cleaner page-level ErrorBoundary fired on every Scan because a held
token rendered its "Market cap" stat. Purely data-dependent — clean for small
values, crashes for large — which is why static reads and `?? []` guards missed it.

**How to apply:**
- Any currency/number formatter that varies `maximumFractionDigits` by magnitude must
  move `minimumFractionDigits` in lockstep (or omit min so it defaults ≤ max).
- Data-dependent render crashes won't show in static analysis or with synthetic
  small values — reproduce with the REAL data that triggers the boundary.
- A `renderToStaticMarkup` (vitest node env, no jsdom/testing-library needed) test
  that renders the real component tree with real fixture data surfaces the EXACT
  throwing line + component stack. Mock `@/lib/api` and data hooks; keep Radix
  dialogs `open={false}` to avoid portal/DOM false positives.
