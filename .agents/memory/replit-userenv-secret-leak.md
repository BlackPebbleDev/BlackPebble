---
name: .replit userenv secret leak
description: Plaintext secrets in env-var scopes get committed into .replit
---

On this project, the SAST scan's "generic secret detected" HIGH findings traced to
`[userenv.development]` / `[userenv.production]` blocks in the committed `.replit`
file containing plaintext JWT_SECRET, X_CLIENT_ID, X_CLIENT_SECRET. Those same keys
also existed as proper managed Secrets.

**Rule:** Sensitive values (API keys, client secrets, JWT signing keys) must live
only as managed Secrets, never as environment *variables* in dev/prod scopes —
because env vars are serialized as plaintext into `.replit`, which is committed.

**Why:** Anything in `.replit` is in version control, so the secret is exposed to
anyone with repo/fork access and shows up in scans.

**How to apply:** Non-secret config (FRONTEND_URL, mint address, thresholds) is fine
as env vars. For anything sensitive, request/store it as a Secret. Remediating an
already-leaked value requires the user to ROTATE it (the old value is compromised in
git history); removing it from `.replit` alone does not un-leak it. Rotating
JWT_SECRET invalidates existing sessions.
