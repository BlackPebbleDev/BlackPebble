---
name: BlackPebble SEO / crawler visibility architecture
description: How non-JS crawlers see BlackPebble (pure Vite SPA) and the single-source-of-truth for per-route SEO.
---

# BlackPebble crawler / AI / SEO visibility

BlackPebble web is a **pure Vite SPA** (`main.tsx` uses `createRoot().render()`, NOT `hydrateRoot`). It is served statically with SPA-fallback; the api-server only serves `/api`.

## Decisions / invariants

- **Static crawler content lives inside `#root`** in `index.html`. Because mount is `createRoot` (not hydration), React **replaces** `#root` children on load, so the static block is crawler-visible but never shown to JS users. Do NOT switch to `hydrateRoot` without removing/reconciling that static markup (would throw hydration mismatch). Do NOT `display:none` the block — hidden text is devalued for SEO; it relies on being replaced fast + styled with the app's dark bg so there's no FOUC.
  **Why:** crawlers (ChatGPT/Perplexity/Telegram/etc.) often don't execute JS; an empty `#root` made the platform look like "requires JavaScript".

- **Single source of truth for per-route SEO:** `artifacts/blackpebble/seo.routes.json` (path/title/description). Consumed by BOTH the build-time prerender script AND the client `RouteMeta` component. Edit titles/descriptions there only.

- **Per-route static metadata = post-build string-templating, NO headless browser** (`scripts/prerender.mjs`, wired into `build`). It clones `dist/public/index.html` and rewrites only head tags → `dist/public/<route>/index.html`. Keep it dependency-free; the full vite build already OOMs (see blackpebble-vite-build), so never add a browser-based prerender. Script has guards that abort if a template tag isn't found/replaced — keep meta tags in a shape the regexes match (`name=`/`property=`/`rel=canonical`).

- **Client `RouteMeta`** updates head on SPA navigation for JS crawlers. Canonical for dynamic/unlisted routes (e.g. `/u/:handle`) must use the **actual location**, never fall back to the home canonical (would collapse pages into home). Per-page `document.title` effects were removed so titles have one source.

- **Live vs future:** only label features that actually ship (paper trading, markets, reputation/trust, profiles/feed, leaderboards, portfolio, trade planner w/ limit+TP/SL, SOL recovery, wallet cleanup, journal). Telegram tools / community funding / pro terminal / ecosystem-rewards are roadmap — must be labeled "planned", not live, in index.html / llms.txt.
