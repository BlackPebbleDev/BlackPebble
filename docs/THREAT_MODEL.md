# Threat Model

## Project Overview

BlackPebble is a publicly deployed Solana paper-trading application with a React/Vite frontend (`artifacts/blackpebble`) and an Express/PostgreSQL backend (`artifacts/api-server`, `lib/db`). Users can trade simulated positions, view portfolios and leaderboards, search markets, and optionally sign in with X. The production deployment is public, uses Replit-managed TLS, and should be analyzed as internet-reachable. The mockup sandbox artifact is a development-only surface and is out of scope unless production reachability is demonstrated.

## Assets

- **Trading accounts and portfolio state** — account balances, open positions, trade history, watchlists, portfolio snapshots, participation points, and leaderboard standing. Compromise lets an attacker alter balances, reset accounts, manipulate rankings, or spy on a user's strategy.
- **User identity bindings** — X identities, linked wallet addresses, display names, and avatars in `user_identities` and `users`. Compromise enables impersonation and incorrect attribution on social/profile surfaces like the leaderboard.
- **Session tokens and OAuth state** — the `__x_session` cookie, PKCE state/verifier cookie, OAuth client credentials, and JWT signing secret. Compromise enables account takeover or forged sessions.
- **Application secrets and privileged controls** — `DATABASE_URL`, `JWT_SECRET`, X OAuth secrets, `HELIUS_API_KEY`, and `ADMIN_RESET_TOKEN`. Leakage or misuse can expose the database, forge auth, or perform destructive administrative actions.
- **Operational market data pipelines** — outbound fetches to DexScreener, Jupiter, Helius, PumpPortal, and cron-generated portfolio snapshots. Abuse can affect pricing integrity, availability, or privacy if untrusted inputs cross these boundaries unsafely.

## Trust Boundaries

- **Browser to API** — all frontend input crosses into `/api/*`. The browser is untrusted; identifiers, wallet strings, token mints, and account references from the client must not be trusted as proof of ownership.
- **API to PostgreSQL** — the API has direct write access to trading and identity data. Injection or authorization mistakes at the API layer can expose or corrupt all persisted user state.
- **Public to authenticated boundary** — market-data endpoints are intended to be public, while identity-linked actions and any account-specific reads/writes must be enforced server-side. Client-side wallet connection or X login state is not itself authorization.
- **Wallet/X identity boundary** — wallet strings and synthetic `x:<id>` account keys are user identifiers, not authenticators. Any binding between an X account and a wallet address must require proof of wallet control.
- **API to external services** — server-side calls to X OAuth, DexScreener, Jupiter, Helius, and PumpPortal cross into third-party systems. Responses and metadata from these systems are untrusted and must be validated before use or storage.
- **Production to dev-only boundary** — `artifacts/mockup-sandbox` is not part of the production deployment and should usually be ignored during production vulnerability analysis.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/blackpebble/src/main.tsx`, `artifacts/blackpebble/src/lib/api.ts`
- **Highest-risk areas:** account/trade/portfolio routes, `artifacts/api-server/src/routes/auth-x.ts`, `artifacts/api-server/src/lib/trading.ts`, DB schema in `lib/db/src/schema/index.ts`
- **Public surfaces:** `/api/markets/*`, `/api/live/*`, `/api/leaderboard`, token search/token info, health check
- **Account-specific surfaces:** `/api/account/*`, `/api/trade/*` for execution/history/watchlist/positions, `/api/portfolio/*`, `/api/auth/x/*`
- **Privileged surface:** `/api/admin/reset-paper-trading`
- **Usually dev-only:** `artifacts/mockup-sandbox/**`

## Threat Categories

### Spoofing

This project supports X-based login, but much of the trading surface is keyed by caller-supplied wallet strings or synthetic account identifiers. The system must treat cookies, OAuth callbacks, wallet addresses, and `x:<id>` identifiers differently: sessions must prove user identity, and wallet linkage must prove wallet control rather than accepting arbitrary strings from the client. Administrative actions must require a non-guessable secret and must never be reachable through weaker user-facing identity paths.

### Tampering

Users can trigger simulated trades, resets, watchlist updates, identity linking, and leaderboard-affecting actions over the public API. The backend must calculate all trading outcomes server-side and must also verify that the caller is allowed to mutate the targeted account. Client-provided wallet/account identifiers, token metadata, and trade parameters must not allow an attacker to alter another user's paper-trading state or associated identity records.

### Information Disclosure

Portfolio history, watchlists, trade history, balances, and linked profile information reveal user behavior and can be privacy-sensitive even in a paper-trading product. The system must ensure account-specific reads are scoped to the authenticated owner, avoid leaking secrets or cookies in logs, and avoid reflecting verbose internal errors to public clients. Third-party metadata and external API failures must not cause sensitive server-side details to be exposed.

### Denial of Service

The public deployment exposes search, quote, live market, and trade endpoints backed by database writes and third-party APIs. The system must prevent unauthenticated or weakly authenticated callers from triggering unbounded work, excessive outbound requests, destructive resets, or repeated state churn against shared accounts. Timeouts, bounded result sizes, and safe subscription limits are important because the app depends on live market feeds and periodic background snapshots.

### Elevation of Privilege

The most important privilege boundary is ownership of a trading account and any linked identity. The system must enforce that only the rightful owner of an account can read or modify its positions, history, watchlist, reset state, or identity mapping. Authorization must be server-side and derived from validated session or wallet proof, not from raw request parameters or client-maintained state.