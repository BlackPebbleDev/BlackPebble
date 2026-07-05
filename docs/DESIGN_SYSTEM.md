# BlackPebble Design System

The single source of truth for how BlackPebble looks and feels.

**North star:** a mature, premium financial technology platform. Bloomberg
Terminal discipline, Apple restraint. Never flashy, never startup, never
crypto-neon. The first reaction should be *"this feels expensive"*; the
second, *"I didn't realize it could do this too."*

Every rule here exists to communicate: trust, professionalism, speed,
intelligence, confidence, attention to detail.

---

## Part 1 — Design audit (July 2026)

### What already works

The token layer in `src/index.css` is a real foundation, not a liability:

- **Surface ladder** `surface-0..4` (#050505 → #1c1c1c) — separation via
  depth, not outlines. Correct and premium.
- **Gold accent** `#c9a96e` — restrained, distinctive, ages well.
- **Type pairing** Inter (UI) + JetBrains Mono (numbers) with
  `tabular-nums` — correct for a data product.
- **Elevation** `--shadow-card` / `--shadow-elevated` with a 1px inner top
  highlight — subtle, physical, not glow-y.
- **Utilities** `.stat-label` / `.stat-value` / `.card-interactive` — the
  right instincts, inconsistently adopted.
- The **accent hairline** motif (`h-px` gradient from transparent via
  accent/40) used to mark hero surfaces — a signature worth keeping and
  systematizing.

### What makes it feel cheap / inconsistent today

| Finding | Data | Why it hurts |
|---|---|---|
| `success` token used but **never defined** | 6 files (`journal`, `token-intel`, `profile`, `trading`, `feed-card`) | Classes like `text-success` compile to nothing — pills render unstyled. Looks broken. |
| Raw palette colors instead of semantic tokens | ~480 usages (`emerald-400`, `red-400`, `sky-`, `violet-`, `amber-`, `zinc-` …) | Six different greens across pages = no single voice. Impossible to retune the product's tone in one place. |
| Card radius drift | 157 `rounded-xl`, 88 `rounded-2xl`, 15 `rounded-3xl` (wallet-cleaner) | Three coexisting card shapes; `rounded-3xl` is off-scale entirely and reads "landing page", not "terminal". |
| Arbitrary font sizes | ~380 `text-[10px]/[11px]/[13px]` | Uncontrolled micro-typography; labels differ by 1px between adjacent cards. |
| Ad-hoc buttons | ~174 raw `<button>` with inline pill styling | Hover states, heights, and radii drift per page; focus states missing. |
| No shared `PageHeader` | every page rolls its own icon + h1 + subtitle | Heading sizes vary (`text-3xl md:text-4xl` vs `text-2xl`), spacing varies, icons vary in size. |
| No shared `EmptyState` | re-implemented per page | Same layout copy-pasted with drifting paddings and icon choices. |
| Spinners instead of skeletons | most pages use a centered `Loader2` | Feels slower and cheaper than skeleton placeholders; layout jumps on load. |
| Decorative glows/gradients | arbitrary `shadow-[0_0_…]` rarity glows, amber gradient banners, medallion gradients | The only survivors should be the accent hairline and the badge medallions (both controlled); ad-hoc glows read "crypto site". |

### Verdict

This is not a redesign problem — it is a **consolidation** problem. The
system below codifies what the best screens already do, defines the missing
tokens, and gives mechanical migration rules for the rest.

---

## Part 2 — The system

### 2.1 Color

All color comes from tokens. Raw Tailwind palette classes
(`emerald-*`, `red-*`, `sky-*`, …) are forbidden in new code.

**Surfaces** (depth ladder — separation via elevation, not outlines):

| Token | Hex | Use |
|---|---|---|
| `background` | #0a0a0a | app canvas |
| `surface-1` | #0d0d0d | recessed wells inside cards |
| `card` | #141414 | primary card surface |
| `surface-2` | #121212 | secondary panels, pill tracks |
| `surface-3` | #171717 | hover state of cards |
| `surface-4` | #1c1c1c | highest elevation (popovers use `popover`) |

**Brand:** `accent` #c9a96e (gold). Used sparingly: active states, key
numbers, links, the hairline. If a screen has more than ~3 gold elements
visible, it is overused.

**Status** (display colors for text/pills/deltas — defined in `index.css`):

| Token | Meaning | Notes |
|---|---|---|
| `success` | profit, positive delta, win | muted emerald — replaces every `emerald-400`/`green-*` |
| `danger` | loss, negative delta, liquidation | refined red — replaces `red-400` text usage (`destructive` stays for destructive *buttons*) |
| `warning` | caution, pending, at-risk | replaces ad-hoc `amber-*` banners |
| `info` | neutral notice, watching | replaces ad-hoc `sky-*` |

Rarity tints (achievements) are the one sanctioned exception: common=zinc,
rare=sky, epic=violet, legendary=amber, centralized in
`achievement-badge.tsx` / `FEED_RARITY_TINT` — never inline anywhere else.

### 2.2 Typography

Inter for UI, JetBrains Mono for every number a user might compare.

| Role | Class | Spec |
|---|---|---|
| Page title | `text-3xl md:text-4xl font-bold tracking-tight` | one per page, via `PageHeader` |
| Section title | `text-lg font-semibold` | inside pages |
| Card title | `text-sm font-semibold` | |
| Body | `text-sm` | default reading size |
| Secondary | `text-sm text-muted-foreground` | |
| Caption / meta | `text-xs text-muted-foreground` | timestamps, hints |
| Micro label | `.stat-label` (11px, 600, +0.08em, uppercase, muted) | tile/table labels — the ONLY sanctioned micro size |
| Big number | `.stat-value` (mono, 700, tabular) | hero metrics |
| Data value | `font-mono tabular-nums text-sm` | tables, tiles |

Rules: no arbitrary `text-[Npx]` in new code — the scale above plus
`text-[11px]` via `.stat-label` covers everything. Headings always
`tracking-tight`. Numbers always mono + tabular so columns never shimmy.

### 2.3 Spacing

4px base grid. Sanctioned steps: 1, 1.5, 2, 3, 4, 6, 8 (Tailwind units).

- Page container: `max-w-*` per page type + `px-4 md:px-6 py-6`.
- Card padding: `p-4` (dense/feed) or `p-5` (standard); hero cards `p-6`.
- Grid gaps: `gap-2` inside cards (tiles), `gap-4` between cards,
  `gap-6` between page sections.
- Vertical rhythm inside cards: `mt-1.5` between related lines, `mt-2.5`
  before a new block (tiles, reactions).

### 2.4 Corner radius

One shape language, three sizes:

| Radius | Value | Use |
|---|---|---|
| `rounded-md`/`rounded-lg` | 14px | buttons, inputs, dropdowns, tiles inside cards use `rounded-lg` |
| `rounded-xl` | 16px | **all cards and panels** |
| `rounded-2xl` | 18px | modals, search, hero surfaces only |
| `rounded-full` | ∞ | pills, chips, avatars, icon medallions |

`rounded-3xl` is banned. Never mix card radii on one screen.

### 2.5 Elevation

Three levels, shadow-based, never glow-based:

1. **Flat** — recessed wells: `bg-surface-1`/`bg-secondary/40`, no shadow.
2. **Card** — `.shadow-card` (+ inner top highlight).
3. **Elevated** — `.shadow-elevated`: popovers, modals, hover-lifted cards.

`glow-accent` is reserved for a single primary CTA per screen at most.
Arbitrary `shadow-[0_0_…]` values are banned; the rarity glows in
`FEED_RARITY_TINT` are grandfathered as the one centralized exception.

### 2.6 Cards

The universal container: `rounded-xl bg-card shadow-card p-4|p-5`.

- Interactive cards add `.card-interactive` (2px lift + elevated shadow +
  `hover:bg-surface-3`); non-interactive cards get no hover.
- Hero cards (one per page max) may add the **accent hairline**:
  `.hairline-accent` utility (top 1px gradient) — this is BlackPebble's
  signature "premium surface" marker.
- Never nest borders inside cards; use surface deltas (`bg-secondary/40`).

### 2.7 Metric tiles

The reusable data atom (feed cards, analysis, portfolio):
`rounded-lg bg-secondary/40 border border-border/40 px-3 py-2`, with
`.stat-label` above a `font-mono tabular-nums text-sm` value. Grid:
`grid-cols-2 sm:grid-cols-4 gap-2`. Available as the `.metric-tile` utility.

### 2.8 Tables & lists

- Row height 44–48px; horizontal `divide-y divide-border/40`, never full
  borders or zebra stripes.
- Labels `.stat-label`; values mono, right-aligned when numeric.
- Row hover: `hover:bg-surface-3 transition-colors` (no lift inside tables).
- Ranked lists (leaderboard): rank column mono, medals only for top 3.
- Mobile: tables collapse to stacked card rows, never horizontal scroll.

### 2.9 Buttons

Use `components/ui/button.tsx` variants; do not restyle raw `<button>`s:

- `default` — white-on-dark primary; one per view.
- `secondary` — graphite; standard actions.
- `outline` — hairline; toolbar/tertiary.
- `destructive` — irreversible actions only.
- `ghost` — icon buttons, inline actions.

Pills (filter tabs, chips) are the sanctioned raw-button exception and use
the shared `FilterPills` / `.pill` recipe: `rounded-full px-2 py-0.5
text-[11px] uppercase tracking-wider font-semibold`.

### 2.10 Inputs

`components/ui/input.tsx`: 14px radius, `bg-input`, hairline border, focus
ring `ring-accent/40`. Labels use `.stat-label`. Inline validation in
`text-danger text-xs`, never browser alerts.

### 2.11 Status pills & badges

- Status pill: `rounded-full px-2 py-0.5 text-[10-11px] font-semibold
  uppercase tracking-wider` + status tint at /12–/15 opacity background
  with the matching text color (e.g. `bg-success/12 text-success`).
- Tints are always translucent (`/12` bg), never solid blocks.
- Official/tier badges come from `official-badge.tsx` / `tiers.ts` only.

### 2.12 Charts

- Line/area: accent or status color at full strength for the stroke,
  `/10` fill; grid lines `border/40`; no drop shadows.
- Tooltips: `rounded-xl bg-popover shadow-elevated` — match card language.
- Axis labels 11px muted mono. Range toggles use pill tabs.
- Sparklines: single stroke, no fill, no axes.

### 2.13 Domain cards

All follow the card + tile grammar above:

- **Feed cards** — actor row → title → metric tiles → reactions
  (see `feed-card.tsx`, the reference implementation).
- **Campaign cards** — image/icon medallion + goal pills + thick progress
  bar (`campaigns.tsx`).
- **Profile cards** — banner (subdued gradient allowed) + avatar ring +
  badge row.
- **Wallet / portfolio cards** — hero number in `.stat-value`, delta pill
  in status color, tiles beneath.

### 2.14 Modals

`rounded-2xl`, `bg-card shadow-elevated`, `p-6`, max width per purpose
(`sm:max-w-md` forms, `sm:max-w-2xl` flows). Title `text-lg font-semibold`,
description `text-sm text-muted-foreground`. Multi-step flows show a step
indicator; primary action bottom-right.

### 2.15 Motion

Speed communicates quality. Durations: 150ms (hover/press), 180ms (card
lift), 250ms (modals/expand). Easing `ease` or `ease-out`. Rules:

- Transition `colors`, `transform`, `box-shadow`, `opacity` only — never
  `all`.
- No bounce, no pulse outside skeletons/live-indicators, no parallax,
  no confetti. Celebration = subtle glow + badge visual, not motion.
- Respect `prefers-reduced-motion`.

### 2.16 Loading & empty states

- Prefer **skeletons** (`components/ui/skeleton.tsx`) shaped like the
  final layout over centered spinners; spinners only for sub-second
  in-button waits.
- Empty states use the shared `EmptyState` component: card surface, muted
  icon, one-line headline, one supporting sentence, optional single action.
  Copy is contextual and confident ("Your intelligence feed is quiet"),
  never apologetic.

### 2.17 Responsiveness

- Mobile-first. No horizontal scrolling, ever.
- Tiles: `grid-cols-2` mobile → `sm:grid-cols-4`.
- Pills wrap (`flex-wrap`), tabs never overflow.
- Touch targets ≥ 40px. Bottom nav on mobile, sidebar on desktop.
- Desktop: content max-widths per page type (feed `max-w-3xl`, data pages
  `max-w-6xl`, marketing `max-w-5xl`) — never full-bleed text.

---

## Part 3 — Modernization roadmap

Phase 1 is shipped with this document; later phases are safe, mechanical,
and incremental.

**Phase 1 — Foundation (shipped)**
- Define missing status tokens (`success`, `danger`, `warning`, `info`) —
  instantly fixes the 6 files already using `text-success`.
- Add `.metric-tile`, `.pill`, `.hairline-accent`, skeleton shimmer, and
  motion utilities to `index.css`.
- Ship shared `PageHeader` and `EmptyState` components; adopt on the Feed.
- Kill off-scale radii (`rounded-3xl` → `rounded-2xl` in wallet-cleaner).

**Phase 2 — Color consolidation**
- Mechanical migration of `emerald-*`/`green-*` → `success`, text
  `red-*` → `danger`, banner `amber-*` → `warning`, `sky-*` → `info`
  (≈480 sites, per-page PRs; rarity tints excluded).

**Phase 3 — Structural adoption**
- Adopt `PageHeader`/`EmptyState` across all 19 pages.
- Replace ad-hoc buttons with `Button` variants page by page (~174 sites).
- Normalize card radii to `rounded-xl` (audit the 88 `rounded-2xl`; keep
  only modals/heroes).

**Phase 4 — Typography & polish**
- Replace arbitrary `text-[Npx]` with the scale (≈380 sites).
- Skeletons for the top 5 data pages (portfolio, trading, feed,
  leaderboard, markets).
- Chart tooltip/axis unification.

**Phase 5 — Detail pass**
- Focus-visible rings everywhere; keyboard navigation audit.
- Reduced-motion support; transition property audit (`transition-all` ban).
- Density review: tighten table row heights, align every column.
