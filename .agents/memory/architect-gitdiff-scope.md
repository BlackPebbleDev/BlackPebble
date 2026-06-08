---
name: Architect git-diff false scope flags
description: Why architect review may wrongly flag "out of scope" files, and how to confirm real scope.
---

When running the architect code review with `includeGitDiff: true`, the diff it
inspects can include changes from **prior already-merged tasks** that are committed
on the branch, not just the uncommitted work from the current session.

This produces false "hard-constraint violation / out of scope" findings — the
architect may list files the current task never touched (e.g. order-engine files
during a UX-only pass).

**Why:** The review surfaces a cumulative/committed view, while the current task's
actual footprint is only the uncommitted changes.

**How to apply:** Before accepting any architect "out of scope" flag, run
`git --no-optional-locks status --short` to see which files are *actually*
uncommitted this session. Only treat files in that list as your scope. Still act
on legitimate correctness findings within those files.
