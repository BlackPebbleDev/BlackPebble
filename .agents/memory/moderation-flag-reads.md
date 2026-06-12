---
name: Moderation-flag public reads
description: Invariant for is_test / is_hidden_by_admin across public social reads + the feed schema-ensure rule
---

Callouts, standalone theses and journal entries each carry two moderation flags:
`is_hidden_by_admin` (soft-hide) and `is_test` (test/admin-tagged content).

**Rule:** every *public* read of these tables must exclude BOTH flags
(`is_hidden_by_admin = FALSE AND is_test = FALSE`). Owner-scoped admin/moderation
reads may opt back in (e.g. an `includeTest` flag) to surface tagged rows.

**Why:** a public read that filters only `is_hidden_by_admin` leaks test-tagged
rows into normal users' views (this happened to `getUserCallouts`, which filtered
hidden but not test). The thesis reads got it right with a toggled `testClause`.

**How to apply:** when adding any new public surface that lists callouts/theses,
copy the dual-flag predicate. For admin tables, gate the test rows behind an
explicit option rather than dropping the filter entirely.

**Feed corollary:** `feed.ts getActivity` reads the callout/thesis moderation
columns directly. It must `await ensureProfileSchema()` (callouts live there) and
`ensureThesesSchema()` before running its UNION, otherwise a fresh database 500s
on the first feed request because the columns don't exist yet. The feed route
itself does not ensure schema, so getActivity owns that responsibility.
