# BlackPebble Academy Architecture

This document describes the Academy content architecture, routing, search
integration, SEO generation, the interactive-module registry, the content
model, and the seams reserved for future progress / CMS work. It also contains
an authoring guide for adding content.

The Academy is a **static, typed content registry** rendered by a client SPA.
There is **no Academy database table and no CMS** in this release. All content
lives in TypeScript so it is type-checked, tree-shakeable, code-split, and
serializable — which keeps a future migration to an API/DB seam cheap.

**Phase 2 (this release) adds a reusable interactive-learning engine on top of
that foundation:** a lesson-aware interactive-module contract, shared simulator
/ quiz / scenario shells, a typed analytics payload channel, a guest
`ProgressService`, a `ContentSource` boundary, and the first data-driven
learning path (Beginner Essentials). The foundation (routing, normalization,
search, SEO/prerender, chain registry) was **not** rebuilt — it was extended.

---

## 1. Directory map

```
src/lib/education/
  types.ts             Content model (AcademyLesson, AcademyCategory, sections, callouts, sources, chain modules, interactiveModules[], quiz)
  chains.ts            Central multichain registry + chain scope + address detection
  classification.ts    Derives LessonKind (glossary / standard / flagship / feature-guide / safety / chain-specific)
  normalize.ts         Legacy + enhanced lesson -> unified NormalizedLesson view model (merges legacy interactiveModule into interactiveModules[])
  category-meta.ts     Per-category description + experience level (merged in registry)
  registry.ts          Aggregates categories/lessons; lookups; slugs; normalized accessors
  content-source.ts    ContentSource seam (static impl now; documented async migration)
  learning-paths.ts    LearningPath model + Beginner Essentials + computePathCompletion (pure)
  progress.ts          ProgressService interface + LocalProgressService (guest localStorage, versioned, migration)
  use-progress.ts      useAcademyProgress() hook (useSyncExternalStore)
  routes.ts            Academy URL construction incl. learningPathPath()
  search.ts            Global-search integration: intent classification, query expansion, ranking
  structured-data.ts   JSON-LD (DefinedTerm / TechArticle + BreadcrumbList)
  use-academy-meta.ts  Per-page <title>/meta/canonical/OG/Twitter/JSON-LD (lesson, category, path)
  build-export.ts      Node-only re-export surface consumed by the prerender script
  interactive/
    ids.ts             Plain (no-React) registered module-id list for node tests/build validation
    pnl-math.ts        Pure, tested PnL math for the flagship simulator
    calc-math.ts       Pure math for market cap/FDV/liquidity/slippage/SL-TP/position size/concentration/curve
    quiz-logic.ts      Pure quiz scoring (single/multiple/boolean)
    scenario-logic.ts  Pure scenario scoring + data model
  categories/*.ts      The lesson content, one file per category

src/components/education/
  academy-category.tsx        Category accordion (normalizes lessons; semantic <h2>, ARIA)
  lesson-accordion.tsx        Lesson accordion row consuming NormalizedLesson (semantic <h3>, ARIA)
  lesson-body.tsx             NormalizedLessonBody: compact normalized preview for the accordion
  lesson-page.tsx             Dedicated lesson layout (renders interactiveModules[], quiz, complete/bookmark)
  lesson-card.tsx             Compact tappable lesson card
  lesson-meta.tsx             Difficulty / time / chain-scope / kind badges
  learn-link.tsx              Subtle contextual product->Academy affordance (tracks sourceSurface)
  interactive/
    contract.ts               InteractiveModuleProps runtime contract + event/completion types
    registry.tsx              InteractiveModuleId -> lazy component; InteractiveModuleHost (contract + analytics + progress)
    modules/*.tsx             15 interactive modules (calculators, simulators, scenario challenges)
    modules/use-module-interaction.ts  Standardizes first-interaction/completion event firing
    shared/                   SimulatorShell, QuizShell, ScenarioShell, fields, results, actions

src/pages/
  learn.tsx            Academy homepage (path banner, continue/bookmarks, search, browse) + legacy hash redirects
  learn-category.tsx   Category page
  learn-lesson.tsx     Lesson page
  learn-path.tsx       Learning-path overview (progress, resume, step sequence, final action)

scripts/prerender-academy.mjs   Build-time crawlable HTML + sitemap (categories, lessons, learning paths)
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
- Interactive: `interactiveModules[]` (array of `AcademyInteractiveModuleRef`:
  `{ id, config?, title?, description?, placement?, required?, order?,
  estimatedMinutes?, completionRule? }`). The legacy singular `interactiveModule`
  (typed id) is still accepted and normalized into the array.
- Knowledge check: `quiz` (`LessonQuiz` with `single` / `multiple` / `boolean`
  questions, `correctIndex` / `correctIndices`, required `explanation`)
- SEO: `seo` overrides

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
/learn/path/:slug                   Learning-path overview     -> pages/learn-path.tsx
/learn/:category                    Category page              -> pages/learn-category.tsx
/learn/:category/:lesson            Lesson page                -> pages/learn-lesson.tsx
```

