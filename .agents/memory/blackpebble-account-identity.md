---
name: BlackPebble account identity model
description: How a trading account is keyed across Solana wallet vs X login, and why X takes priority.
---

# Account identity / guest mode

All trading data (accounts, positions, trades, portfolio, leaderboard) is keyed by a single text `wallet` column on the server. There is no separate "user_id" key for trading — the `wallet` string IS the account key.

Two identity sources exist client-side: the Solana wallet (`useWallet`) and the X session (`useXAuth`, via `/api/auth/x/me`). `useAccount` unifies them into one `accountKey`:

- `accountKey = xUser ? \`x:\${xUser.x_id}\` : (solanaWallet ?? null)`
- `isGuest = !accountKey` (guest ONLY when no X session AND no wallet)
- `useAccount().wallet` returns this `accountKey` (not necessarily the raw Solana address), so every consumer that keys server calls off `wallet` works for both wallet and X accounts.

**Why X takes priority over the wallet:** Phantom `autoConnect` is on, so a wallet often connects automatically. If the wallet took priority, signing in with X would not drive the account — recreating the original "X user stuck in Guest Mode" bug.

**Provider order matters:** `XAuthProvider` must wrap `AccountProvider` (App.tsx). To avoid a circular import, `use-x-auth.tsx` reads the wallet from `useWallet()` directly — it must NOT import `useAccount`.

**Leaderboard identity resolution:** `getLeaderboard` (trading.ts) `ident` CTE resolves X profile two ways — wallet-keyed accounts via `provider='wallet'` rows, and X-only accounts via a UNION ALL branch mapping `'x:' || provider_user_id`. Any new account-key namespace needs a matching branch or it shows a raw key instead of the X profile. Base58 wallet addresses never contain `:`, so the namespaces can't collide.

**Known tradeoff (by design, not a bug):** X-priority means a user who traded wallet-only and later signs in with X switches to a fresh `x:<id>` account; the wallet-keyed history still exists in the DB but is hidden while logged into X. No automatic wallet↔X history merge exists.

**Pre-existing security gap (out of scope when this was written):** `/api/auth/x/link-wallet` accepts an arbitrary wallet string with no proof-of-ownership and `linkWalletToUser` will silently reassign an already-linked wallet to another user — wallet-spoofing risk in the identity-link metadata. Does not affect trading account keying, but fix before relying on wallet↔X links for anything trust-sensitive.
