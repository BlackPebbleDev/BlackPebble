# BlackPebble — Staging Deployment Guide

Purpose: stand up a **public staging environment** (frontend + API + Postgres)
so BlackPebble can be submitted for **TradingView Advanced Charts** review.

> Scope: deployment readiness only. This guide does **not** install the
> TradingView charting library (that happens after approval) and keeps
> `VITE_TV_CHARTS=0` so the token page uses the interim chart until the real
> Advanced Charts library is approved and installed.

---

## Architecture

BlackPebble is a pnpm monorepo with two deployable apps:

| App | Path | Runtime | Host |
|---|---|---|---|
| **Frontend** | `artifacts/blackpebble` | Vite SPA (static) | **Vercel** |
| **API** | `artifacts/api-server` | Node/Express | **Render** (or Railway) |
| **Database** | `lib/db` (Drizzle schema) | PostgreSQL | **Neon** / Render / Supabase |

The frontend calls the API at the **relative path `/api`**. In production the
Vercel rewrite in `vercel.json` forwards `/api/*` to the API host, so the
browser only ever talks to the Vercel origin (no CORS complexity for same-site
requests, though the API also honors `CORS_ALLOWED_ORIGINS`).

```
Browser ── https://staging.blackpebble.fun/api/... ──▶ Vercel rewrite ──▶ https://<api-host>/api/...
Browser ── https://staging.blackpebble.fun/         ──▶ Vercel static (Vite SPA)
```

---

## Key build facts (verified against the repo)

- Package manager: **pnpm** (workspace enforces it; `preinstall` rejects npm/yarn).
- Node: use **20 or 22 LTS** on both hosts.
- **API build:** `pnpm --filter @workspace/api-server build` → esbuild bundle at
  `artifacts/api-server/dist/index.mjs`.
- **API start:** `pnpm --filter @workspace/api-server start`
  (runs `node ./dist/index.mjs`; `PORT` is **required** or it refuses to boot).
- **API health check:** `GET /api/healthz`.
- **Frontend build:** `pnpm --filter @workspace/blackpebble build`
  (Vite build + prerender) → static output at
  `artifacts/blackpebble/dist/public`.
- **DB schema:** applied with Drizzle **push** (schema sync, no migration files):
  `pnpm --filter @workspace/db push`.

### Boot requirements (the API refuses to start without these)

These are enforced in code and will crash-loop a deploy if missing:

- **`DATABASE_URL`** — the DB module (`lib/db`) throws at import time if unset.
- **`PORT`** — `index.ts` throws if unset (Render/Railway inject it automatically).
- **`JWT_SECRET`** — hard-exits when `NODE_ENV=production` and it's unset.

CORS in production: origins come from `CORS_ALLOWED_ORIGINS` + `FRONTEND_URL`.
If **both** are unset it silently allows all origins (not a boot failure). With
the Vercel `/api` rewrite, browser→API calls are same-origin, so this rarely
bites — but set both for correctness.

### Database SSL (Neon)

Neon requires TLS. Keep the query params Neon gives you on the connection
string:

```
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/blackpebble?sslmode=require&channel_binding=require
```

