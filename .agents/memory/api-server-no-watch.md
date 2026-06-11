---
name: api-server dev has no watch
description: Why backend route/code edits don't take effect until you restart the api-server workflow
---

The `@workspace/api-server` `dev` script runs `build && start` (esbuild bundle to
`dist/index.mjs`, then `node dist/index.mjs`) — it does NOT watch/reload.

**Why:** New backend code (routes, lib changes) will 404 / behave like the old
build until the process is rebuilt. The Vite web app hot-reloads, so a frontend
that calls a brand-new endpoint will appear broken (404) even though the code is
correct — the *server* is stale, not the client.

**How to apply:** After ANY api-server source edit, restart the
`artifacts/api-server: API Server` workflow before testing/screenshotting.
Confirm via the workflow log's build timestamp vs. when you made the edit.
