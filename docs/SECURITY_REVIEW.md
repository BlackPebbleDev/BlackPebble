# Security Review — BlackPebble

_Generated during Cleanup Pass V1 (June 2026)_

---

## 1. SQLite Database Files

### Files Found

| Path | Size | Git status |
|------|------|------------|
| `artifacts/data/blackpebble.db` | ~232 KB | Previously tracked |
| `artifacts/data/blackpebble.db-shm` | ~32 KB | Previously tracked |
| `artifacts/data/blackpebble.db-wal` | ~4 MB | Previously tracked |

### Assessment

These files are **stale artefacts from the pre-PostgreSQL era** of the project.
The API server (`artifacts/api-server`) connects exclusively via `DATABASE_URL` (PostgreSQL).
No code in the monorepo opens or references these SQLite files at runtime.

The `.db-wal` file is 4 MB — it likely contains historical paper-trade records from early
development. The data is not needed for production but is being retained locally for now
in case any manual reference is needed.

### Actions Taken

- Added `*.db`, `*.db-shm`, `*.db-wal`, `*.sqlite`, `*.sqlite3` to the root `.gitignore`.
- Added `artifacts/data/.gitignore` with the same patterns.
- **Files have NOT been deleted** — they remain on disk but will no longer be tracked by git
  on future commits.

### Recommended Next Action

Once the team confirms the data is not needed:
```
rm artifacts/data/blackpebble.db artifacts/data/blackpebble.db-shm artifacts/data/blackpebble.db-wal
```
Then commit the removal. There is no production risk either way since the files are unused.

---

## 2. CORS Configuration

### Before

```ts
app.use(cors({ origin: true, credentials: true }));
```

`origin: true` mirrors whatever `Origin` header the client sends, meaning **any website**
could make credentialed requests to the API on behalf of a logged-in user (CSRF-like risk).

### After

```ts
// Production: set CORS_ALLOWED_ORIGINS env var (comma-separated)
// Development: all origins allowed (CORS_ALLOWED_ORIGINS not set)
const allowedOrigins = process.env["CORS_ALLOWED_ORIGINS"]
  ? process.env["CORS_ALLOWED_ORIGINS"].split(",").map(o => o.trim())
  : null;

app.use(cors({
  origin: allowedOrigins
    ? (origin, cb) => { /* explicit allowlist */ }
    : true,
  credentials: true,
}));
```

### Deployment Action Required

Set `CORS_ALLOWED_ORIGINS` in the production deployment environment:
```
CORS_ALLOWED_ORIGINS=https://blackpebble.fun,https://blackpebble.replit.app
```
Until this is set the API behaves the same as before (open). The fix is in place but requires
the environment variable to activate in production.

---

## 3. JWT Secret Validation

### Before

`artifacts/api-server/src/lib/auth.ts`:
```ts
const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) return null; // silently no-ops
```

A missing `JWT_SECRET` in production would silently break X authentication with no startup
warning.

### After

`artifacts/api-server/src/index.ts` (startup, runs before the HTTP server binds):
```ts
if (!process.env["JWT_SECRET"]) {
  if (isProduction) {
    console.error("[FATAL] JWT_SECRET is required in production. Refusing to start.");
    process.exit(1);
  } else {
    logger.warn("JWT_SECRET is not set — X authentication is disabled.");
  }
}
```

Production deployments will now **hard-fail at boot** if `JWT_SECRET` is absent.
Development sessions log a warning but continue normally.

---

## 4. Security Headers (Helmet)

### Added

`helmet` middleware added to `app.ts` with safe defaults:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection` (legacy browsers)
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy: no-referrer`
- `Permissions-Policy`

`contentSecurityPolicy` and `crossOriginEmbedderPolicy` are disabled because:
- The API only serves JSON — CSP is enforced on the Vite frontend, not here.
- Enabling COEP here would break legitimate cross-origin responses.

---

## 5. Rate Limiting

### Added

`express-rate-limit` applied to all `/api/*` routes:
- Window: 60 seconds
- Limit: 300 requests per IP per window
- Uses `RateLimit-*` standard headers (draft-7)
- Health check endpoint (`/healthz`) is excluded — uptime monitors are never blocked.

This provides basic scraper/bot protection while being permissive enough not to affect
normal users (even mobile).

---

## 6. Remaining Risks (Not Addressed in V1)

| Risk | Severity | Notes |
|------|----------|-------|
| `VITE_HELIUS_API_KEY` in client bundle | Medium | Exposed in DevTools. Helius keys can be domain-restricted in the Helius dashboard — recommended mitigation. |
| No per-user rate limiting | Low | Current limiter is per-IP only. Authenticated endpoints do not have per-account limits. |
| No CSRF tokens | Low | Mitigated by the SameSite=Strict or Lax cookie attribute on the session cookie — verify this is set. |
| No input validation library | Low | Routes do ad-hoc validation. A schema validation library (e.g. zod) would reduce risk of malformed inputs. |
| SQLite files on disk | Info | Not used, not a risk in production. Clean up locally when convenient. |
