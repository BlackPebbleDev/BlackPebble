---
name: Leverage exit-order orphan-cancel race
description: Why the eval fill-failure branch must guard its claim-release on status='filling'
---

When `evaluateLeverage` fills a leverage exit order it claims it `pending -> filling`, runs `performClose`, then on failure releases the claim back to `pending`. That release MUST be guarded with `WHERE id=$1 AND status='filling'`.

**Why:** A concurrent full close / liquidation runs `performClose`, whose orphan cleanup cancels all remaining exit orders `WHERE status IN ('pending','filling')`. If the eval failure branch reverts unconditionally (`WHERE id=$1`), it resurrects a just-canceled orphan back to `pending`, so a dead order can fire against a closed position — violating the orphan-cancel guarantee.

**How to apply:** Any status transition that "reverts" a claimed/in-flight leverage exit order must be conditional on its current in-flight status, never an unconditional `WHERE id`. Same pattern as the position `closing -> open` reaper. Consider a stale-`filling` reaper so interrupted fills don't leave permanently non-editable orders.