The `path` segment is reserved and registered **before** `/learn/:category/...`
so a path URL never resolves as a category. No category id may be `path`.

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

Learning-path overview pages are prerendered the same way
(`/learn/path/<slug>/index.html`) with crawlable title/description, the outcomes
list, and the ordered lesson links, and are added to the sitemap.

Sitemap entries are **generated from the registry** (no hand-maintained URL
list). The current build emits 12 category + 142 lesson + 1 path page (155
sitemap URLs). `content-validation.test.ts` guards slug/canonical uniqueness,
resolvable references, valid routes, quiz validity, interactive-id validity, and
metadata for flagship lessons.

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

## 8. Interactive-learning engine (`interactive/`)

**Contract (`contract.ts`).** Every module receives a typed
`InteractiveModuleProps<TConfig>`: the `lesson` (NormalizedLesson), `moduleId`,
serializable `config`, `sourceSurface`, current `progress`, and callbacks
`onEvent(AcademyInteractiveEvent)` / `onComplete(result?)` / `onReset?`. Modules
never read storage or fire analytics directly — they emit lifecycle events
(`started`, `interacted`, `completed`, `practice`, `reset`).

**Registry + host (`registry.tsx`).** `MODULES` maps each `InteractiveModuleId`
to a **lazily-loaded** component (each is its own build chunk). `hasInteractiveModule`
narrows the type. `InteractiveModuleHost` resolves the component, delivers the
contract, and maps its events onto analytics (`trackAcademyInteractiveStarted`,
`...Completed`, `...PracticeStarted`) and the guest `ProgressService`
(`markInteractiveCompleted`). It wraps the module in an `ErrorBoundary` +
`Suspense`, so a broken/slow module never takes down the lesson page. A lesson
can declare **multiple** modules; the page renders them in `order`.

**Shared components (`shared/`).** `SimulatorShell` (title/description,
simple↔advanced toggle, reset, guided example, practice button, assumptions
slot, related actions, accessible live region, analytics boundary), `QuizShell`
(navigation, single/multiple/boolean, deferred feedback + explanation, retry,
score, completion event), `ScenarioShell` (decision rounds with feedback), plus
`fields.tsx` (numeric/percent/currency/range/toggle/segmented inputs),
`results.tsx` (metric/headline/note/assumptions/step-timeline), and
`actions.tsx` (related-feature CTAs). Modules compose these rather than
re-implementing chrome.

**Pure logic.** Calculations live in `interactive/calc-math.ts`,
`quiz-logic.ts`, `scenario-logic.ts`, and `pnl-math.ts` — all UI-free and
unit-tested. The flagship PnL simulator was migrated onto the engine without
changing its math.

Adding a module = pure logic file (+ tests) → component using the shared shell →
one `InteractiveModuleId` in `types.ts` → one entry in `registry.tsx` and
`ids.ts` → attach via `interactiveModules` on a lesson.

---

## 9. Progress (`progress.ts`, `use-progress.ts`)

