---
name: Drizzle push needs a TTY
description: Why `drizzle-kit push` is unusable in this environment and what to do instead for schema DDL.
---

`pnpm --filter @workspace/db run push` (drizzle-kit push) prompts interactively
and there is no TTY in the agent shell, so it hangs / cannot be used to apply
schema changes.

**Why:** the agent shell is non-interactive; drizzle-kit's confirmation prompts
never receive input.

**How to apply:** apply schema DDL directly via the `executeSql` tool (idempotent
`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), then
mirror the change in `lib/db/src/schema/index.ts` so Drizzle types stay in sync.
Keep the SQL idempotent so re-runs are safe.
