---
name: Production DB is separate from dev
description: BlackPebble's published app uses a different database than dev; how to reset/query prod
---

# Production database is separate from development

The published app (blackpebble.fun) connects to its OWN production Postgres,
NOT the dev database.

- Dev DB (`heliumdb`): what `executeSql` and local scripts hit. Held only test
  accounts (e.g. TestWallet*, QAWallet*, x:devtest9999, one base58 wallet), all
  at 100 SOL, 0 trades.
- Prod DB: holds the REAL users (real Solana wallets, hundreds of trades). A
  wallet visible on the live site but absent from `executeSql` results means
  you're looking at the wrong (dev) database.

**Why:** A dev-side reset (SQL script / executeSql) does NOT affect production.
Users will keep reporting "not reset" because prod was never touched.

**How to apply:** To reset or inspect PRODUCTION paper-trading data, call the
app's own admin endpoint against the live URL, not the dev DB:
`POST https://blackpebble.fun/api/admin/reset-paper-trading`
header `x-admin-token: $ADMIN_RESET_TOKEN`, body `{"dryRun":true}` to inspect,
`{}` to run, `{"force":true}` to re-run after the double-run guard.
The endpoint backs every affected table into schema `reset_backups` first
(reversible), then resets all accounts to 100 SOL.
`checkDatabase({environment:"production"})` returns provisioned:false here — that
is misleading; prod data is real and reachable only through the deployed API.
