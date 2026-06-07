---
name: Adding dependencies to an artifact
description: How to install an npm dependency into a single artifact/package in this pnpm monorepo
---

To add a runtime dependency to one artifact (e.g. `artifacts/blackpebble`), run the
install from inside that package directory:

```
cd artifacts/blackpebble && pnpm add <pkg>
```

**Why:** Running `pnpm add <pkg>` (or the installLanguagePackages tool) from the repo
root errors with `ERR_PNPM_ADDING_TO_ROOT` because the root is a workspace root — pnpm
refuses to add a dep there without an explicit `-w` flag, and you almost never want the
dep at the root anyway.

**How to apply:** Always `cd` into the target artifact/package before `pnpm add`. Use
`-w` only when a dependency genuinely belongs to the workspace root.
