# BlackPebble Academy — Current-State Audit (Read-Only Discovery)

> Factual snapshot of the Academy as it exists in the repository. No application
> code was modified to produce this report. All paths are relative to the repo
> root. The frontend app lives under `artifacts/blackpebble/`; the backend under
> `artifacts/api-server/`; shared DB schema under `lib/db/`.

---

## 1. Executive Summary

- **What it is:** "BlackPebble Academy" is a single, static, client-rendered
  education page at the route `/learn` (page component `src/pages/learn.tsx`,
  titled "BlackPebble Academy"). It presents categories as accordions, each
  containing lesson accordions with labelled sections (What it means / Why it
  matters / Example / Related BlackPebble feature / a single callout).
- **Storage model:** Static. All content is authored as **TypeScript objects**
  in `artifacts/blackpebble/src/lib/education/` and compiled into the frontend
  bundle. It is **not** database-driven, **not** API-driven, and not sourced from
  Markdown or JSON. It is a pure client-side, in-bundle content set.
- **Categories:** **12** (`ACADEMY_CATEGORIES` in `registry.ts`; asserted by
  `registry.test.ts`).
- **Lessons:** **138** (`ALL_ACADEMY_LESSONS`, sum of all category files).
- **Dedicated lesson pages:** **None.** There is one route (`/learn`). Lessons
  are addressable only via hash fragments (`/learn#<slug>`), not real URLs.
- **Academy search:** Yes — a dedicated, client-side, substring search over the
  in-memory lesson set (`searchAcademy` in `registry.ts`).
- **Global search includes Academy:** Only as a **single "Pages" shortcut** to
  `/learn` (in `token-search.tsx`). Global search does **not** index lesson
  titles, bodies, slugs, or aliases and cannot deep-link to a lesson.
- **Progress tracking:** Absent. (Only ephemeral open/closed accordion state in
  `sessionStorage`.)
- **Quizzes / interactive lessons:** Absent.
- **Admin editing / CMS:** Absent. Content is edited by developers in `.ts` files.
- **SEO-ready:** Partially. `/learn` is prerendered with a title/description,
  is canonical, is in `sitemap.xml`, and is crawlable — but it is **one** page.
  Individual lessons have no URLs, no per-lesson metadata, and their collapsed
  bodies are not present in the initial HTML (client-only render).
- **Overall maturity:** A polished, well-organized, **content-complete v1 static
  glossary/guide**. Visually mature and safety-conscious, but architecturally
  early: no per-lesson routing, no database, no CMS, no progress/quiz layer, no
  analytics, and single-page SEO only.

---

## 2. Architecture Diagram (Text)

```
Content authored in TypeScript objects
  artifacts/blackpebble/src/lib/education/categories/*.ts   (12 files)
        │   built with helper  lib/education/helpers.ts  ->  L(slug,title,what,why,opts)
        ▼
  lib/education/registry.ts
     ACADEMY_CATEGORIES[]  ──flatMap──▶ ALL_ACADEMY_LESSONS[]
     LESSON_BY_SLUG (Map)   CATEGORY_BY_ID (Map)
     searchAcademy(query)   getLessonBySlug()  getCategoryForLesson()
        │
        ▼
  Route  /learn   (App.tsx line 120)  ──▶  src/pages/learn.tsx  (LearnPage)
        │  state: query, openCategories(sessionStorage), activeLessonSlug(hash)
        │  searchAcademy(query) ─▶ filter visible categories + matched lessons
        ▼
  components/education/academy-category.tsx  (AcademyCategorySection, <h2>, custom accordion)
        ▼
  components/education/lesson-accordion.tsx  (LessonAccordionRow, local useState open)
        ▼
  components/education/lesson-body.tsx       (What/Why/Example/Related/Callout)
        └─ Related feature ─▶ wouter <Link href="/..."> navigates to a feature route

Reached by user:
  - Footer graduation-cap icon (app-shell.tsx, data-testid="link-footer-academy") ─▶ /learn
  - Global search "Pages" result "BlackPebble Academy" (token-search.tsx) ─▶ /learn
  (NOT in the primary nav / mobile bottom nav / desktop sidebar; NOT a Utilities card)

Persistence / backend / DB:  NONE for Academy.
Analytics:  NONE for Academy.
```

---

## 3. Route and Navigation Map

**Academy routes**

| Property | Value |
|---|---|
| Route path | `/learn` |
| Rendered component | `LearnPage` (`src/pages/learn.tsx`), registered in `src/App.tsx:120` |
| Public / auth | Public; usable as guest (no auth guard) |
| Guest accessible | Yes |
| Route params | None |
| Query params | None (search is component state only, not URL-synced) |
| Deep-link support | Hash only: `/learn#<lesson-slug>` (handled in `LearnPage` `syncHash`) |
| Metadata | Single prerendered title/description via `seo.routes.json` |
| Prerender status | Yes (shell + meta only; no lesson content in HTML) |
| Sitemap inclusion | Yes — `/learn`, priority 0.8, changefreq weekly (`public/sitemap.xml`) |
| Crawlability | Allowed (`public/robots.txt` `Allow: /`); AI crawlers explicitly welcomed |

**How users reach Academy**
- **Footer icon** only: `src/components/app-shell.tsx` (lines ~83–93), a
  graduation-cap `Link` to `/learn` with tooltip "BlackPebble Academy"
  (`data-testid="link-footer-academy"`).
- **Global search**: `src/components/token-search.tsx` `PAGES` array (line 56)
  lists "BlackPebble Academy" → `/learn` (keywords: learn, guide, tutorial,
  education, academy, help, glossary, terms).
- The graduation-cap icon is also used **decoratively** in
  `src/components/trading-desk-onboarding.tsx` (does not link to Academy) and in
  the `LearnPage` header — those are not navigation entries.

**Where Academy is NOT**
- Not in `navItems` (`app-shell.tsx:33`), which drives both the desktop sidebar
  and mobile bottom navigation (Trading Desk, Markets, Portfolio, Feed,
  Leaderboard, Utilities). So Academy is **absent from primary mobile and desktop
  navigation**.
- Not a card on the Utilities page (`src/lib/utilities-meta.ts`).