`ProgressService` is a typed boundary; `LocalProgressService` is the guest
implementation over `localStorage` under a **versioned** key
(`bp.academy.progress`, schema v1). It tracks lessons viewed/completed,
interactives completed, quizzes completed, bookmarks, recent lessons, and
per-path progress. `migrateProgress` coerces arbitrary/corrupt parsed JSON into
a valid state (never throws), and is the single place future schema migrations
run. `getSnapshotToken()` powers `useAcademyProgress()` via
`useSyncExternalStore`. No wallet/sensitive data is ever stored.

**Completion rules are transparent:** lessons complete via an explicit "Mark
complete" button; interactives complete on meaningful interaction (emitted by
the module); quizzes complete on submission (not on a perfect score). Reading
the next lesson is never gated.

**Future account merge (documented, not built):** on sign-in, read the local
guest state, POST it to an authenticated endpoint that unions timestamps (max)
per key, then replace local state with server truth. Because only learning
markers are stored, the merge is a pure union.

---

## 10. Learning paths (`learning-paths.ts`)

A `LearningPath` is **data, not prose**: `{ id, slug, title, description,
audience, difficulty, estimatedMinutes, lessonSlugs[], requiredModuleIds[],
prerequisites?, outcomes[], chainScope, status, order, finalActionPath?,
finalActionLabel? }`. Steps reference real lesson slugs (validated by tests).
`computePathCompletion(lessonSlugs, isCompleted)` is a pure helper returning
`{ total, completed, pct, resumeIndex, isComplete }`, reused by the path page and
the homepage banner and unit-tested directly. The first path is
`beginner-essentials` (20 ordered lessons ending in a guided paper trade).

---

## 11. Content source (`content-source.ts`)

`ContentSource` is a typed boundary over content access (list categories, get
category, list published lessons, get lesson, search source data, resolve
related refs). `staticContentSource` wraps the existing synchronous registry
today. This is an **honest transitional** seam: it exposes synchronous static
access now and documents that a future API/DB adapter would introduce async
accessors (and the SPA call sites that consume them would move to the async
form). It does not pretend a synchronous interface alone solves API migration.

---

## 12. Analytics (typed payload channel)

Academy events run on the existing pipeline (no new provider) and now carry a
small **typed, non-sensitive** props object. Frontend helpers
(`src/lib/analytics.ts`) build `AnalyticsEventProps` (lesson slug, category id,
module id, result count/type, query length/intent, chain scope, source surface,
learning-path id, step id, completion type, is-guest, difficulty). The backend
(`api-server/src/lib/analytics-props.ts`) re-validates every field against an
**allowlist**: unknown keys are discarded, numbers are clamped to non-negative
integers, strings are trimmed/length-capped, total size is bounded, and the
sanitized object is stored in `props_json` (additive column, backward
compatible). Never sent: wallet data, seed phrases, raw transactions, exact
simulator inputs, or arbitrary JSON.

Events: `academy_viewed`, `academy_search_performed`,
`academy_search_zero_results`, `academy_category_viewed`,
`academy_lesson_viewed`, `academy_related_lesson_clicked`,
`academy_related_feature_clicked`, `academy_interactive_started`,
`academy_interactive_completed`, `academy_practice_started`,
`academy_share_clicked`, `academy_path_started`, `academy_path_step_viewed`,
`academy_path_completed`. Session dedup keys include identity (module id / path
id) so per-module and per-path events are not over-suppressed. Contextual
product→Academy links (`learn-link.tsx`) fire `academy_lesson_viewed` with a
product `sourceSurface` so "which surface opened the lesson" is answerable.

---

## 13. Future seams (CMS)

Content is fully serializable and read through registry accessors that return
the normalized model, behind the `ContentSource` boundary. A future API/DB/CMS
implements the same accessor contract so lesson/quiz/interactive UI need not
change. No CMS and no Academy DB tables exist in this release (the analytics
`props_json` column is the only additive DB change).

---

## 14. Testing

`vitest`. Frontend suites include `pnl-math`, `calc-math`, `quiz-logic`,
`scenario-logic`, `progress`, `learning-paths`, `chains`, `routes`, `normalize`,
`search`, `registry`, `analytics`, and `content-validation`. They cover the pure
module math (expected/zero/invalid/extreme values), quiz/scenario scoring,
guest-progress persistence + migration + corruption recovery, pure path-progress
calculation, analytics payload construction + dedup, and registry/content
integrity (unique slugs/canonicals, resolvable references, valid
routes/chains/interactive ids, unique per-lesson module refs, every registered
module attached to a lesson, quiz answer/explanation validity, and learning-path
reference/uniqueness/required-module resolution). The backend
`analytics-props.test.ts` covers allowlisting, unknown-key rejection, clamping,
and size limits.

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

