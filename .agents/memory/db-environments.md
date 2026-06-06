---
name: Dev vs prod databases are separate
description: BlackPebble dev and production use different Postgres databases; how to write to prod
---

# Dev and production are SEPARATE databases

BlackPebble's development workspace and its published deployment (blackpebble.fun)
use **different** Postgres databases. The workspace `DATABASE_URL`/`PG*` secrets point
at the dev database; the autoscale deployment uses its own production database.

**Evidence:** `executeSql({environment:"development"})` vs `{environment:"production"}`
return very different row counts (e.g. dev had 2 accounts / prod had 5+, prod had far
more trades and token_views).

**Why it matters:** the `database` skill's `executeSql` with `environment:"production"`
is **READ-ONLY** (SELECT only). You cannot DELETE/UPDATE/DDL the live database from the
agent tools.

**How to apply — to mutate production data:**
- Build a token-protected admin endpoint in the api-server, deploy it (user clicks
  Publish), then call it against `https://blackpebble.fun/api/...` with the secret token.
- Reach the dev api-server for testing at `https://$REPLIT_DEV_DOMAIN/api/...`
  (externalPort 80 → api-server localPort 8080; api routes are mounted under `/api`,
  health is `/api/healthz`).
- After a one-time admin operation, disable it by deleting its token secret (endpoint
  returns 503 when the secret is unset) and/or remove the route and republish.