**Direct answers**
- Can someone link to a specific **category**? Only via the in-page pill anchor
  (`#<category-id>` scroll); there is no category route, but the hash element id
  exists (`<section id={category.id}>`). A shared URL like `/learn#trading-basics`
  scrolls to the category but there is no dedicated category page.
- Can someone link to a specific **lesson**? Yes, via `/learn#<lesson-slug>`
  (opens the category, expands the lesson, smooth-scrolls). This is a hash
  fragment, not a crawlable URL.
- Does opening an accordion **update the URL**? No. Category/lesson toggles do not
  push hash or history. Only inbound hash navigation is read.
- Does refreshing preserve the opened lesson? Partially. Open **categories**
  persist via `sessionStorage` (`bp-academy-open-categories`). An opened
  **lesson** is only restored if its slug is in the URL hash; a manually expanded
  lesson (no hash) is lost on refresh.

---

## 4. Relevant File Inventory

**Content (TypeScript objects) — actively used**

| Path | Purpose | Used | Key exports |
|---|---|---|---|
| `src/lib/education/types.ts` | Content model types | Yes | `AcademyLesson`, `AcademyCategory`, `LessonCallout`, `LessonRelated`, `CalloutType`, `LessonDifficulty`, `CategoryIcon` |
| `src/lib/education/helpers.ts` | Compact lesson factory | Yes | `L(slug,title,what,why,opts)` |
| `src/lib/education/registry.ts` | Aggregates categories, search, lookups | Yes | `ACADEMY_CATEGORIES`, `ALL_ACADEMY_LESSONS`, `searchAcademy`, `getLessonBySlug`, `getCategoryById`, `getCategoryForLesson`, `getAllLessonSlugs`, `getAllLessonTitles` |
| `src/lib/education/categories/start-here.ts` | Category "Start Here" (4 lessons) | Yes | `startHereCategory` |
| `src/lib/education/categories/trading-basics.ts` | "Trading Basics" (11) | Yes | `tradingBasicsCategory` |
| `src/lib/education/categories/market-data.ts` | "Market Data and Token Metrics" (8) | Yes | `marketDataCategory` |
| `src/lib/education/categories/orders-risk.ts` | "Orders, Risk, and Position Management" (8) | Yes | `ordersRiskCategory` |
| `src/lib/education/categories/solana-basics.ts` | "Solana Basics" (12) | Yes | `solanaBasicsCategory` |
| `src/lib/education/categories/wallets-safety.ts` | "Wallets and Transaction Safety" (10) | Yes | `walletsSafetyCategory` |
| `src/lib/education/categories/memecoin-markets.ts` | "Memecoin Market Dynamics" (12) | Yes | `memecoinMarketsCategory` |
| `src/lib/education/categories/scam-awareness.ts` | "Scam Awareness" (8) | Yes | `scamAwarenessCategory` |
| `src/lib/education/categories/blackpebble-features.ts` | "BlackPebble Features" (19) | Yes | `blackpebbleFeaturesCategory` |
| `src/lib/education/categories/social-reputation.ts` | "Social and Reputation" (8) | Yes | `socialReputationCategory` |
| `src/lib/education/categories/developer-campaigns.ts` | "Developer Insights and Campaigns" (8) | Yes | `developerCampaignsCategory` |
| `src/lib/education/categories/crypto-slang.ts` | "Common Crypto and Degen Slang" (30) | Yes | `cryptoSlangCategory` |

**Components (UI) — actively used**

| Path | Purpose | Used | Key exports |
|---|---|---|---|
| `src/components/education/academy-category.tsx` | Category accordion + icon map | Yes | `AcademyCategorySection` |
| `src/components/education/lesson-accordion.tsx` | Lesson accordion row | Yes | `LessonAccordionRow` |
| `src/components/education/lesson-body.tsx` | Lesson section rendering + callout | Yes | `LessonBody`, `LessonCalloutBox` |

**Page / routing / navigation**

| Path | Purpose | Used |
|---|---|---|
| `src/pages/learn.tsx` | Academy page (`LearnPage`) | Yes |
| `src/App.tsx` | Registers `/learn` route (line 120) | Yes |
| `src/components/app-shell.tsx` | Footer graduation-cap link to `/learn`; primary `navItems` (no Academy) | Yes |
| `src/components/token-search.tsx` | Global search; "BlackPebble Academy" page shortcut | Yes |

**SEO / prerender**

| Path | Purpose |
|---|---|
| `artifacts/blackpebble/seo.routes.json` | `/learn` title + description for prerender |
| `artifacts/blackpebble/scripts/prerender.mjs` | Injects per-route meta into static HTML (no React SSR) |
| `artifacts/blackpebble/public/sitemap.xml` | Includes `/learn` |
| `artifacts/blackpebble/public/robots.txt` | Allows crawling; references sitemap |
| `artifacts/blackpebble/public/llms.txt` | Lists "BlackPebble Academy" → `/learn` |

**Tests**

| Path | Purpose |
|---|---|
| `src/lib/education/registry.test.ts` | Structural + alias-search assertions (only Academy test) |

**Duplicate / abandoned / legacy implementations:** None found. There is a single,
consistent Academy implementation. No second/legacy education system exists.

---

## 5. Category Inventory

Display order per `ACADEMY_CATEGORIES` (`registry.ts`). All categories are
top-level accordions on `/learn`; none has a dedicated route. Content source =
the file in `src/lib/education/categories/`. Default expanded: only `start-here`
(`DEFAULT_OPEN` in `learn.tsx`); during an active search, all matching categories
force-open.

| # | ID | Title | Icon | Lessons | Source file |
|---|---|---|---|---|---|
| 1 | `start-here` | Start Here | `compass` | 4 | `start-here.ts` |
| 2 | `trading-basics` | Trading Basics | `trending` | 11 | `trading-basics.ts` |
| 3 | `market-data` | Market Data and Token Metrics | `bar-chart` | 8 | `market-data.ts` |
| 4 | `orders-risk` | Orders, Risk, and Position Management | `shield` | 8 | `orders-risk.ts` |
| 5 | `solana-basics` | Solana Basics | `link` | 12 | `solana-basics.ts` |
| 6 | `wallets-safety` | Wallets and Transaction Safety | `wallet` | 10 | `wallets-safety.ts` |
| 7 | `memecoin-markets` | Memecoin Market Dynamics | `rocket` | 12 | `memecoin-markets.ts` |
| 8 | `scam-awareness` | Scam Awareness | `alert` | 8 | `scam-awareness.ts` |
| 9 | `blackpebble-features` | BlackPebble Features | `sparkles` | 19 | `blackpebble-features.ts` |
| 10 | `social-reputation` | Social and Reputation | `users` | 8 | `social-reputation.ts` |
| 11 | `developer-campaigns` | Developer Insights and Campaigns | `hand-coins` | 8 | `developer-campaigns.ts` |
| 12 | `crypto-slang` | Common Crypto and Degen Slang | `message` | 30 | `crypto-slang.ts` |

