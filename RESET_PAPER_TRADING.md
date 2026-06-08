# BlackPebble Paper Trading — Season Reset

## What this does

Resets all paper trading accounts to a clean slate. Think of it as the start of a new season: every wallet gets a fresh balance, all trades and positions are wiped, and leaderboard stats return to zero. Wallet connections, watchlists, and authentication are never touched.

---

## Tables affected

| Table | Action | What is preserved |
|---|---|---|
| `accounts` | UPDATE | `wallet`, `created_at`, `last_active` — everything else reset |
| `positions` | DELETE all | — |
| `trades` | DELETE all | — |
| `paper_orders` | DELETE all (TP, SL, Buy Limits) | — |
| `portfolio_snapshots` | DELETE all | — |
| `leaderboard_snapshots` | DELETE all | — |
| `participation_metrics` | DELETE all | — |
| `competition_results` | DELETE all | — |
| `competitions` | DELETE all | — |
| `watchlist` | ✅ Untouched | All rows kept |
| `token_views` | ✅ Untouched | Analytics kept |
| `search_activity` | ✅ Untouched | Analytics kept |
| `users` | ✅ Untouched | Identity kept |
| `user_identities` | ✅ Untouched | Auth kept |

---

## How to run a reset

### Option 1 — CLI utility (recommended)

```bash
pnpm --filter @workspace/scripts reset-paper-trading
```

With a custom starting balance (e.g. 50 SOL):

```bash
pnpm --filter @workspace/scripts reset-paper-trading -- --balance 50
```

Dry run (prints counts and SQL, makes no changes):

```bash
pnpm --filter @workspace/scripts reset-paper-trading -- --dry-run
```

The script requires `DATABASE_URL` to be set in the environment (it is in the Replit workspace automatically).

### Option 2 — Raw SQL

Run `RESET_PAPER_TRADING.sql` against the database. Safe to re-run (idempotent).

```bash
# Example using psql
psql "$DATABASE_URL" -f RESET_PAPER_TRADING.sql
```

---

## Season reset history

| Date | Starting balance | Accounts reset | Notes |
|---|---|---|---|
| 2026-06-07 | 100 SOL | 4 | Initial beta reset — clean slate before broader launch |

---

## Defaults

| Setting | Value |
|---|---|
| Default starting balance | 100 SOL |
| Watchlists preserved | Yes |
| Wallet / auth preserved | Yes |
| Token market data preserved | Yes |
