# BlackPebble Academy Architecture

This document describes the Academy content architecture, routing, search
integration, SEO generation, the interactive-module registry, the content
model, and the seams reserved for future progress / CMS work. It also contains
an authoring guide for adding content.

The Academy is a **static, typed content registry** rendered by a client SPA.
There is **no Academy database table and no CMS** in this release. All content
lives in TypeScript so it is type-checked, tree-shakeable, code-split, and
serializable — which keeps a future migration to an API/DB seam cheap.

---

## 1. Directory map

```
src/lib/education/
  types.ts             Content model (AcademyLesson, AcademyCategory, sections, callouts, sources, chain modules, quiz seam)
  chains.ts            Central multichain registry + chain scope + address detection
  classification.ts    Derives LessonKind (glossary / standard / flagship / feature-guide / safety / chain-specific)
  normalize.ts         Legacy + enhanced lesson -> unified NormalizedLesson view model
  category-meta.ts     Per-category description + experience level (merged in registry)
  registry.ts          Aggregates categories/lessons; lookups; slugs; normalized accessors; substring search
  routes.ts            Academy URL construction (single source of truth)
  search.ts            Global-search integration: intent classification, query expansion, ranking
  structured-data.ts   JSON-LD (DefinedTerm / TechArticle + BreadcrumbList)
  use-academy-meta.ts  React hook that sets per-page <title>/meta/canonical/OG/Twitter/JSON-LD
  build-export.ts      Node-only re-export surface consumed by the prerender script
  interactive/
    pnl-math.ts        Pure, tested PnL math for the flagship simulator
  categories/*.ts      The lesson content, one file per category

src/components/education/
  academy-category.tsx        Category accordion (semantic <h2>, ARIA, reduced-motion)
  lesson-accordion.tsx        Lesson accordion row (semantic <h3>, ARIA)
  lesson-body.tsx             Renders normalized sections/callouts (skips empty)
  lesson-page.tsx             Reusable dedicated lesson-page layout
  lesson-card.tsx             Compact tappable lesson card
  lesson-meta.tsx             Difficulty / time / chain-scope / kind badges
  category-icon.tsx           Shared category glyph map
  interactive/
    registry.tsx              InteractiveModuleId -> lazy component (safe id, no code in data)
    pnl-simulator.tsx         Flagship interactive PnL module

src/pages/
  learn.tsx            Academy homepage (hero, search, paths, featured, browse, safety, accordion fallback) + legacy hash redirects
  learn-category.tsx   Category page
  learn-lesson.tsx     Lesson page

scripts/prerender-academy.mjs   Build-time crawlable HTML + sitemap generation
```

---

## 2. Content model (`types.ts`)

`AcademyLesson` keeps the **legacy contract** (`slug`, `title`, `what`, `why`)
required so all existing lessons keep rendering unchanged. Everything else is
**optional and additive**:

- Presentation: `shortAnswer`, `summary`, `difficulty`, `estimatedMinutes`,
  `learningObjectives`, `prerequisites`, `kind`, `status`, `updatedAt`, `version`
- Structured content: `sections[]` (ordered `LessonSection` blocks with an
  `advanced` flag for progressive disclosure), `examples[]`, `callouts[]`
  (multiple, typed), `commonMistakes[]`
- Graph: `relatedLessonSlugs[]`, `relatedFeatures[]` (multiple BlackPebble tools)
- Trust: `sources[]` (only rendered when present — never empty containers)
- Multichain: `chainScope`, `chainModules[]`
- Interactive: `interactiveModule` (typed id only)
- Seams: `quiz`, `seo` overrides

When `sections`/`callouts`/`examples`/`relatedFeatures` are present they
supersede the legacy `what`/`why`/`callout`/`example`/`related` fields. The
normalization layer merges both shapes.

**Rule:** content data is plain serializable data only. No React nodes, no
executable component code. Interactive UI is referenced by a typed id.

---

## 3. Normalization (`normalize.ts`)

`normalizeLesson(lesson, category, resolve)` produces a `NormalizedLesson`, the
single structure consumed by the lesson page, search, and SEO generation. It:

- builds `sections[]` from enhanced `sections` **or** legacy `what`/`why`/
  `shortAnswer`, **dropping empty bodies** (this is what stops the 30 slang
  lessons from rendering an empty "Why it matters" section);
- merges enhanced + legacy callouts and examples;
- resolves `relatedLessonSlugs` / `prerequisites` to `{slug,title,categoryId}`
  via the `resolve` callback (unresolved refs are dropped and caught by tests);
