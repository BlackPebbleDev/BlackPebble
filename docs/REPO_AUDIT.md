# BlackPebble Repository Audit

**Date:** June 13, 2026  
**Scope:** Full monorepo — `artifacts/blackpebble`, `artifacts/api-server`, `artifacts/mockup-sandbox`, `artifacts/data`, `lib/*`, `scripts/`  
**Method:** Read-only static analysis. No files modified, moved, or deleted.

---

## Table of Contents

1. [Repository Overview](#1-repository-overview)
2. [Duplicate Files](#2-duplicate-files)
3. [Dead Code](#3-dead-code)
4. [Unused Components](#4-unused-components)
5. [Unused Routes](#5-unused-routes)
6. [Unused Dependencies](#6-unused-dependencies)
7. [Security Concerns](#7-security-concerns)
8. [Build Concerns](#8-build-concerns)
9. [Deployment Concerns](#9-deployment-concerns)
10. [Suggested Folder Structure](#10-suggested-folder-structure)
11. [Suggested Cleanup Plan](#11-suggested-cleanup-plan)

---

## 1. Repository Overview

```
workspace/                        ← pnpm monorepo root
├── artifacts/
│   ├── api-server/               ← Express 5 + pg backend  (@workspace/api-server)
│   ├── blackpebble/              ← React + Vite + Wouter frontend  (@workspace/blackpebble)
│   ├── data/                     ← ⚠ SQLite DB files (stale, see §7)
│   └── mockup-sandbox/           ← Vite component preview server (canvas tool)
├── lib/
│   ├── api-client-react/         ← Orval-generated TanStack Query hooks (healthz only)
│   ├── api-spec/                 ← OpenAPI spec (healthz only) + orval codegen config
│   ├── api-zod/                  ← Orval-generated Zod validators (healthz only)
│   └── db/                       ← Drizzle ORM schema + pg Pool
└── scripts/
    └── src/
        ├── hello.ts              ← ⚠ Placeholder (dead)
        └── reset-paper-trading.ts← Season reset utility (legitimate)
```

**Tech stack:**
- Frontend: React 19, Vite 7, Wouter 3, Tailwind CSS v4, TanStack Query 5, shadcn/ui
- Backend: Express 5, PostgreSQL (via `pg` + Drizzle ORM), node-cron, pino, jose
- Auth: X (Twitter) OAuth 2.0 PKCE → JWT cookie session
- Solana: `@solana/web3.js`, Helius RPC, PumpPortal WebSocket

---

## 2. Duplicate Files

### 2.1 Dual frontend route aliases (same component, two paths)

```
/utilities/sol-recovery   → WalletCleaner  (App.tsx line ~50)
/utilities/wallet-cleaner → WalletCleaner  (App.tsx line ~51)

/utilities/journal        → TradingJournal (App.tsx line ~53)
/journal                  → TradingJournal (App.tsx line ~54)
```

Both pairs mount the identical component. The shorter alias (`/journal`) was added later; the `/utilities/journal` path is the original. Neither redirects to the other, so both are live and could receive inbound links. This is intentional aliasing but creates a confusing surface; ideally one alias redirects to the canonical URL.

### 2.2 Two chart libraries doing parallel jobs

`chart.js` + `react-chartjs-2` are used to render the P&L line chart in `portfolio.tsx` and `trading.tsx`.  
`recharts` is installed separately and only referenced inside the shadcn/ui `ui/chart.tsx` wrapper — which is **never imported** by any page or component.

There is no cross-library usage or migration in progress. These are simply two independent charting stacks coexisting in the same bundle.

### 2.3 API codegen pipeline exists but is largely unused

`lib/api-spec/openapi.yaml` only documents `/healthz`. The orval pipeline generates:

| Package | Status |
|---|---|
| `lib/api-client-react` | Installed in `blackpebble/package.json` — **zero imports** in source |
| `lib/api-zod` | Only used for `HealthCheckResponse` type in `routes/health.ts` |

The rest of the API (~19 route files, dozens of types) is covered by the hand-rolled `lib/api.ts` in the frontend. The codegen pipeline represents a planned pattern that was bootstrapped but never extended beyond the health-check endpoint.

---

## 3. Dead Code

### 3.1 `scripts/src/hello.ts`

```ts
console.log("Hello from @workspace/scripts");
```

A one-line placeholder left over from scaffolding. It is registered as `pnpm --filter @workspace/scripts hello` but serves no purpose. The sibling `reset-paper-trading.ts` is the only legitimate script.

### 3.2 `ui/chart.tsx` (shadcn/ui recharts wrapper)

```
artifacts/blackpebble/src/components/ui/chart.tsx
```

Wraps `recharts` with the shadcn/ui chart primitive API. Zero imports anywhere in the app outside this file. Neither `recharts` nor `chart.tsx` appear in any page or component import. The app uses `chart.js` + `react-chartjs-2` directly instead.

### 3.3 `@workspace/api-client-react` — installed but never imported

`blackpebble/package.json` lists `"@workspace/api-client-react": "workspace:*"` and `tsconfig.json` has a project reference to it. However, **no source file** in `artifacts/blackpebble/src/` imports from it. All API calls go through the hand-written `src/lib/api.ts`.

### 3.4 `lib/api-zod` — used for one type

`@workspace/api-zod` is used in exactly one place:

```ts
// artifacts/api-server/src/routes/health.ts
import { HealthCheckResponse } from "@workspace/api-zod";
```

The generated Zod schema (`HealthCheckResponse`) for a health-check response that only returns `{ status: "ok" }`. The whole codegen pipeline, orval config, and package exist to serve this single type.

---

## 4. Unused Components

### 4.1 shadcn/ui wrapper components — never imported by the app

The project was bootstrapped with the full shadcn/ui component kit. The following files exist in `artifacts/blackpebble/src/components/ui/` but are **never imported** by any page, component, hook, or lib in the application:

| File | Associated library |
|---|---|
| `accordion.tsx` | `@radix-ui/react-accordion` |
| `aspect-ratio.tsx` | `@radix-ui/react-aspect-ratio` |
| `breadcrumb.tsx` | `@radix-ui/react-slot` |
| `button-group.tsx` | (custom, no Radix dep) |
| `calendar.tsx` | `react-day-picker` |
| `carousel.tsx` | `embla-carousel-react` |
| `chart.tsx` | `recharts` |
| `command.tsx` | `cmdk` |
| `context-menu.tsx` | `@radix-ui/react-context-menu` |
| `drawer.tsx` | `vaul` |
| `dropdown-menu.tsx` | `@radix-ui/react-dropdown-menu` |
| `hover-card.tsx` | `@radix-ui/react-hover-card` |
| `input-group.tsx` | (custom) |
| `input-otp.tsx` | `input-otp` |
| `menubar.tsx` | `@radix-ui/react-menubar` |
| `navigation-menu.tsx` | `@radix-ui/react-navigation-menu` |
| `pagination.tsx` | (custom) |
| `resizable.tsx` | `react-resizable-panels` |
| `scroll-area.tsx` | `@radix-ui/react-scroll-area` |
| `slider.tsx` | `@radix-ui/react-slider` |
| `sonner.tsx` | `sonner` |
| `spinner.tsx` | (custom) |
| `toggle-group.tsx` | `@radix-ui/react-toggle-group` |

**23 component files** are installed, styled, and committed but contribute nothing to the running application. Each brings a dependency that bloats the install footprint.

### 4.2 Informational static pages

Three frontend pages exist that contain only static marketing/informational copy with no API calls, user state, or interactivity beyond links:

| Route | File | Lines |
|---|---|---|
| `/about` | `pages/about.tsx` | 74 |
| `/features` | `pages/features.tsx` | 104 |
| `/roadmap` | `pages/roadmap.tsx` | 94 |

These are reachable via the sidebar but not primary app flows. They are low-maintenance but add to the bundle and routing table.

---

## 5. Unused Routes

### 5.1 Frontend — duplicate aliases (covered in §2.1)

No completely dead frontend routes. Two path-pairs share the same component (see §2.1).

### 5.2 Backend — all 19 route handlers are wired

`artifacts/api-server/src/routes/index.ts` registers all 19 route modules and all are reachable. No dead backend routes found.

### 5.3 OpenAPI spec coverage gap

`lib/api-spec/openapi.yaml` only documents `/healthz`. The following ~60 API endpoints across 19 route files have **no OpenAPI specification**:

- All trade, portfolio, leverage, markets, leaderboard, auth, feed, profile, thesis, journal, analytics, and admin endpoints

This is not a dead route, but a documentation gap. The codegen pipeline and orval config exist to automate client + validator generation, yet the pipeline cannot be used for the vast majority of the API until the spec is extended.

---

## 6. Unused Dependencies

### 6.1 `artifacts/blackpebble` — confirmed unused

The following packages are listed in `blackpebble/package.json` but are **not imported anywhere** in `artifacts/blackpebble/src/`:

| Package | Why installed | Status |
|---|---|---|
| `recharts` | shadcn/ui `chart.tsx` wrapper | Wrapper never used; safe to remove with wrapper |
| `embla-carousel-react` | shadcn/ui `carousel.tsx` | Wrapper never used |
| `cmdk` | shadcn/ui `command.tsx` | Wrapper never used |
| `vaul` | shadcn/ui `drawer.tsx` | Wrapper never used |
| `react-day-picker` | shadcn/ui `calendar.tsx` | Wrapper never used |
| `next-themes` | shadcn/ui dark-mode pattern | Not used; app uses custom CSS variables |
| `input-otp` | shadcn/ui `input-otp.tsx` | Wrapper never used |
| `react-resizable-panels` | shadcn/ui `resizable.tsx` | Wrapper never used |
| `sonner` | shadcn/ui `sonner.tsx` | Wrapper never used; app uses Radix toast |
| `react-hook-form` | shadcn/ui `form.tsx` | `form.tsx` never used; forms are built manually |
| `@hookform/resolvers` | Companion to above | Same — never used |
| `date-fns` | Possibly for `calendar.tsx` | No import found anywhere |
| `react-icons` | Unknown | No import found anywhere |
| `@tailwindcss/typography` | Prose plugin | No `prose` class usage found |
| `@workspace/api-client-react` | Orval-generated hooks | Zero imports in source (see §3.3) |

### 6.2 `artifacts/blackpebble` — Radix UI packages behind unused wrappers

These packages are installed and used only inside their own shadcn/ui wrapper component — a wrapper that is never imported by the application:

```
@radix-ui/react-accordion
@radix-ui/react-aspect-ratio
@radix-ui/react-collapsible
@radix-ui/react-context-menu
@radix-ui/react-dropdown-menu
@radix-ui/react-hover-card
@radix-ui/react-menubar
@radix-ui/react-navigation-menu
@radix-ui/react-radio-group
@radix-ui/react-scroll-area
@radix-ui/react-slider
@radix-ui/react-switch
@radix-ui/react-toggle
@radix-ui/react-toggle-group
```

**14 Radix packages** whose only consumer is an unused wrapper component. Of the 27 Radix packages installed, 13 are actively used (dialog, toast, tooltip, tabs, select, popover, label, checkbox, avatar, progress, separator, slot, switch — several used directly by the app, some via wrappers that are actively used).

### 6.3 `artifacts/api-server` — all dependencies appear used

No clearly unused dependencies found in the API server. `ws` (PumpPortal WebSocket), `jose` (JWT), `tweetnacl` (wallet signature verification), `node-cron`, `pino`, `uuid`, `axios` — all actively used.

### 6.4 `scripts/` — lean and appropriate

`pg` and `tsx` are both needed for `reset-paper-trading.ts`. No excess.

---

## 7. Security Concerns

### 7.1 ⚠ HIGH — SQLite database files committed to the repository

```
artifacts/data/blackpebble.db      (232 KB)
artifacts/data/blackpebble.db-shm  ( 32 KB)
artifacts/data/blackpebble.db-wal  (4.0 MB)
```

These SQLite files are **tracked by git** (not in `.gitignore`), meaning every historical snapshot is preserved in git history. They appear to be from the development phase before the app migrated to PostgreSQL. They may contain seed data, test accounts, paper trade records, or wallet addresses.

**Risks:** Sensitive data in version history; WAL file can reconstruct DB state; included in deployment artifact; `artifacts/data/` has no `.gitignore`.

### 7.2 ⚠ HIGH — CORS allows all origins with credentials

```ts
// artifacts/api-server/src/app.ts
app.use(cors({ origin: true, credentials: true }));
```

`origin: true` mirrors the request's `Origin` header back as `Access-Control-Allow-Origin`, effectively allowing **any domain** to make credentialed cross-origin requests (i.e. with session cookies). In a production deployment this means any website can make authenticated API calls on behalf of a logged-in user.

**Recommendation:** Restrict `origin` to the known production domain(s): `["https://blackpebble.replit.app", ...]`.

### 7.3 MEDIUM — Helius API key exposed in client bundle

```ts
// artifacts/blackpebble/vite.config.ts
const heliusKey = import.meta.env.VITE_HELIUS_API_KEY;
```

All `VITE_*` environment variables are baked into the client-side JavaScript bundle at build time and are visible to anyone who opens DevTools. The Helius API key can be extracted and used by third parties, potentially exhausting rate limits or incurring unexpected costs.

**Recommendation:** Proxy RPC calls through the API server so the key never reaches the browser.

### 7.4 MEDIUM — JWT_SECRET unset → silent auth bypass risk

```ts
// artifacts/api-server/src/lib/auth.ts
const JWT_SECRET = process.env["JWT_SECRET"];
export async function verifySession(token) {
  if (!JWT_SECRET) return null;   // ← silently unauthenticated
  ...
}
```

If `JWT_SECRET` is missing from the environment, every session verification silently returns `null` instead of throwing at startup. Routes that guard behind `verifySession` would behave as if the user is unauthenticated rather than the server erroring hard on boot.

**Recommendation:** Validate required secrets at process startup and `process.exit(1)` if missing, similar to how `DATABASE_URL` is handled in `lib/db/src/index.ts`.

### 7.5 MEDIUM — No HTTP security headers

The Express app has no `helmet` or equivalent middleware. Responses lack:
- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Strict-Transport-Security`
- `Referrer-Policy`

**Recommendation:** Add `helmet()` as the first middleware in `app.ts`.

### 7.6 LOW — No rate limiting on public endpoints

Public API routes (`/api/markets/*`, `/api/feed`, `/api/profiles/*`, etc.) have no rate limiting. A single client can make unlimited requests. The DB queries for feed/markets are relatively expensive (JOINs, aggregations).

**Recommendation:** Add a lightweight in-process rate limiter (e.g. `express-rate-limit`) on at minimum the markets and feed endpoints.

### 7.7 LOW — Admin reset endpoint — high blast radius

```
POST /api/admin/reset
Header: x-admin-token: <ADMIN_RESET_TOKEN>
```

This endpoint deletes all paper trading data across every user. It uses `timingSafeEqual` (good — prevents timing attacks) and fails closed when `ADMIN_RESET_TOKEN` is unset (good). However, the operation is irreversible in production unless the automatic backup step completes successfully. There is no IP allowlist or secondary confirmation.

---

## 8. Build Concerns

### 8.1 API server has no watch mode in development

```json
// artifacts/api-server/package.json
"dev": "export NODE_ENV=development && pnpm run build && pnpm run start"
```

The dev script runs a full esbuild + node start — **no hot reload, no file watching**. Every backend edit requires a manual workflow restart or the new code is never served. This is a developer-experience problem that doesn't affect production but costs significant time during development.

**Recommendation:** Add `--watch` to the esbuild call in `build.mjs`, or use `tsx watch` for development, keeping the production start as-is.

### 8.2 Production Vite build is OOM-prone

A full `vite build` of `artifacts/blackpebble` exhausts available memory in the Replit container. The `vite-plugin-node-polyfills` (needed for `@solana/web3.js` in the browser) significantly increases bundle processing overhead.

**Current workaround:** Raise Node.js heap (`NODE_OPTIONS=--max-old-space-size=4096`) and run in the background.

**Recommendation:** Consider code-splitting the Solana wallet adapter (it's only needed on trading pages), and evaluate whether client-side wallet connection is still required (if the API handles all on-chain reads, the Solana adapter may be removable from the frontend entirely).

### 8.3 No schema migration history

`lib/db` uses `drizzle-kit push` to sync the schema to the live database. This is convenient but produces **no migration files** — there is no audit trail of when columns were added, renamed, or dropped. If the production database diverges from the schema file, there is no way to reconstruct the sequence of changes.

**Recommendation:** Switch to `drizzle-kit generate` + `drizzle-kit migrate` and commit the generated SQL migration files under `lib/db/migrations/`.

### 8.4 Orval codegen is not wired into the build pipeline

The generated files in `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` are committed to the repo. If `lib/api-spec/openapi.yaml` is updated without re-running orval, the generated code silently drifts from the spec.

**Recommendation:** Either (a) add `pnpm orval` to the `build` script in `lib/api-spec/package.json` and run it in CI, or (b) since the codegen pipeline currently covers only `/healthz`, expand the spec or remove the pipeline.

### 8.5 No test suite

There are zero test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`) anywhere in the repository. Logic like P&L calculations, TP/SL fill semantics, ATH high-water marks, and callout performance math has no automated coverage.

**Risk:** Regressions in critical trading calculations are caught only in production.

---

## 9. Deployment Concerns

### 9.1 `artifacts/data/` SQLite files may be deployed

The `artifacts/data/` directory has no `.gitignore` and the three SQLite files are tracked. If the deployment artifact includes the full workspace (which it does on Replit), these stale DB files are deployed alongside the application. The app does not use them (it reads from `DATABASE_URL` → PostgreSQL), but their presence is wasteful and potentially exposes old data.

### 9.2 Dual production-mode signals

```ts
// api-server uses both:
process.env.NODE_ENV === "production"
process.env.IS_PROD
```

Both are checked in different parts of the codebase. If one is set but not the other, code paths can diverge unexpectedly. Production deployments should set both, but this is an implicit convention with no enforcement.

### 9.3 No Helius RPC URL in production — falls back to public endpoint

`VITE_HELIUS_RPC_URL` is optional. When absent, the frontend falls back to the public Solana mainnet RPC (`clusterApiUrl("mainnet-beta")`), which has aggressive rate limits. Under any real concurrent user load this will cause `429 Too Many Requests` errors in the Solana wallet adapter.

**Recommendation:** Set `VITE_HELIUS_RPC_URL` in production deployments.

### 9.4 No graceful shutdown

The API server (`artifacts/api-server/src/index.ts`) does not handle `SIGTERM` or `SIGINT`. In-flight requests and the PumpPortal WebSocket connection are hard-killed on restart. Under rolling deployments or Replit container recycles this can drop live WebSocket subscriptions without cleanup.

**Recommendation:** Add `process.on('SIGTERM', ...)` / `process.on('SIGINT', ...)` handlers that close the HTTP server and DB pool before exiting.

### 9.5 PumpPortal WebSocket reconnect produces console noise in production

`artifacts/api-server/src/lib/pumpportal.ts` logs reconnection attempts at `warn` level. In production, if PumpPortal is unreachable, this floods the logs. There is no exponential back-off cap on reconnection attempts.

---

## 10. Suggested Folder Structure

The current structure is largely sound. The suggestions below are purely additive or organizational — no moves required for the app to function.

```
workspace/
├── artifacts/
│   ├── api-server/
│   │   └── src/
│   │       ├── lib/
│   │       │   └── (current files — no changes needed)
│   │       └── routes/
│   ├── blackpebble/
│   │   └── src/
│   │       ├── components/
│   │       │   └── ui/        ← prune unused shadcn components (see §11)
│   │       ├── pages/
│   │       └── lib/
│   ├── data/                  ← ⚠ gitignore *.db *.db-shm *.db-wal
│   └── mockup-sandbox/
├── lib/
│   ├── api-spec/              ← expand openapi.yaml or retire codegen
│   ├── api-client-react/      ← retire or expand (currently covers only healthz)
│   ├── api-zod/               ← retire or expand
│   └── db/
│       ├── src/
│       │   └── schema/
│       └── migrations/        ← ✚ add: SQL migration files (drizzle-kit generate)
├── scripts/
│   └── src/
│       ├── hello.ts           ← ⚠ delete (placeholder)
│       └── reset-paper-trading.ts
└── docs/
    └── REPO_AUDIT.md          ← this file
```

---

## 11. Suggested Cleanup Plan

All items below are **non-destructive reads/confirmation first** before any deletion. Ordered from safest/highest-value to most involved.

### Priority 1 — Safe, no code risk

| Action | Files | Effort |
|---|---|---|
| Gitignore SQLite files | Add `*.db`, `*.db-shm`, `*.db-wal` to `artifacts/data/.gitignore` | 5 min |
| Delete `scripts/src/hello.ts` | `scripts/src/hello.ts` | 2 min |
| Remove `hello` script from `scripts/package.json` | `scripts/package.json` | 2 min |
| Add startup guard for `JWT_SECRET` | `api-server/src/lib/auth.ts` or `index.ts` | 15 min |
| Add `helmet()` middleware | `api-server/src/app.ts` | 10 min |
| Restrict CORS origins | `api-server/src/app.ts` | 10 min |

### Priority 2 — Remove unused UI components + dependencies

Confirm each component file is not imported (already verified above), then:

1. Delete the 23 unused shadcn/ui wrapper files listed in §4.1
2. Remove the corresponding `package.json` dependencies:
   - `recharts`, `embla-carousel-react`, `cmdk`, `vaul`, `react-day-picker`
   - `input-otp`, `react-resizable-panels`, `sonner`
   - `react-hook-form`, `@hookform/resolvers`
   - `next-themes`, `date-fns`, `react-icons`, `@tailwindcss/typography`
   - The 14 unused Radix packages listed in §6.2
   - `@workspace/api-client-react`

This will shrink the `node_modules` install footprint and the production bundle.

> **Note:** Before removing any Radix package, confirm the component file is truly unused (`grep -r "from.*ui/${component}" src/`). The analysis above is accurate as of audit date but could be invalidated by new code.

### Priority 3 — Consolidate chart libraries

The app uses `chart.js` + `react-chartjs-2` for the P&L line chart. `recharts` is unused. Once `ui/chart.tsx` is removed (Priority 2), `recharts` can be dropped from `package.json` and from `optimizeDeps` in `vite.config.ts`.

### Priority 4 — Resolve duplicate route aliases

Decide the canonical URL for each:
- `/utilities/wallet-cleaner` → canonical (rename `sol-recovery` to redirect)
- `/utilities/journal` → canonical (remove top-level `/journal` or add redirect)

Add a 301 redirect from the old path to the canonical one so external links don't break.

### Priority 5 — API codegen pipeline: expand or retire

Two options:

**Option A — Retire the pipeline (less maintenance):**
- Remove `lib/api-spec/`, `lib/api-client-react/`, `lib/api-zod/`
- Replace `import { HealthCheckResponse } from "@workspace/api-zod"` in `health.ts` with an inline type
- Remove workspace references in `api-server/` and `blackpebble/package.json`

**Option B — Expand the pipeline (more value):**
- Extend `openapi.yaml` to cover all existing routes
- Run `orval` to regenerate the client
- Replace the hand-rolled `src/lib/api.ts` in the frontend with the generated hooks
- Wire `orval` into the build pipeline so generated files are never stale

### Priority 6 — Schema migration history

1. Run `drizzle-kit generate` once to capture current schema as the baseline SQL migration
2. Commit the `lib/db/migrations/` directory
3. Switch the `push` script to `migrate` for future schema changes

### Priority 7 — Production hardening

- Proxy the Helius RPC through the API server to hide `VITE_HELIUS_API_KEY`
- Add `express-rate-limit` on public endpoints (markets, feed, profiles)
- Add graceful shutdown handlers (`SIGTERM`/`SIGINT`) to the API server
- Set `VITE_HELIUS_RPC_URL` in the production deployment environment

---

## Summary Table

| Category | Count | Severity |
|---|---|---|
| Committed SQLite DB files | 3 files (~4.3 MB) | ⚠ High |
| Unrestricted CORS + credentials | 1 line | ⚠ High |
| Unused shadcn/ui component files | 23 files | Medium |
| Unused npm dependencies | ~15 packages | Medium |
| Unused Radix UI packages | 14 packages | Medium |
| Client-side Helius API key | 1 env var | Medium |
| Duplicate chart libraries (recharts vs chart.js) | 2 stacks | Medium |
| Dead code files | 2 files | Low |
| Duplicate route aliases | 2 pairs | Low |
| API spec coverage gap | ~60 endpoints | Low |
| No JWT_SECRET startup guard | 1 code path | Medium |
| No security headers | — | Medium |
| No rate limiting | — | Low–Medium |
| No test suite | 0 test files | High (risk) |
| No schema migration history | 0 migration files | Medium |

---

*Audit performed by static analysis only. No files were modified, moved, deleted, or deployed.*