- Category descriptions: **there is no category `description` field** in the data
  model. Categories render only an icon + title (`AcademyCategorySection`).
- Filtering behavior: on search, non-matching categories are hidden; matching
  categories force-open and show only matched lessons.

**Totals**

| Metric | Count | Notes |
|---|---|---|
| Categories | 12 | |
| Lessons | 138 | |
| Glossary terms | 30 | The `crypto-slang` category functions as a glossary (title + short "what", empty "why") |
| Examples (`example` field) | 6 | Only 6 lessons carry an `example` |
| Beginner Tip callouts (`type:"beginner"`) | 3 | |
| Safety Note callouts (`type:"safety"`) | 25 | |
| Callouts total | 36 | 25 safety, 5 advanced, 3 beginner, 3 why, 0 example-type |
| Related-feature links (`related`) | 46 | 3 point to a non-existent route (see §21) |
| External sources | 0 | No `sources` field exists |
| Advanced explanations (`type:"advanced"`) | 5 | |
| Interactive elements | 0 | |
| Lessons with aliases | 97 | |
| Lessons with `keywords` | 0 | field defined but unused everywhere |
| Lessons with `difficulty` | 0 | field defined but unused everywhere |

---

## 6. Lesson Inventory

Producing all 138 lesson records verbatim would duplicate the source. Below is the
**structural inventory** that is uniform across every lesson, followed by
per-lesson specifics that vary, and the exact flags requested.

**Uniform facts for every lesson (all 138):**
- Content source: the category file in `src/lib/education/categories/`.
- Slug: the first `L(...)` argument (unique across all lessons — enforced by test).
- Dedicated URL: **none**; addressable only as `/learn#<slug>`.
- Searchable: **Academy search — yes** (title/what/why/example/related-label/
  category-title/aliases). **Global search — no** (title/body not indexed).
- SEO metadata: **none per lesson** (only the single `/learn` page has meta).
- Sections present: always "What it means" (`what`) and "Why it matters" (`why`);
  "Example", "Related BlackPebble feature", and one callout appear only when the
  corresponding optional field is set.
- Tip type: at most **one** `callout` per lesson (`why|safety|example|beginner|
  advanced`); `example` type is never used.

**Per-category lesson slugs/titles** (source of truth; open each file to read the
full `what`/`why`/`example`/`related`/`callout`):

- **Start Here** (`start-here.ts`): `what-is-blackpebble` "What BlackPebble Is";
  `paper-vs-real-trading` "Paper Trading vs Real Trading"; `use-blackpebble-safely`
  "How to Use BlackPebble Safely"; `beginner-learning-path` "Beginner Learning Path".
- **Trading Basics** (11), **Market Data and Token Metrics** (8), **Orders, Risk,
  and Position Management** (8), **Solana Basics** (12), **Wallets and Transaction
  Safety** (10), **Memecoin Market Dynamics** (12), **Scam Awareness** (8),
  **BlackPebble Features** (19), **Social and Reputation** (8), **Developer
  Insights and Campaigns** (8), **Common Crypto and Degen Slang** (30) — each
  lesson follows the identical structure above; slugs are the first `L()` arg in
  the respective file.
- Test-guaranteed slugs present: `what-is-blackpebble`, `paper-vs-real-trading`,
  `ath-from-call`, `community-campaigns`, `contract-address`,
  `price-and-market-cap`, `automated-exits` (TP/SL), `profit-and-loss`,
  `recovery-and-cleanup` (`registry.test.ts`).

**Flags (content quality / risk):**
- **Duplicate/overlapping topics:** "Exit Liquidity" appears both as a slang term
  (`crypto-slang: exit-liquidity`) and thematically overlaps risk/scam content;
  liquidity is discussed in `market-data`, `memecoin-markets`, and `crypto-slang`.
  TP/SL concepts appear in both `orders-risk` and `blackpebble-features:order-tools`.
- **Empty required-looking content:** all **30** `crypto-slang` lessons pass an
  empty string for `why` (`L("degen","Degen","…","")`), so their rendered "Why it
  matters" section shows an empty paragraph.
- **Inconsistent depth:** 132 lessons lack an `example` (only 6 have one); ~102
  lessons have no callout. The experience varies from rich (Start Here) to terse
  (slang).
