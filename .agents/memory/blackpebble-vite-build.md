---
name: blackpebble vite build is slow + OOMs
description: How to build the blackpebble web artifact without OOM/timeout, and what to rely on for verification.
---

`pnpm run build` for the blackpebble web artifact OOMs, and even the bundle step
is very slow (often >5 min — exceeds the 2-minute bash tool limit).

**How to apply:**
- Build with raised heap, from the package dir:
  `cd artifacts/blackpebble && NODE_OPTIONS="--max-old-space-size=6144" npx vite build --config vite.config.ts`
- Because it routinely outlasts the tool timeout, run it backgrounded and poll,
  or skip the full build and rely on `npx tsc --noEmit -p tsconfig.json` (fast,
  catches type/unused-import errors) plus the already-running dev workflow +
  app-preview screenshots for runtime/render verification.

**Why:** tsc + the live dev server exercise the same source; a green typecheck and
clean preview are sufficient signal when the production bundle step is too slow to
finish in-tool.
