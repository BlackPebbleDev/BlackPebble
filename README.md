# BlackPebble

Solana paper-trading platform: trade simulated positions against live market data, track portfolios, climb leaderboards, and use wallet utilities — without risking real funds.

## Stack

- **Frontend** (`artifacts/blackpebble`) — React 19, Vite 7, Wouter, Tailwind CSS v4, TanStack Query, shadcn/ui, Solana wallet adapters
- **Backend** (`artifacts/api-server`) — Express 5 on Node.js 24, bundled with esbuild
- **Database** — PostgreSQL with Drizzle ORM (`lib/db`)
- **Auth** — X (Twitter) OAuth 2.0 PKCE → JWT session cookies
- **Monorepo** — pnpm workspaces

## Repository layout

```
artifacts/
  blackpebble/       Main web app (Vite SPA)
  api-server/        Express API (all routes under /api)
  mockup-sandbox/    Design/component preview sandbox (dev-only)
lib/
  db/                Drizzle schema + Postgres pool (source of truth for DB)
  api-spec/          OpenAPI spec + Orval codegen config
  api-zod/           Generated Zod validators
  api-client-react/  Generated TanStack Query hooks
scripts/             Operational scripts (e.g. season reset)
docs/                Audits, security review, cleanup logs
```

## Prerequisites

- Node.js 24+
- pnpm 10+ (`npm install -g pnpm`)
- PostgreSQL 16+ running locally

## Local setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in `DATABASE_URL` (and optionally API keys — see comments in `.env.example`).
   The app runs without the optional keys; the related features degrade gracefully.

3. **Create the database and push the schema**

   ```bash
   # createdb blackpebble   (or CREATE DATABASE blackpebble; via psql)
   pnpm --filter @workspace/db run push
   ```

4. **Run the servers** (two terminals)

   ```bash
   # Terminal A — API server on :8080 (reads .env at repo root)
   pnpm --filter @workspace/api-server run dev

   # Terminal B — frontend on :5173 (proxies /api to :8080)
   pnpm --filter @workspace/blackpebble run dev
   ```

   Open http://localhost:5173.

> **Note:** the API server does not hot-reload — restart it (`run dev`) after backend changes. The frontend hot-reloads via Vite.

## Common commands

| Command | What it does |
|---|---|
| `pnpm run typecheck` | Typecheck every package |
| `pnpm run build` | Typecheck + production build of all packages |
| `pnpm --filter @workspace/db run push` | Push Drizzle schema changes to the DB |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks/Zod from OpenAPI |
| `pnpm --filter @workspace/scripts run reset-paper-trading` | Season reset utility |

## Environment variables

See `.env.example` for the full annotated list. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `PORT` | Yes (API) | API server port (frontend proxies to 8080) |
| `JWT_SECRET` | Prod only | Signs session cookies; X login disabled in dev if unset |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | Optional | X OAuth credentials |
| `FRONTEND_URL` | Optional | OAuth redirect target |
| `HELIUS_API_KEY` / `VITE_HELIUS_API_KEY` | Optional | Solana RPC + metadata |
| `BIRDEYE_API_KEY` | Optional | Sparkline price history |
| `ADMIN_X_USER_IDS` / `ADMIN_RESET_TOKEN` | Optional | Admin access + reset endpoint |
| `CORS_ALLOWED_ORIGINS` | Prod only | CORS allowlist |

**Never commit `.env`** — it is gitignored. Real secrets belong in your local `.env` or the deployment platform's secret manager.

## History

This project was originally prototyped on Replit and fully migrated off it in July 2026.
All Replit-specific configuration, dependencies, and code paths have been removed.
Historical documents from that era live in `docs/archive/`.
