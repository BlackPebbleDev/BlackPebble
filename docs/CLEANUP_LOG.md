# Cleanup Log — BlackPebble Safe Cleanup Pass V1

_Performed June 2026 on branch `repo-cleanup-safe-v1`_

---

## Phase 1 — Security Hardening

### 1.1 SQLite Gitignore

**Files changed:** `.gitignore`, `artifacts/data/.gitignore` (new)

Added patterns `*.db`, `*.db-shm`, `*.db-wal`, `*.sqlite`, `*.sqlite3` to prevent
stale SQLite development artefacts from being committed in future.
The three existing files (`blackpebble.db`, `.db-shm`, `.db-wal`) were **not deleted**
— they are retained on disk for reference. See `docs/SECURITY_REVIEW.md §1` for details.

---

### 1.2 CORS Restriction

**Files changed:** `artifacts/api-server/src/app.ts`

Replaced `cors({ origin: true, credentials: true })` with an environment-variable-driven
allowlist. When `CORS_ALLOWED_ORIGINS` is set (production), only those origins are permitted.
When unset (development), all origins are allowed — matching prior behaviour.

**Deployment action required:** set `CORS_ALLOWED_ORIGINS=https://blackpebble.fun,...` in the
production environment secrets.

---

### 1.3 JWT Secret Startup Guard

**Files changed:** `artifacts/api-server/src/index.ts`

Added a boot-time check before the HTTP server binds. Missing `JWT_SECRET` in production
causes `process.exit(1)` with a clear error message. In development, a `logger.warn` is
emitted and the server continues (useful for local runs without X auth configured).

---

### 1.4 Helmet Security Headers

**Files changed:** `artifacts/api-server/src/app.ts`
**Packages added:** `helmet` (api-server)

Added `helmet()` middleware with `contentSecurityPolicy: false` and
`crossOriginEmbedderPolicy: false`. The API serves JSON only; CSP belongs on the frontend.

---

### 1.5 Rate Limiting

**Files changed:** `artifacts/api-server/src/app.ts`
**Packages added:** `express-rate-limit` (api-server)

300 req/min/IP on all `/api/*` routes. Health-check excluded. Standard headers enabled.

---

## Phase 2 — Dead Weight Removal

### 2.1 Placeholder Script Deleted

**File deleted:** `scripts/src/hello.ts`
**Files changed:** `scripts/package.json` (removed `hello` script entry)

`hello.ts` was a single-line `console.log("Hello World!")` placeholder with no callers.

---

### 2.2 Unused npm Packages Removed

**Files changed:** `artifacts/blackpebble/package.json`

Removed 14 devDependencies with **zero imports** anywhere in `src/` outside the now-deleted
wrapper files:

| Package | Why removed |
|---------|-------------|
| `recharts` | Only in deleted `ui/chart.tsx` |
| `embla-carousel-react` | Only in deleted `ui/carousel.tsx` |
| `cmdk` | Only in deleted `ui/command.tsx` |
| `vaul` | Only in deleted `ui/drawer.tsx` |
| `react-day-picker` | Only in deleted `ui/calendar.tsx` |
| `input-otp` | Only in deleted `ui/input-otp.tsx` |
| `react-resizable-panels` | Only in deleted `ui/resizable.tsx` |
| `sonner` | Only in deleted `ui/sonner.tsx` |
| `react-hook-form` | Only in deleted `ui/form.tsx` |
| `@hookform/resolvers` | Only in deleted `ui/form.tsx` |
| `next-themes` | Zero imports anywhere |
| `date-fns` | Zero imports anywhere |
| `react-icons` | Zero imports anywhere |
| `@tailwindcss/typography` | Zero prose/typography usage |

Verification method: `grep -rn "<package>" src/ --include="*.ts" --include="*.tsx" | grep -v "src/components/ui/"` returned empty for every package above.

---

### 2.3 Orphaned shadcn/ui Component Files Deleted

**Files deleted** from `artifacts/blackpebble/src/components/ui/`:

| File | Imported by app? | Package dependency |
|------|-----------------|-------------------|
| `chart.tsx` | No | `recharts` |
| `carousel.tsx` | No | `embla-carousel-react` |
| `calendar.tsx` | No | `react-day-picker` |
| `command.tsx` | No | `cmdk` |
| `drawer.tsx` | No | `vaul` |
| `form.tsx` | No | `react-hook-form`, `@hookform/resolvers` |
| `input-otp.tsx` | No | `input-otp` |
| `resizable.tsx` | No | `react-resizable-panels` |
| `sonner.tsx` | No | `sonner` |

All 9 files had zero imports from any file outside `src/components/ui/`. Deleting them was
required to keep TypeScript clean after removing their package dependencies.

---

### 2.4 Tailwind Typography CSS Import Removed

**Files changed:** `artifacts/blackpebble/src/index.css`

`@plugin "@tailwindcss/typography"` was the CSS-layer import for `@tailwindcss/typography`.
After removing the npm package, Vite threw a 500 on the dev server. The `@plugin` line was
removed from `index.css` to match. No `prose` class is used anywhere in the app.

---

### What Was NOT Removed

The following items from `REPO_AUDIT.md` were deliberately left in place:

| Item | Reason |
|------|--------|
| Remaining 14 shadcn/ui wrappers (`accordion`, `badge`, `button`, etc.) | Used by the app or low-risk to keep; did not meet "confirmed zero imports" bar |
| `@workspace/api-client-react` in blackpebble package.json | Package is installed but removing requires verifying the orval codegen pipeline does not reference it indirectly |
| Radix UI transitive deps | Only safe to remove after the wrapper files that depend on them are confirmed unused at pnpm resolution time |
| SQLite files themselves | Retained on disk pending team confirmation |
| `scripts/src/reset-paper-trading.ts` | Active utility script; not dead code |

---

## Phase 3 — Documentation

| File | Status |
|------|--------|
| `docs/REPO_AUDIT.md` | Created (535 lines) — full static audit |
| `docs/SECURITY_REVIEW.md` | Created — findings + actions taken |
| `docs/CLEANUP_LOG.md` | This file |

---

## Phase 4 — Verification

| Check | Result |
|-------|--------|
| `pnpm --filter @workspace/api-server run typecheck` | ✅ Exit 0 |
| `pnpm --filter @workspace/blackpebble run typecheck` | ✅ Exit 0 |
| `pnpm install` | ✅ Completed (peer warnings pre-existed) |
| api-server workflow restart | ✅ Running |

---

## Summary

| Category | Count |
|----------|-------|
| Security fixes applied | 5 (CORS, JWT guard, helmet, rate limit, gitignore) |
| Packages removed (blackpebble) | 14 |
| Packages added (api-server) | 2 (helmet, express-rate-limit) |
| Component files deleted | 9 |
| Placeholder scripts deleted | 1 |
| Documentation files created | 3 |
| Typecheck failures introduced | 0 |

---

## Risks Remaining Before Merging

1. **CORS still open until env var is set** — `CORS_ALLOWED_ORIGINS` must be added to the
   production deployment secrets before this hardening takes effect.
2. **`VITE_HELIUS_API_KEY` is client-visible** — restrict by domain in the Helius dashboard.
3. **SQLite files on disk** — not a production risk; clean up locally when confirmed safe.
4. **No test suite** — all verification was manual + typecheck. No automated UI tests exist.