- derives an SEO `title`/`description` (description cut on a word boundary at
  ~158 chars) with per-lesson `seo` overrides taking precedence.

---

## 4. Multichain design (`chains.ts`)

`CHAINS` is the **only** place chain metadata lives (`chainId`, `key`,
`displayName`, `shortName`, `ecosystem`, `nativeAsset`, `icon`, `explorer`,
`addressType`, `enabled`, `academySupport`). Solana is `enabled: true`; all EVM
chains + Bitcoin are registered but `enabled: false` / `academySupport: false`
so the UI **never falsely advertises unsupported chains**.

- `ChainScope` (`universal | multichain | solana | evm | chain-comparison`)
  tags each lesson; it drives a descriptive badge only, never a good/bad signal.
- Chain-neutral concepts (PnL, risk-reward, position sizing, market cap) are
  `universal`. Multichain lessons (e.g. `network-fees`) carry a neutral core
  plus optional `chainModules[]`.
- Address detection (`isEvmAddress`, `isSolanaAddress`, `detectAddressChains`,
  `looksLikeAddress`) is shape-based and chain-aware, so search does not blindly
  treat every long string as a Solana mint.

**Adding a chain** = add one entry to `CHAINS` (and content modules where
wanted). No lesson component changes required.

---

## 5. Routing (`routes.ts`, `App.tsx`)

```
/learn                              Academy homepage           -> pages/learn.tsx
/learn/:category                    Category page              -> pages/learn-category.tsx
/learn/:category/:lesson            Lesson page                -> pages/learn-lesson.tsx
```

Routes are registered most-specific first and are **lazy-loaded**
(`React.lazy`) so Academy content stays out of the initial bundle. All URLs are
built through `routes.ts` helpers — never string-concatenated in components.

Behavior:

- **Legacy hash compatibility:** `learn.tsx` resolves `/learn#<lesson-slug>` to
  the lesson route and `/learn#<category-id>` to the category route with
  `navigate(..., { replace: true })`.
- Unknown category/lesson slugs render a proper not-found state.
- A category/lesson **mismatch** is detected (a lesson under the wrong category
  slug does not silently render).
- All routes work for guests; no auth is required to learn.

---

## 6. SEO & prerendering (`use-academy-meta.ts`, `structured-data.ts`, `scripts/prerender-academy.mjs`)

Two layers:

1. **Client meta hook** (`use-academy-meta.ts`) sets per-page `<title>`,
   description, canonical, Open Graph, Twitter, and JSON-LD for SPA navigation.
   `route-meta.tsx` defers Academy detail pages to this hook (setting only the
   canonical) so it does not clobber richer per-lesson metadata.
2. **Build-time prerender** (`scripts/prerender-academy.mjs`, runs after
   `prerender.mjs` in `pnpm build`). It bundles `build-export.ts` with esbuild
   (a transitive Vite dependency) and, for each published lesson/category,
   writes `dist/public/learn/<category>[/<lesson>]/index.html` containing:
   - per-page `<title>`, meta description, canonical, OG/Twitter;
   - JSON-LD (`DefinedTerm` for glossary, `TechArticle` otherwise, plus
     `BreadcrumbList`);
   - **real crawlable text** injected in place of the SEO fallback block, so
     search engines see the lesson content in the initial HTML.
   It also appends every category + lesson URL to `dist/public/sitemap.xml`.

Sitemap entries are **generated from the registry** (no hand-maintained URL
list). The current build emits 12 category + 139 lesson pages (151 sitemap
URLs). `content-validation.test.ts` guards slug/canonical uniqueness, resolvable
references, valid routes, and metadata for flagship lessons.

Content is generated from the **same registry the app renders**, so prerendered
HTML cannot drift from the live content.

---

## 7. Global search integration (`search.ts`, `token-search.tsx`)

The global search is a first-class multi-type search. `searchLessons(query)`
returns a typed `LEARN` group alongside Tokens / Traders / Utilities / Pages.

- A precomputed `LESSON_DOCS` index is built once at module load (not rebuilt
  per keystroke).
- `classifyIntent(query)` returns a deterministic `SearchIntent`:
  - `@handle` -> `handle` (traders)
  - `$TICKER` -> `ticker` (favor tokens)
  - supported address/mint shape -> `address` (favor tokens/wallets)
  - natural-language question -> `question` (favor lessons)
  - otherwise -> `term` (ambiguous: show **both** Learn and Token groups)