- **Roadmap-vs-live wording:** Feature lessons are generally hedged (e.g.
  `blackpebble-features:community-campaigns` advanced callout: "Campaign features
  are evolving…"). No overt claims of unbuilt features found; "Trading Journal…
  screenshots" wording should be verified against the journal implementation.
- **Solana-only language:** Pervasive and by design (category "Solana Basics",
  frequent SOL/Solana references, `start-here` calls BlackPebble "a Solana
  memecoin trading intelligence platform"). This will need revisiting for any
  future multichain positioning.
- **Broken related links:** 3 lessons link to `/utilities/campaigns`, which is not
  a route (real route is `/campaigns`) — see §21.
- **Capitalization/terminology:** Titles mix sentence and title case
  intentionally; slang uses combined titles (e.g. "Ape/Aping", "Ser/Fren"). No
  clear defect, but not fully uniform.
- **Financial-advice risk:** Content is educational and repeatedly hedges
  ("not financial advice" is itself a lesson `nfa`); no explicit advice found.

---

## 7. Current Content Model

Defined in `src/lib/education/types.ts`. Fields that **actually exist**:

`AcademyLesson`

| Field | Type | Req? | Rendered where | In search? | In SEO? | Usage count |
|---|---|---|---|---|---|---|
| `slug` | `string` | required | element `id` (hash target) | no (is the deep-link key) | no | 138 |
| `title` | `string` | required | lesson accordion header (`<span>`) | yes | no | 138 |
| `what` | `string` | required | "What it means" | yes | no | 138 |
| `why` | `string` | required | "Why it matters" | yes | no | 138 (30 empty) |
| `example` | `string?` | optional | "Example" | yes | no | 6 |
| `related` | `{label,path}?` | optional | "Related BlackPebble feature" (`<Link>`) | label only | no | 46 |
| `callout` | `{type,text}?` | optional | callout box (labelled by type) | no | no | 36 |
| `aliases` | `string[]?` | optional | not rendered | yes | no | 97 |
| `keywords` | `string[]?` | optional | not rendered | yes (haystack) | no | **0 (unused)** |
| `difficulty` | `"beginner"\|"intermediate"\|"advanced"?` | optional | not rendered | no | no | **0 (unused)** |

`AcademyCategory`: `id` (string), `title` (string), `icon` (`CategoryIcon`
enum of 12), `lessons` (`AcademyLesson[]`). **No `description`, no `slug`, no
`order` field** (order is array position in `registry.ts`).

`LessonCallout`: `type` (`why|safety|example|beginner|advanced`), `text` (string).
`LessonRelated`: `label` (string), `path` (string).

**Fields that do NOT exist** (from the prompt's candidate list): `category` (on
lesson), `description`, `whatItMeans`/`whyItMatters` (named `what`/`why`),
`relatedRoute` (folded into `related.path`), `beginnerTip`/`safetyNote` (folded
into the single `callout`), `estimatedTime`, `relatedLessons`, `chain`, `sources`,
`quiz`, `interactiveComponent`.

**Content embedded in JSX:** Lesson data is not in JSX; it is in typed TS object
literals — reusable/serializable within the app. The **section labels and callout
labels are hardcoded in components** (`lesson-body.tsx`: "What it means", "Why it
matters", "Example", "Related BlackPebble feature"; callout labels in
`CALLOUT_STYLES`). The single-`callout` model means the UI cannot show a Beginner
Tip **and** a Safety Note on the same lesson.

**Difficulty of common edits (current process):**
- Add one lesson: edit the relevant `categories/*.ts`, add an `L(...)` entry.
  Trivial; no migration, but requires a code deploy.
- Add one category: create `categories/<x>.ts`, add an icon to the `CategoryIcon`
  union + `CATEGORY_ICONS` map, import + append in `registry.ts`. Small but
  touches 3 files + type.
- Add a new tip type: extend `CalloutType` union and `CALLOUT_STYLES`. Small.
- Add a dedicated lesson page: **not currently supported** — requires new routing
  (`/learn/:slug`), a new page component, prerender + sitemap generation. Moderate.
- Add an interactive lesson component: **not supported** by the model; would need
  a new field (e.g. `interactiveComponent`) and renderer wiring. Moderate.

---

## 8. Current UI Implementation

| Visible element | File / component | Content source | Styling | Shared/Academy-specific |
|---|---|---|---|---|
| Title "BlackPebble Academy" + cap icon | `learn.tsx` via `PageHeader` (`components/page-header.tsx`) | hardcoded in `learn.tsx` | Tailwind | Shared header, Academy copy |
| Subtitle + supporting copy | `learn.tsx` (PageHeader `subtitle`) | hardcoded | Tailwind | Academy-specific |
| Academy search card | `learn.tsx` + `components/ui/input.tsx` (`Input`) | component state | Tailwind | Shared `Input`, Academy layout |
| Shortcut pills | `learn.tsx` (`role="tablist"`) | `ACADEMY_CATEGORIES` | Tailwind | Academy-specific |
| Category accordion card | `components/education/academy-category.tsx` | category objects | Tailwind | Academy-specific |
| Category icons | `academy-category.tsx` `CATEGORY_ICONS` (lucide) | `category.icon` | lucide | Academy-specific |
| Lesson accordion card | `components/education/lesson-accordion.tsx` | lesson objects | Tailwind | Academy-specific |
| Section labels | `components/education/lesson-body.tsx` | hardcoded labels | Tailwind | Academy-specific |
| Gold "Related feature" link | `lesson-body.tsx` (`wouter` `Link`) | `lesson.related` | `text-accent` | Academy-specific |
| Beginner Tip / Safety Note / callouts | `lesson-body.tsx` `LessonCalloutBox` + `CALLOUT_STYLES` | `lesson.callout` | Tailwind | Academy-specific |
| Page spacing / mobile layout | `learn.tsx` root container | — | Tailwind (`max-w-5xl`, `pb-24 md:pb-10`) | Shared conventions |
| Sticky global header | `components/app-shell.tsx` | — | Tailwind | Shared |
| Mobile bottom navigation | `components/app-shell.tsx` (`navItems`) | — | Tailwind | Shared (no Academy entry) |

**Accordion mechanics**
- **Custom** accordions (not a Radix/Headless library). Category open state is
  **controlled** in `LearnPage` (`openCategories`, persisted to `sessionStorage`);
  **multiple categories can be open**. Lesson open state is **uncontrolled** local
  `useState` inside `LessonAccordionRow`; **multiple lessons can be open**; lesson
  open state is not persisted (except one active lesson via URL hash).
- Animation: chevron rotates (`transition-transform`); no height animation; body
  is conditionally rendered (mounted only when open). No reduced-motion handling.
- Keyboard/focus: native `<button>` elements (focusable, Enter/Space toggle);
  `aria-expanded` is set on both category and lesson toggles; pills use
  `role="tab"`/`aria-selected` inside `role="tablist"`. No arrow-key roving
  tabindex; no `aria-controls` linking button to panel.
- Loading/error states: none needed (static content; no async). Empty state: a
  "No lessons matched your search…" card when search yields nothing.
- Responsiveness: single-column card list at `max-w-5xl`; pills scroll
  horizontally (`overflow-x-auto no-scrollbar`); `sm:` breakpoints for padding
  and text sizes; extra bottom padding for the mobile nav.

**Direct answers**
- Are all lesson bodies mounted immediately? **No.** Category and lesson bodies
  render only when open (`open ? … : null`), so collapsed content is absent from
  the DOM.
- Could hundreds of lessons cause DOM/bundle problems? DOM: limited, because
  collapsed bodies are not mounted. **Bundle: yes** — all lessons are statically
  imported into the single JS bundle (~2.08 MB / ~608 KB gzip today, all pages
  combined; no code splitting), so content growth inflates the main bundle.
  During an active search, all matched categories/lessons force-open and mount at
  once, which does scale with match count.
- Does opening a lesson cause unexpected scroll movement? Toggling does not
  auto-scroll; deep-link (hash) and pill "jump" intentionally `scrollIntoView`.
- Is open state preserved after navigation? Categories: yes (`sessionStorage`).
  Lessons: no (unless via hash).
- Are accordion headings semantically valid for SEO/a11y? **Partially.** Category
  titles are `<h2>`. **Lesson titles are `<span>` inside a `<button>`, not
  headings**, so there is no `<h3>` lesson-level document outline for SEO/AT.

---

## 9. Academy-Specific Search Audit

Search field label: **"Search lessons, features, or terms"** (`learn.tsx:145`).

- Component/state: `LearnPage` holds `query`; `searchResults = searchAcademy(query)`
  (memoized). Logic in `registry.ts` `searchAcademy` + `lessonHaystack`.
- Content searched: **client-side**, in-memory over `ACADEMY_CATEGORIES`.
- Searchable fields (the haystack): `title`, `what`, `why`, `example`,
  `related.label`, `category.title`, `aliases`, `keywords`. (`keywords` is in the
  haystack but no lesson populates it.) Category title match includes **all** its
  lessons.
- Matching: single lowercased **substring** `includes()` over the joined haystack.
  Case-insensitive. **No** tokenization, **no** multi-term AND/OR, **no** synonym
  expansion beyond authored `aliases`, **no** typo tolerance, **no** ranking/score,
  **no** highlighting, **no** debounce (runs on every keystroke via `useMemo`).
- Category filtering: non-matching categories hidden; matching categories
  force-open; only matched lessons shown; if exactly one lesson matches it is
  auto-expanded (`forceOpenLessons`/`matchedLessonSlugs.size === 1`).
- Deep-link behavior: search does not change the URL. Empty state: dedicated card
  suggesting "CA, MC, TP, SL, PnL, ATH, or a feature name". Analytics: none.

**Query behavior (based on the substring-over-haystack + authored aliases):**

| Query | Matches? | Why |
|---|---|---|
| `PnL` | Yes → `profit-and-loss` | authored alias/keyword (test-covered) |
| `P&L` | Likely no direct hit | `&` substring unlikely present unless authored; would match only if literal "p&l" appears |
| `profit and loss` | Yes | substring of the title/body "Profit and Loss" |
| `FDV` | Yes if authored in a market-data lesson title/alias | matches on substring "fdv" |
| `SL` / `stop loss` / `stop-loss` | `SL` → `automated-exits` (alias, test-covered); "stop loss" matches body text; "stop-loss" matches only if hyphen form present |
| `wallet` | Yes | matches wallet lessons + category "Wallets and Transaction Safety" |
| `safety` | Yes | category title "…Transaction Safety" + safety lessons |
| `rug` | Yes | scam-awareness content |
| `paper trading` | Yes | Start Here / Features |
| `SOL` | Yes | broad substring; many hits (Solana Basics, SOL Recovery, etc.) |
| `liquidity` | Yes | market-data / memecoin / slang |
| `gas` | Matches only if the literal token "gas" appears; Solana content typically uses "fees"/"rent", so likely few or no hits |

Note: 2-letter/ambiguous queries (e.g. `SL`, `TP`, `CA`, `MC`) rely on curated
`aliases`; without them a raw substring could over- or under-match.

---

## 10. Global Search Audit

Component: `src/components/token-search.tsx` (`TokenSearch`), placeholder
**"Search tokens, traders, tools..."**. Rendered in the header via `app-shell.tsx`.

End-to-end:
- Tokens: debounced (300 ms, min 2 chars) call to `api.search` →
  `GET /api/trade/search?q=…&wallet=…` (`src/lib/api.ts:2240`). Backend service
  handles token search (route under the trade router; not an Academy concern).
- Users: only for an explicit `@handle` (regex `^[A-Za-z0-9_]{1,15}$`) via
  `api.profiles.get` (exact lookup; no fuzzy user search).
- Utilities + Pages: **client-side** `matchRoutes` over static `UTILITIES` and
  `PAGES` arrays (label/keyword `includes`). Academy is one `PAGES` entry.
- Rendering: dropdown grouped as **Tokens / Users / Utilities / Pages**; keyboard
  arrow/enter navigation over a flattened action list; click-outside close;
  spinner while loading. Mobile: same dropdown (max-h `70vh`). No `Cmd/Ctrl-K`
  shortcut wired here. Analytics: `trackWalletSearch` for guests on token search.

Supported result types: **tokens, users (exact @handle), utility routes, page
routes**. Not supported: campaigns as entities, wallets (except as token search
input), Academy categories, Academy lessons, glossary terms, settings.

**Direct answers**
1. Does global search include Academy? Only the **single page** shortcut → `/learn`.
2. Does it search lesson titles? **No.**
3. Does it search full lesson text? **No.**
4. Does it support Academy aliases? **No** (only the page-entry `keywords` in
   `token-search.tsx`, e.g. "glossary", "terms").
5. Can it deep-link to a lesson? **No** (only to `/learn`).
6. Does it group results by type? **Yes** (Tokens/Users/Utilities/Pages).
7. Does it distinguish token vs educational results? Only Token vs a generic
   "Pages" group; there is no dedicated "Learn/Education" result type.
8. Contract addresses? Passed as `q` to the backend token search; no client-side
   mint detection/branching in `token-search.tsx`.
9. Tickers? Sent to backend token search; ranking/matching is server-side. The
   client does not special-case `$TICKER`.
10. No results? If tokens/users/utilities/pages are all empty, `hasResults` is
    false and the dropdown does not open (no explicit "no results" panel).
11. What breaks at 1,000 lessons? Nothing in global search — it never indexes
    lessons, so lessons remain invisible there regardless of count.

---

## 11. Token and Concept Ambiguity Audit

Current behavior only (no future solution):
- `$TICKER` detection: **none** in `token-search.tsx`.
- Mint-address detection: **none** client-side (address is sent to backend as `q`).
- Natural-language question detection: **none**.
- Result categories: fixed groups Tokens/Users/Utilities/Pages.
- Intent detection: **none**.
- Exact-token vs concept preference: token results come from the backend; concept
  results only ever appear as the single "BlackPebble Academy" page match when the
  query hits its label/keywords. There is no ranking between "token SOL" and "SOL
  the concept".
- Aliases: only the page-entry keyword arrays in `token-search.tsx`; Academy
  lesson aliases are not consulted by global search.
- Disambiguation UI: **none**.
- User-context ranking: **none** (wallet is passed to token search for
  personalization server-side, but no concept/lesson weighting).

Illustrative terms (`SOL`, `PNL`, `GAS`, `RISK`, `STOP`, `BURN`, `WALLET`,
`BASE`, `LIQUIDITY`, `BONK`): in **global** search each is sent to the backend
token search and may also match a page/utility by keyword (e.g. `WALLET` →
"Wallet Safety"/"Wallet Cleaner"); **none** surfaces an Academy lesson. In the
**Academy** search, the same terms match lessons by substring/alias but never
tokens. The two search systems are entirely separate.

---

## 12. SEO and Discoverability Audit

- Unique lesson URLs: **none** (hash fragments only).
- Page title / meta description: **one** set for `/learn`
  ("BlackPebble Academy | Solana Trading and Wallet Education" + description) in
  `seo.routes.json`, injected by `scripts/prerender.mjs`.
- Canonical URL: yes for `/learn` (prerender writes `<link rel="canonical">`).
- Open Graph / Twitter metadata: applied at the site/prerender level; not
  per-lesson.
- Sitemap: `/learn` present (priority 0.8, weekly). **No lesson URLs** in sitemap.
- Robots: `Allow: /` (only `/admin` disallowed); AI crawlers explicitly allowed;
  sitemap referenced.
- Structured data: **none** for Academy (no Article/FAQ/Course/Breadcrumb JSON-LD).
- Semantic headings: page/section `<h2>` for categories; **no `<h3>` per lesson**
  (lesson titles are `<span>`).
- Rendering: SPA. `prerender.mjs` injects **meta only** into a static shell; it
  does **not** server-render lesson content. Collapsed lessons are not in the DOM
  at all, so they are absent from initial HTML.
- Internal linking: lessons link **out** to feature routes (46 links); features do
  **not** link back to lessons (0 `/learn#` references anywhere).
- Duplicate content: low risk (single page).
- Public access: yes, no auth.

**Direct answers**
- Does Google see one Academy page or many? **One** page (`/learn`).
- Is collapsed lesson content in the initial HTML? **No.**
- Can individual lessons rank independently? **No** (no URLs, not in HTML).
- Are URLs stable/descriptive? The page URL yes; lesson hashes are stable slugs
  but are not indexable URLs.
- Is lesson content in the sitemap? **No** (only `/learn`).
- Is Academy a meaningful SEO acquisition system today? **Not yet** — it is a
  single crawlable page whose rich content is client-rendered and not
  independently indexable.

---

## 13. User Progress Audit

| Capability | Status | Evidence |
|---|---|---|
| Lesson completion | Absent | no field/table/state |
| Learning progress | Absent | — |
| Quizzes / scores | Absent | no `quiz` field/table |
| Bookmarks / saved lessons | Absent | — |
| Recently viewed | Absent | — |
| Recommended lessons | Absent | — |
| Prerequisites / learning paths | Absent (as data) | "Beginner Learning Path" is prose in one lesson, not a system |
| Beginner/advanced mode | Absent | `difficulty` field exists but unused/unrendered |
| XP / achievements / streaks / certificates | Absent for Academy | trading badges exist (`badges.ts`, `achievements-showcase.tsx`) but are unrelated to learning |
| Sharing completed lessons | Absent | — |
| Guest vs account persistence | Only ephemeral open/closed **category** state in `sessionStorage` (`bp-academy-open-categories`) |

No frontend progress files, no API routes, no DB tables, no analytics, no admin
controls for learning progress.

---

## 14. Onboarding Integration Audit

- Guest mode: Academy is fully usable as a guest (no auth guard on `/learn`).
- First-time flow: `src/components/trading-desk-onboarding.tsx` is a dismissible
  "Welcome to BlackPebble Paper Trading" coach mark on the Trading Desk. It uses
  the graduation-cap **icon decoratively** and does **not** link to `/learn`.
- X login / wallet connect / profile setup: independent of Academy.
- Guided tours / contextual tooltips / post-trade or error education: not wired to
  Academy lessons.
- Academy recommendations / personalized onboarding / experience-level capture:
  none.

**Direct answers**
- Are new users directed to Academy? **No** (no onboarding CTA to `/learn`; not in
  primary nav).
- Can Academy be used without logging in? **Yes.**
- Does Academy recommend a first action? Only as prose in the "Beginner Learning
  Path" lesson; not interactive.
- Can lessons open Paper Trading / other features? **Yes**, one-way via the
  "Related BlackPebble feature" link (e.g. `/`, `/utilities/wallet-cleaner`,
  `/utilities/trading-analysis`).
- Can Paper Trading / Wallet Cleanup / Trader Intelligence open a related lesson?
  **No** — there are zero deep links from features into `/learn#…`.
- Is learning connected to XP/achievements? **No.**
- Does onboarding capture experience level or goal? **No.**
- Is value delivered before account creation? **Yes** — all lessons are public.

---

## 15. Admin and CMS Audit

- No Academy CMS/admin exists. The admin page (`src/pages/admin.tsx`,
  `artifacts/api-server/src/routes/admin.ts`) covers trading/ops, not education.
- No create/edit/delete/draft/publish/preview/order/permission/revision/analytics
  tooling for lessons.
- **Developer workflow to add/edit content:** edit the relevant
  `src/lib/education/categories/*.ts` (and, for a new category, add an icon to the
  `CategoryIcon` union + `CATEGORY_ICONS` map and register it in `registry.ts`),
  then run typecheck/tests and deploy the frontend. Everything is code + deploy.
- **Future migration to DB:** feasible without breaking routes/components — the
  registry (`ACADEMY_CATEGORIES`/`searchAcademy`/`getLessonBySlug`) is a clean
  seam. If the same shapes (`AcademyCategory`/`AcademyLesson`) were served from an
  API/DB and fed into the existing components, the UI would not need to change.
  The main coupling to break is the **static import** in `registry.ts` and the
  synchronous, in-bundle assumption in `learn.tsx`/`searchAcademy`.

---

## 16. Database Audit

- Searched `lib/db/src/schema/index.ts` for `lesson|academy|education|glossary|
  quiz|content|learning|progress|completion|guides`.
- **No Academy/education tables, enums, indexes, or foreign keys exist.**
- The only match is `lessons: text("lessons")` — a column on the **trading journal
  entries** table (journal "Lessons Learned" free text), unrelated to Academy.
- No migrations, seed data, or query functions reference Academy content.
- **Conclusion:** Academy content lives **entirely outside the database**, in the
  frontend bundle. No production Academy data exists in Postgres.

---

## 17. Analytics Audit

- Analytics helpers: `src/lib/analytics.ts` (`trackGuestCreated`,
  `trackGuestFirstTrade`, `trackGuestSecondTrade`, `trackGuestConverted`,
  `trackWalletSearch`, `trackTokenView`, `trackXConnect`, `trackPortfolioView`,
  `trackLeaderboardView`, `trackFeedView`, `trackProfileView`,
  `trackFollowCreated/Removed`, `trackFeedTabChanged`, `trackXProfileLinkClicked`).
- **No Academy events exist:** no page-view, category-open, lesson-open, search,
  zero-result, related-feature-click, completion, quiz, time-spent, or scroll
  events for `/learn`. `LearnPage` calls no analytics.
- Can the current stack measure the funnel *Academy visit → lesson opened →
  related tool opened → first paper trade → account creation → return visit*?
  **No.** The trade/guest events exist (first trade, conversion) but there is no
  Academy-side instrumentation to connect the education entry points to them.

---

## 18. Automated Test Audit

| Test file | Behavior covered | Gaps |
|---|---|---|
| `src/lib/education/registry.test.ts` | 12 categories; unique slugs; unique titles within a category; presence of required starter slugs; alias search (CA/MC/TP/SL/PnL/ATH/"SOL recovery"); total lesson count 90–150 | No tests for: page rendering, accordion open/close, lesson-body sections, deep-link/hash behavior, sessionStorage persistence, global-search integration, accessibility/headings, SEO/prerender, mobile behavior, empty-`why` content validation, broken related-link detection, analytics, progress |

Only structural registry tests exist. There is no UI, integration, a11y, or SEO
test coverage for Academy.

---

## 19. Performance and Scale Audit

- All 12 category files are **statically imported** in `registry.ts`, and
  `LearnPage` is **statically imported** in `App.tsx` (no `React.lazy`/dynamic
  import anywhere in `App.tsx`). Therefore **all lesson content ships in the main
  JS bundle** (current production build is a single ~2.08 MB / ~608 KB gzip app
  chunk).
- DOM: collapsed categories/lessons are not mounted, so idle DOM stays small.
  During an active search, all matched categories/lessons force-open and mount
  simultaneously (scales with match count, not total count).
- Search: `searchAcademy` is a **linear scan** building a lowercased haystack per
  lesson on **every keystroke** (no index, no debounce, no memoized haystack).
- Routing/code-splitting/caching/pagination: none for Academy; content is
  synchronous and in-bundle.
- Prerender/sitemap: single page; no per-lesson generation.

Projected behavior:
- **100 lessons:** Fine (current ~138). Bundle and search cost negligible.
- **1,000 lessons:** Noticeable bundle growth (all in main chunk); per-keystroke
  linear search becomes measurable; broad queries mounting many open lessons could
  jank on low-end mobile. Single-page SEO ceiling becomes a real limitation.
- **10,000 lessons/terms:** In-bundle static content and client-side linear search
  are the clear bottlenecks; would need DB/API-backed content, a search index (or
  server search), code-splitting, pagination/virtualization, and per-lesson SEO.

Factual bottlenecks today: **(1)** entire content set in the main bundle (no
splitting), **(2)** per-keystroke linear substring search with no index/debounce,
**(3)** single-page SEO with client-only content.

---

## 20. Strengths to Preserve

- **Clean content/registry seam** (`registry.ts` + typed `types.ts`) — a strong
  foundation for a future DB/API migration without UI rewrites.
- **Premium, consistent visual design**: shared `PageHeader`, `Input`, `cn`,
  card/`shadow-card` conventions, restrained gold (`text-accent`) links, dark
  system — Academy matches the wider platform.
- **Clear, uniform lesson section labels** (`lesson-body.tsx`) and a tasteful
  callout system with distinct Safety Note styling.
- **Safety-first content**: 25 safety callouts, explicit seed-phrase warnings,
  paper-vs-real separation front-and-center.
- **Sensible organization**: 12 well-scoped categories, deep-linkable slugs,
  category-open persistence, alias-driven shorthand search (CA/MC/TP/SL/PnL).
- **Accessibility basics present**: native buttons, `aria-expanded`, `role="tab"`
  pills, `<h2>` category headings, `aria-label`ed search.
- **Guest-friendly**: fully usable pre-auth; `/learn` is crawlable and in the
  sitemap.

Reference components/files: `src/pages/learn.tsx`,
`src/components/education/*.tsx`, `src/lib/education/registry.ts`,
`src/lib/education/types.ts`.

---

## 21. Limitations and Risks

| Issue | Class | Evidence | Current impact | Impact if Academy grows | Confidence |
|---|---|---|---|---|---|
| 3 lessons link to `/utilities/campaigns` (no such route; real is `/campaigns`; catch-all → `NotFound`) | Critical defect (broken link) | `developer-campaigns.ts:21`, `solana-basics.ts:91`, `blackpebble-features.ts:126`; `App.tsx:122` | Users clicking these related links hit Not Found | Multiplies as more links are authored without validation | High |
| 30 `crypto-slang` lessons pass empty `why` → empty "Why it matters" section rendered | Content limitation | `crypto-slang.ts` (all `L(...,"")`); `lesson-body.tsx` always renders Why | Minor visual emptiness for 30 lessons | Grows with more terse entries | High |
| No per-lesson URLs; content client-only; not in sitemap | SEO limitation | single `/learn` in `seo.routes.json`/`sitemap.xml`; `prerender.mjs` meta-only | Academy cannot rank at lesson level | Large missed SEO acquisition at scale | High |
| Lesson titles are `<span>`, not `<h3>` | Accessibility / SEO | `lesson-accordion.tsx` | Weaker AT outline & heading structure | Compounds with more lessons | High |
| Entire content set in main bundle; no code splitting | Performance risk | static imports in `registry.ts`/`App.tsx`; single app chunk | Negligible now | Bundle bloat at 1k+ lessons | High |
| Per-keystroke linear search, no index/debounce | Performance risk | `searchAcademy`/`lessonHaystack`; `learn.tsx` `useMemo` | Fine now | Input lag at large scale | Medium-High |
| Global search excludes lessons (title/body/aliases) | Search limitation | `token-search.tsx` (only page shortcut) | Users can't find lessons from global search | Larger gap as content grows | High |
| No token/concept disambiguation ($TICKER, mint, intent) | Search limitation | `token-search.tsx` (no detection) | Ambiguous terms favor tokens; concepts hidden | Worse as education expands | High |
| Academy absent from primary nav (only footer icon + search shortcut) | UX limitation | `app-shell.tsx` `navItems` | Low discoverability | Limits adoption of a growing Academy | High |
| Single `callout` per lesson (can't show Beginner Tip + Safety Note together) | Content limitation | `types.ts` `callout?` | Some lessons can't carry both | Constrains richer lessons | High |
| `keywords` and `difficulty` fields defined but unused | Maintainability | `types.ts`; 0 usages | Dead surface area / confusing model | Drift risk | High |
| No analytics on Academy | Maintainability / product | `analytics.ts` (no events); `learn.tsx` | Cannot measure usage or funnel | Blind to what to expand | High |
| No progress/quiz/CMS | Architectural limitation | none found | Static guide only | Requires new subsystems to expand | High |
| Solana-only framing throughout | Content / architectural | `start-here.ts`, category set | Accurate today | Rework needed for multichain | Medium |
| Overlapping topics (exit liquidity, TP/SL, liquidity) | Content limitation | slang vs risk/market-data | Minor redundancy | Harder to keep consistent at scale | Medium |
| Lesson toggles don't update URL/history | UX limitation | `learn.tsx` (no hash write on toggle) | Manual expansions not shareable/restorable | Minor | High |

None of the "optional enhancement" gaps (quizzes, XP, CMS) are treated as defects;
only the broken `/utilities/campaigns` links and empty `why` sections are concrete
current defects.

---

## 22. Unknowns Requiring Production Verification

- Exact rendered behavior of the 3 `/utilities/campaigns` links in production
  (confirmed to hit the `NotFound` catch-all in code; verify UX in prod).
- Whether any server-side/edge layer rewrites `/learn#…` or adds Academy to search
  (none found in repo; confirm no external config differs).
- Real bundle attribution of the education content within the single app chunk
  (needs a production bundle analyzer run).
- Whether analytics for `/learn` exist in an external tool not wired through
  `analytics.ts` (none in repo).
- Accuracy of a few feature claims against live behavior (e.g. journal
  "screenshots"; campaign wording), which should be validated by product.

---

## 23. Recommended Next Discovery Steps

(Discovery only — no implementation proposed here.)
1. Decide the target content home (keep static registry vs. move to DB/API) using
   the existing `registry.ts` seam as the migration boundary.
2. Decide the URL strategy for lessons (`/learn/:categorySlug/:lessonSlug` vs.
   hash) — prerequisite for SEO, sitemap, and global-search deep links.
3. Define whether global search should surface lessons and how to disambiguate
   token vs concept (intent/$TICKER/mint detection) before building it.
4. Confirm content-model direction: retire or use `keywords`/`difficulty`; decide
   whether to support multiple callouts (Beginner Tip + Safety Note); add
   `sources`/`estimatedTime`/`relatedLessons` only if the product needs them.
5. Fix-scope list for a later change: the 3 broken campaign links and the 30 empty
   `why` fields.
6. Instrumentation plan: which Academy events to add for the learn→trade funnel.

---

## Facts Table

- **Academy categories:** 12
- **Academy lessons:** 138
- **Dedicated category routes:** 0 (in-page hash anchors only)
- **Dedicated lesson routes:** 0 (hash fragments `/learn#<slug>` only)
- **Content storage:** Static TypeScript objects in `src/lib/education/` (in-bundle)
- **Database-backed content:** No (no education tables; only an unrelated journal `lessons` column)
- **Academy-specific search:** Yes — client-side substring search (`searchAcademy`)
- **Academy included in global search:** Only as a single page shortcut to `/learn` (no lesson indexing)
- **Search aliases:** Yes in Academy search (97 lessons have `aliases`); the `keywords` field exists but is unused
- **Token/concept disambiguation:** None
- **User progress:** None (only ephemeral category open-state in `sessionStorage`)
- **Quizzes:** None
- **Personalized learning paths:** None (only prose "Beginner Learning Path" lesson)
- **Academy achievements:** None (trading badges are unrelated)
- **Admin content editor:** None (developer edits TS files)
- **SEO-ready lesson pages:** No (one prerendered `/learn` page; lessons not indexable)
- **Analytics coverage:** None for Academy
- **Automated test coverage:** Structural only (`registry.test.ts`)
- **Primary Academy files:** `src/pages/learn.tsx`; `src/lib/education/registry.ts` + `types.ts` + `helpers.ts` + `categories/*.ts` (12); `src/components/education/academy-category.tsx`, `lesson-accordion.tsx`, `lesson-body.tsx`; nav/search: `src/components/app-shell.tsx`, `src/components/token-search.tsx`; SEO: `seo.routes.json`, `scripts/prerender.mjs`, `public/sitemap.xml`
- **Largest immediate architectural constraint:** All content is static and in the main bundle with no per-lesson routing or DB/API seam exercised (single-page, in-bundle model)
- **Largest immediate UX constraint:** Low discoverability + no lesson-level deep linking from global search/navigation (Academy only in footer + one search shortcut; lessons not searchable globally)
- **Largest immediate SEO constraint:** Google sees one client-rendered `/learn` page; individual lessons have no URLs, no metadata, and are absent from initial HTML and the sitemap
```
