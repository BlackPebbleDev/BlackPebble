---
name: Guest mode anti-cheat migration
description: How BlackPebble migrates localStorage guest paper-trading state to a wallet without enabling leaderboard cheating, and how partial failures are handled.
---

# Guest → wallet portfolio migration

When a wallet connects while local guest activity exists, the user is offered
"Save guest portfolio?" (Save / Start Fresh).

## Rule
Save must re-create each guest open position by calling the **real server**
`api.execute` buy (sized by `total_sol_spent`) and migrate the watchlist via
`api.watchlistAdd`. It must **NEVER** import the guest's trade history or
realized P&L into the server/leaderboard.

**Why:** Guest state lives entirely in localStorage and is fully client-editable.
Importing client-computed realized P&L or closed trades would let anyone
fabricate a winning record locally and "save" it onto the leaderboard. Only
positions re-bought through the server (which recomputes fills/slippage and
debits the real balance) are trustworthy.

**How to apply:** Any future change to the migration flow, or any new "import
guest data" feature, must route through server execute and drop history/realized
P&L. Guests are also never leaderboard-eligible (they have no DB rows).

## "Start Fresh" must DISCARD, not just dismiss
Start Fresh has to call `clearGuest()` (wipe localStorage + reset state) AND
`dismissMigration(wallet)`, then invalidate the server queries. A bug existed
where it only called `dismissMigration`, leaving guest positions/balance/history
dormant in localStorage (they'd reappear later). `clearGuest()` also makes
`hasGuestActivity()` false, which hides the modal immediately (no re-show race).

**How to apply:** "discard guest data" always means `clearGuest()`, never just
dismissing the prompt. `wallet` here is the unified accountKey, so this works for
both wallet and X login.

## Partial-failure handling
Buys run sequentially so the server balance debits in order; a buy that would
overdraw simply fails server-side. Track which mints actually migrated:
- all succeeded → `clearGuest()` (wipe local state).
- some failed → `removeGuestPositions(migratedMints)` (drop only the moved ones)
  + `dismissMigration(wallet)`. Do **not** `clearGuest()` on partial success —
  that silently destroys positions that never transferred.

## Market math
Guests reuse the account-free `/trade/quote` endpoint for all market math and do
only local bookkeeping. Guest **sell** quotes must pass an explicit `tokenAmount`
(derived from the local position: `total_tokens * pct/100`), not `percent` —
the server resolves `percent` against a DB position the guest doesn't have.