**Attach interactive module(s):** add one or more refs to `interactiveModules`,
e.g. `interactiveModules: [{ id: "market-cap-calculator" }]`. Use `order` to
sequence multiple modules and `config` to pass serializable, module-specific
options. The id must be registered in both `interactive/registry.tsx` and
`interactive/ids.ts`. (The legacy singular `interactiveModule` still works and is
normalized into the array.)

**Add a quiz:** set `quiz: { id, questions: [...] }`. Each question needs
`prompt`, `options`, an `explanation`, and either `correctIndex` (single/boolean)
or `correctIndices` (multiple, `kind: "multiple"`). Use 2–5 questions on an
essential lesson, fewer for a glossary term, and none where a quiz adds nothing.
Test understanding, not trivia. Content validation checks answers are in range
and every question has a non-empty explanation.

**Add a new simulator:** (1) put the math in a pure file under
`lib/education/interactive/` with a `*.test.ts`; (2) build the component under
`components/education/interactive/modules/` using `SimulatorShell` + shared
fields/results and `useModuleInteraction` for event firing; (3) add the id to
`types.ts`, `registry.tsx`, and `ids.ts`; (4) attach it via `interactiveModules`.

**Add a decision scenario:** model rounds/options with `scenario-logic.ts`, build
the component on `ScenarioShell`, then register + attach as above. Keep any
addresses/tokens/prompts clearly **fictional** and never request real credentials.

**Add a learning path:** add a `LearningPath` to `learning-paths.ts` with ordered
`lessonSlugs` (real, published slugs), `requiredModuleIds` that are actually
attached to path lessons, `outcomes`, and a `finalActionPath` that is a real
route. Tests validate references, uniqueness, and required-module resolution.

**Chain-neutral vs chain-specific:** keep universal module logic
chain-agnostic; express chain differences via `chainModules[]` and `chainScope`.
Never advertise a chain whose registry entry is `enabled: false`.

**Metadata / aliases:** set `aliases`/`keywords` to improve search recall;
`kind`/`status`/`updatedAt`/`version` are optional (kind is derived when unset).

After editing content run `pnpm typecheck && pnpm test` — the content-validation
suite will fail on duplicate slugs, unresolved references, invalid routes/chains,
invalid interactive ids, invalid quiz answers, or missing flagship metadata.

---

## Beginner lesson authoring template

```ts
L(
  "slug",                       // unique, kebab-case
  "Title",
  "Plain-language 'what it is' (the legacy `what`).",
  "Plain-language 'why it matters' (the legacy `why`).",
  {
    aliases: ["common search phrasings"],
    keywords: ["adjacent terms"],
    shortAnswer: "One-sentence direct answer shown first.",
    difficulty: "beginner",
    estimatedMinutes: 5,
    chainScope: "universal",     // or "multichain" + chainModules[]
    interactiveModules: [{ id: "registered-module-id" }], // optional
    version: 1,
    updatedAt: "July 2026",
    learningObjectives: ["...", "...", "..."],
    sections: [
      { kind: "quick-answer", body: "..." },
      { kind: "what", body: "..." },
      { kind: "why", body: "..." },
      { kind: "common-mistakes", body: "..." },
      { kind: "advanced", advanced: true, body: "..." }, // optional
    ],
    commonMistakes: ["...", "..."],
    relatedLessonSlugs: ["cluster", "neighbours"],   // topic cluster
    relatedFeatures: [{ label: "Feature", path: "/route" }],
    quiz: {
      id: "slug-quiz",
      questions: [
        { id: "q1", prompt: "...", options: ["a", "b", "c", "d"],
          correctIndex: 1, explanation: "..." },
      ],
    },
  },
),
```

Only include sections/fields that add value — empty enhanced sections are
dropped by normalization and flagged by validation.