`pg` honors `sslmode=require`, and Neon uses publicly-trusted certificates, so
**no code change or extra `ssl` config is needed**. Use the **pooled** host
(`-pooler`) for the running API; the **direct** host is only needed for
`drizzle-kit push`. If you ever switch to a provider with self-signed certs
(e.g. Render's own Postgres), you'd need `?sslmode=no-verify` instead — Neon
does not require that.

---

## Step 1 — Provision PostgreSQL

Pick one managed Postgres and copy its connection string.

- **Neon** (recommended for staging — free, instant): create a project, copy the
  `postgresql://...` pooled connection string.
- Render Postgres or Supabase also work.

You will use this value as `DATABASE_URL` everywhere.

### Apply the schema

From your machine (simplest for a one-time staging setup), with the staging
`DATABASE_URL` exported in your shell:

```bash
# PowerShell
$env:DATABASE_URL="postgresql://...neon.../blackpebble"
pnpm --filter @workspace/db push
```

`drizzle-kit push` syncs the schema directly to the database. Re-run it whenever
the schema changes.

---

## Step 2 — Deploy the API (Render)

1. **New → Web Service**, connect the GitHub repo.
2. Configure:
   - **Root Directory:** *(leave blank — repo root; the build filters the workspace)*
   - **Runtime:** Node
   - **Build Command:**
     ```
     pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server build
     ```
     > Do **not** install pnpm in the build command on Render. Its Node 24 image
     > has a **read-only `/usr/lib/node_modules` and `/usr/bin`**, so both
     > `corepack enable` and `npm install -g pnpm` fail with `EROFS`. Render
     > auto-provisions pnpm from the root `packageManager` field
     > (`pnpm@10.34.4`), so just call `pnpm` directly. If `pnpm` is somehow not
     > on PATH, fall back to `corepack pnpm install ...` with
     > `COREPACK_HOME=$HOME/.corepack` set as an env var (writable location).
   - **Start Command:**
     ```
     pnpm --filter @workspace/api-server start
     ```
   - **Health Check Path:** `/api/healthz`
3. Add environment variables (see the checklist below — **API** column).
4. Deploy. When live, verify:
   - `https://<api-host>/api/healthz` → `200`
   - `https://<api-host>/api/markets/sol-price` → JSON `{ "solUsd": ... }`

> Render free instances sleep when idle; the first request after idle is slow.
> Acceptable for review. Upgrade to a paid instance for smoother daily use.

**Railway alternative:** create a service from the repo, set the same build/start
commands and env vars, and expose the web port. Railway auto-provides `PORT`.

---

## Step 3 — Deploy the Frontend (Vercel)

1. **Add New → Project**, import the GitHub repo.
2. Vercel reads `vercel.json` at the repo root. Confirm the detected settings:
   - **Framework Preset:** Vite
   - **Build Command:** `pnpm --filter @workspace/blackpebble build` (from `vercel.json`)
   - **Output Directory:** `artifacts/blackpebble/dist/public` (from `vercel.json`)
   - **Install Command:** `pnpm install --frozen-lockfile` (from `vercel.json`)
3. **Edit `vercel.json`** and replace the rewrite destination host with your real
   API host from Step 2:
   ```json
   "destination": "https://<your-api-host>.onrender.com/api/:path*"
   ```
   Commit that change (the placeholder `REPLACE-WITH-YOUR-API-HOST` must be
   replaced or `/api` calls will fail).

   > The second rewrite (`/(.*) → /index.html`) is the SPA fallback so deep
   > links (`/u/:handle`, `/position/:mint`) don't 404. Order matters: `/api`
   > is matched first, everything else falls through to the SPA. Vercel serves
   > real static files (including the prerendered `/markets/index.html` etc.)
   > **before** applying rewrites, so SEO pages are preserved.
4. Add environment variables (see checklist — **Frontend (Vercel)** column).
   Keep **`VITE_TV_CHARTS=0`**.
5. Deploy. When live, verify:
   - `https://<vercel-url>/` loads the app
   - `https://<vercel-url>/api/markets/sol-price` returns JSON (proves the
     rewrite reaches the API)

### Custom domain (optional, for `staging.blackpebble.fun`)

- In Vercel → Project → **Domains**, add `staging.blackpebble.fun`.
- Add the CNAME record Vercel shows at your DNS provider.
- After it resolves, update the API's `FRONTEND_URL` and
  `CORS_ALLOWED_ORIGINS` to the custom domain and redeploy the API.

---

## Environment variable checklist

Never commit real values. `.env` is gitignored; `.env.example` is the template.

### API (Render/Railway)

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | ✅ | `production` |
| `PORT` | ✅ | Render sets this automatically; if not, set `8080`. Boot fails without it. |
| `DATABASE_URL` | ✅ | Postgres string from Step 1 |
| `JWT_SECRET` | ✅ | Long random string. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `FRONTEND_URL` | ✅ | Your Vercel/staging origin, e.g. `https://staging.blackpebble.fun` |
| `CORS_ALLOWED_ORIGINS` | ✅ | Same origin(s), comma-separated |
| `HELIUS_API_KEY` | ▲ | Needed for pinned on-chain supply (accurate MC candles) |
| `BIRDEYE_API_KEY` | ○ | Optional sparkline history |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | ○ | Optional; enables X login |
| `ADMIN_X_USER_IDS` | ○ | Optional; admin access |
| `LOG_LEVEL` | ○ | `info` recommended in prod |

### Frontend (Vercel)

| Variable | Required | Notes |
|---|---|---|
| `VITE_TV_CHARTS` | ✅ | **`0`** for now (interim chart). Set to `1` only after the Advanced Charts library is approved + installed. |
| `VITE_HELIUS_API_KEY` | ▲ | Client Helius key; restrict it by domain in the Helius dashboard |
| `VITE_HELIUS_RPC_URL` | ○ | Optional RPC override for the wallet adapter |

Legend: ✅ required · ▲ strongly recommended · ○ optional

---

## Staging verification checklist

Run through this once both apps are live. This confirms **deployment**
readiness (not chart look — the real chart comes after library install).

**API**
- [ ] `GET /api/healthz` → 200
- [ ] `GET /api/markets/sol-price` → `{ solUsd: number }`
- [ ] `GET /api/markets/trending` → JSON list
- [ ] Logs show `Server listening` with the expected port

**Frontend**
- [ ] Home page loads over HTTPS
- [ ] `GET /api/markets/sol-price` **through the Vercel domain** returns JSON
      (rewrite works)
- [ ] Navigating to `/markets` lists tokens
- [ ] Opening a migrated token (`/?token=<mint>`) shows the token page with a
      chart (interim chart is expected while `VITE_TV_CHARTS=0`)
- [ ] No CORS errors in the browser console
- [ ] Datafeed endpoint responds (open in a new tab):
      `/api/markets/<mint>/candles/range?resolution=15m&countBack=120`
      → `{ candles: [...], noData: false }`
- [ ] Market-cap mode data is consistent: compare the last candle's close from
      `...&marketCap=1` against the token header MC (should agree closely)

**Security**
- [ ] No secrets committed (`.env` not in git; only `.env.example`)
- [ ] `charting_library/` and `datafeeds/` are absent from the repo (gitignored)
- [ ] `VITE_TV_CHARTS` is `0` in Vercel

Once all boxes pass, staging is ready to submit for TradingView Advanced Charts
review. Save your review URL: `https://<staging>/?token=<migrated-mint>`.

---

## What happens after approval (not part of this step)

1. Accept the GitHub invite to the private `charting_library` repo.
2. Install it into `artifacts/blackpebble/public/charting_library/` at build
   time (git-ignored; do **not** commit it — the license forbids public repos).
3. Set `VITE_TV_CHARTS=1` on staging and redeploy.
4. Review the real Advanced Charts terminal against the acceptance checklist in
   `docs/CHART_INTELLIGENCE_PLAN.md`.

No Phase 2–4 chart overlays until the base chart is approved.

---

## Appendix — TradingView Advanced Charts application (ready to paste)

Submit at <https://www.tradingview.com/advanced-charts/> → "Get the library".
Live staging URL: <https://blackpebble-staging.vercel.app>
Review token page: <https://blackpebble-staging.vercel.app/?token=5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2>
Only fill fields the form actually asks for; this covers the common ones.

> **Two-stage process — do not conflate them:**
>
> 1. **Access application (now):** the staging URL only needs to prove
>    BlackPebble is a real, public company web project. At this stage the token
>    page shows the **temporary fallback chart** (`VITE_TV_CHARTS=0`). That is
>    expected and fine for the application — it is **not** the chart being
>    reviewed and must not be described as the final Advanced Charts integration.
> 2. **Final review URL (later):** only submit/point to the review URL as the
>    Advanced Charts implementation **after** the approved `charting_library`
>    is installed and `VITE_TV_CHARTS=1`, so the token page renders the real
>    TradingView terminal. Never present the fallback chart as the final
>    product.

| Field | Value |
|---|---|
| Name | *(your name)* |
| Business email | *(a real inbox you monitor — not a noreply alias)* |
| Company / Organization | BlackPebble |
| Website / Product URL | `https://blackpebble-staging.vercel.app` |
| Country | *(your country)* |
| Is this a company / commercial public web project? | Yes |
| Personal / hobby / study project? | No |
| Which library? | Advanced Charts (self-hosted, free) |

**Use-case / description** (paste):

> BlackPebble is a public web platform for Solana token research and paper
> trading. We want to embed TradingView Advanced Charts on our token detail
> pages to give users professional candlestick charts with both price and
> market-cap display modes, standard timeframes, indicators, and fullscreen.
> We self-host the library and connect our own OHLCV datafeed via the Datafeed
> API — historical bars and live updates come from our backend, which serves
> candles for the token's primary Solana DEX pool. The chart sits beside our
> order panel as the core of our trading terminal UI. We are not redistributing
> the library; it will run only on our own public website. Our datafeed already
> supports price and market-cap candles with a fixed on-chain supply so values
> stay consistent across timeframes.

**Notes for the reviewer, if there's a free-text/extra field:**

> Our public web app is live at `https://blackpebble-staging.vercel.app` (an
> example token detail page: `https://blackpebble-staging.vercel.app/?token=5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2`).
> We are requesting access so we
> can install and enable the Advanced Charts library on our token pages; our
> Datafeed API integration is already built and tested against our OHLCV
> backend. Once access is granted we will self-host the library and turn the
> real TradingView chart on. Attribution: we will keep the standard TradingView
> logo visible in the chart; no removal requested.

Do **not** describe the current staging chart as an Advanced Charts
implementation — it is a temporary fallback until the library is installed.

**After approval:** accept the GitHub invite, then follow "What happens after
approval" above (install into `public/charting_library/`, set
`VITE_TV_CHARTS=1`, redeploy, review).
