---
name: BlackPebble dev environment conventions
description: Non-obvious paths and URL shapes for testing the BlackPebble api-server locally.
---

# BlackPebble dev conventions

- **SQLite DB** lives at `artifacts/data/blackpebble.db` (NOT under
  `artifacts/api-server/`). `better-sqlite3` is at
  `artifacts/api-server/node_modules/better-sqlite3`.
- **API routes** are mounted under `/api`, and use a `resource/action/:param`
  shape, e.g. `/api/portfolio/stats/:wallet` (NOT `/portfolio/:wallet/stats`).
- **curl from the shell** needs the scheme: `https://$REPLIT_DEV_DOMAIN/api/...`
  ($REPLIT_DEV_DOMAIN has no protocol prefix, so bare `$REPLIT_DEV_DOMAIN/...`
  fails with curl exit code 7).
