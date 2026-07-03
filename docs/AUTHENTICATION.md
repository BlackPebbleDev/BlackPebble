# Authentication

BlackPebble uses **X (Twitter) OAuth 2.0 with PKCE** for identity. Wallet linking is a separate step after X login.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `JWT_SECRET` | Production | Signs the `__x_session` HTTP-only cookie (30-day JWT) |
| `X_CLIENT_ID` | Yes | OAuth 2.0 client ID from the X developer portal |
| `X_CLIENT_SECRET` | Yes | OAuth 2.0 client secret (server-side only) |
| `FRONTEND_URL` | Yes | Frontend origin for OAuth redirect (e.g. `http://localhost:5173`) |
| `X_OAUTH_OFFLINE_ACCESS` | No | Set `false` to omit `offline.access` scope (default: enabled) |
| `X_CONSUMER_KEY` / `X_CONSUMER_SECRET` | No | Optional OAuth 1.0a keys for banner image fetch via v1.1 API |

## Flow

1. `GET /api/auth/x/login` — stores PKCE verifier in a cookie, redirects to X.
2. User approves on X → callback hits `GET /api/auth/x/callback` (proxied through the frontend in dev).
3. Server exchanges the code, upserts `users` + `user_identities`, saves encrypted OAuth tokens, sets `__x_session`.
4. Frontend reads `GET /api/auth/x/me` for the current user (avatar, username, verified badge).

## Local development

- Session cookies use `Secure: false` when `NODE_ENV` is not `production`, so `http://localhost` works.
- Register the callback URL in the X app settings: `{FRONTEND_URL}/api/auth/x/callback`.

## Follow counts

- **BlackPebble follow counts** (`user_follows`) are shown on profile cards — in-app social graph.
- **X follower/following counts** are stored in the database for future use but are not displayed in the UI yet.

## Security notes

- Never commit `.env`. Rotate any secret that was ever in git history before making the repo public.
- OAuth refresh tokens are encrypted at rest (AES-256-GCM, key derived from `JWT_SECRET`).
