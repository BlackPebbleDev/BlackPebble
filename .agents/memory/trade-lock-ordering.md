---
name: Trade transaction lock ordering
description: BlackPebble api-server — every multi-row trade transaction must acquire row locks in the same table order to avoid Postgres deadlocks.
---

# Trade transaction lock ordering

Inside any `withTx` that locks more than one row in the trade path, acquire
`FOR UPDATE` locks in a single canonical order: **accounts first, then
positions** (then any other tables). `executeBuy` and `executeSell` both follow
this order.

**Why:** A previous version locked accounts→positions in buy but
positions→accounts in sell. Concurrent buy+sell on the same wallet/mint could
deadlock (each holds one row, waits on the other), producing aborted
transactions / 500s. Caught in code review during the SQLite→Postgres migration.

**How to apply:** When adding any new trade-path transaction or new locked
table, keep accounts as the first lock and append new tables after positions in
a consistent order across all code paths. `recordParticipation` runs in its own
separate transaction (locks only participation_metrics, then UPDATEs accounts);
it does not nest with the buy/sell transaction, so it does not break the rule —
keep it that way (don't fold it into the trade transaction).
