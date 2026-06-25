---
name: Workflow names are artifact-prefixed
description: restart_workflow needs the full "artifacts/<dir>: <service>" name, not the bare service title.
---

In this pnpm monorepo, each artifact's workflow is named `artifacts/<dir>: <serviceName>`
(e.g. `artifacts/api-server: API Server`, `artifacts/blackpebble: web`,
`artifacts/mockup-sandbox: Component Preview Server`).

**Why:** restart_workflow with the bare service name ("API Server") fails with
RUN_COMMAND_NOT_FOUND. The artifact.toml `[[services]] name` is only the suffix.

**How to apply:** Call `listWorkflows()` (code_execution) to get exact names, then
pass the full prefixed string to restart_workflow.
