---
name: Universal search user lookup gating
description: Why the search bar only resolves users for explicit @handle queries.
---

The universal search dropdown (token-search.tsx, Tokens/Users/Utilities/Pages groups)
resolves a user via `api.profiles.get(handle)` ONLY when the query starts with "@".

**Why:** `api.profiles.get` is an EXACT lookup (`/api/profiles/:id`), not a fuzzy
search — it returns 404 when nothing matches. Firing it on every handle-shaped
keystroke ("portfolio", "leaderboard", "bonk", etc.) 404-spams the server and the
browser console (network 404s can't be swallowed by try/catch). A UI test failed
purely on that console noise.

**How to apply:** Keep the `@`-prefix gate unless/until a real fuzzy user-search
endpoint exists. If you add one, you can drop the `@` requirement. Pages/Utilities
are matched fully client-side from static registries (PAGES/UTILITIES) — no network.
Token search stays on `api.search` and must never be broken by search changes.