- `expandQuery` applies equivalence groups (PnL/P&L, SL/stop loss, MC/market
  cap, CA/contract, FDV, ATH, RR/risk-reward) so shorthands match canonical
  concepts.
- Ranking is deterministic (exact title > alias > prefix > substring, with a
  boost for flagship lessons). No opaque AI ranking.
- The overlay shows a helpful empty state instead of silently closing.

---

## 8. Interactive-module registry (`interactive/registry.tsx`)

Content refers to an interactive module by a typed `InteractiveModuleId`. The
registry maps that id to a **lazily-loaded** component, so heavy interactive UI
never ships in the initial bundle. `hasInteractiveModule(id)` narrows the type;
`<InteractiveModule id=... />` renders it inside `Suspense`.

The flagship `pnl-simulator` uses pure math in `interactive/pnl-math.ts`
(realized/unrealized/combined PnL, percentage return, remaining cost basis,
fees, partial exits, slippage) with decimal-safe handling and full validation
of zero/invalid inputs. Adding a future module (slippage, liquidity-pool,
market-cap/FDV, etc.) = add one `InteractiveModuleId` + one registry entry.

---

## 9. Analytics

Academy events are added to the existing analytics pipeline (no new provider):
`academy_viewed`, `academy_search_performed`, `academy_search_zero_results`,
`academy_category_viewed`, `academy_lesson_viewed`,
`academy_related_lesson_clicked`, `academy_related_feature_clicked`,
`academy_interactive_started`, `academy_interactive_completed`,
`academy_practice_started`, `academy_share_clicked`. Frontend helpers live in
`src/lib/analytics.ts`; the backend allowlist is `api-server/src/routes/analytics.ts`.
Only non-sensitive fields (lesson slug, category id, result counts, result type,
source surface, chain scope) are sent. No form inputs are collected.

---

## 10. Future seams (progress / quiz / CMS)

- `LessonQuiz` / `LessonQuizQuestion` types exist as a **seam** and are not yet
  rendered. No fake quiz UI is exposed and no unused DB tables are created.
- Content is fully serializable and read through registry accessors that return
  the normalized model. A future API/DB can implement the same accessor
  contract so the UI need not change. This is the documented migration boundary.
- A progress system can attach to `academy_lesson_viewed` /
  `academy_interactive_completed` events and the normalized lesson graph without
  coupling lesson rendering to a database.

---

## 11. Testing

`vitest`. Suites: `pnl-math.test.ts`, `chains.test.ts`, `routes.test.ts`,
`normalize.test.ts`, `search.test.ts`, `registry.test.ts`,
`content-validation.test.ts`. They cover PnL math, address detection, route/
canonical construction, normalization (including empty-section dropping and the
flagship lesson), search intent/ranking/ambiguity, and registry integrity
(unique slugs/canonicals, resolvable references, valid routes/chains/interactive
ids, flagship metadata).

---

## Authoring guide

All content lives in `src/lib/education/categories/<category>.ts`. Lessons use
the `L(...)` factory in `helpers.ts`.

**Add a glossary term** (minimal): give `slug`, `title`, `what`; optionally
`aliases`/`keywords`. Leave `why` empty — the empty section will not render, and
classification treats a glossary-category lesson as `kind: "glossary"`.

**Add a standard lesson:** provide `shortAnswer` (one-sentence answer shown
first), `sections` (ordered blocks; mark deep ones `advanced: true`),
`difficulty`, `estimatedMinutes`, and at least one `example`.

**Add a chain-specific module:** set `chainScope: "multichain"` and add entries
to `chainModules` using a `ChainKey` from `chains.ts`. Do not duplicate chain
metadata in the lesson.

**Link a related lesson:** add the target `slug` to `relatedLessonSlugs`. It
must resolve to a real lesson (validated by tests).

**Link a related feature:** add `{ label, path }` to `relatedFeatures`. `path`
must be a real app route (validated against the known-routes set).

**Add a source:** add `{ label, url?, note? }` to `sources`. Only include real
citations; empty source arrays render nothing.

**Add an interactive module:** set `interactiveModule` to a registered
`InteractiveModuleId`, and register the component in
`components/education/interactive/registry.tsx`.

**Metadata / aliases:** set `aliases`/`keywords` to improve search recall;
`kind`/`status`/`updatedAt`/`version` are optional (kind is derived when unset).

After editing content run `pnpm typecheck && pnpm test` — the content-validation
suite will fail on duplicate slugs, unresolved references, invalid routes/chains,
or missing flagship metadata.
