# BlackPebble Chart Intelligence System — Feasibility & Architecture Plan

Status: **feasibility pass — no implementation yet**
Date: July 8, 2026

> **Revision 2 (July 8, 2026):** The Phase-1 Lightweight Charts build was
> reviewed and **rejected** — it reads as a downgrade, not a premium
> TradingView-grade terminal. Phases 2–4 are paused. The chart architecture
> decision is re-opened below (see **§0 Revision 2**) with quality/TradingView
> feel prioritized over implementation speed. Read §0 first; §1–§7 below are
> the original Phase-1 plan and remain valid as background.

---

## 0. Revision 2 — Re-opened architecture decision (quality-first)

### 0.1 Why the current chart was rejected — concrete root causes

These are real, diagnosed defects in the shipped Lightweight Charts build, not
just polish. They matter because two of them are data-layer issues that will
follow us to *any* chart library, so they must be fixed regardless of path.

1. **Market-cap inconsistency across timeframe switches (CRITICAL).**
   `lib/candles.ts` derives supply as `marketCapUsd / priceUsd` from a
   DexScreener snapshot, recomputed on every fetch and cached only 5 min per
   pool (`resolvePool`). Each timeframe switch triggers a fresh
   `getBestPairs` call → a slightly different live price → a **different
   derived supply** → **every historical MC candle rescales**. So switching
   1m→15m visibly shifts the whole MC axis. Root cause: supply is treated as
   variable when it should be a constant.
2. **Latest candle ≠ header market cap (CRITICAL).** Candle closes come from
   GeckoTerminal's pool OHLCV; the header MC/price come from DexScreener.
   Different sources + latency ⇒ the last bar never exactly equals the live
   header value. There is no "anchor the forming bar to the live price"
   mechanism.
3. **Broken 15s/30s timeframes.** GeckoTerminal's `second` timeframe returns
   only very recent history and is empty for most pools. The pills render for
   any token < 24 h old and only fall back to 1m *after* a failed fetch — so
   users can select a timeframe that shows nothing. Violates "broken
   timeframes should be hidden or disabled."
4. **Touch interaction feels locked down.** The passive-gate model (fully
   inert until an intentional tap) is scroll-safe but not *natural* — it does
   not feel like a real trading terminal where the chart is simply live.
5. **UI is a basic component, not a terminal.** Lightweight Charts ships no
   toolbar, no drawing tools, no indicator UI, no built-in timeframe/scale
   chrome. Our hand-built pill row reads as a demo next to TradingView.

**Takeaway:** #1 and #2 are data-architecture problems (fixable anywhere). #3–#5
are largely a *library ceiling* — Lightweight Charts is a minimalist plotting
lib by design and will never be the full TradingView terminal without us
rebuilding all of that chrome ourselves.

### 0.2 The market-cap fix (applies to every path)

MC consistency is a data-layer fix, independent of the chart library:

- **Pin supply to a constant.** Circulating/total supply barely changes for a
  memecoin. Fetch the **on-chain token supply once** (Helius `getTokenSupply`
  — Helius is already integrated) or use a provider's MC-mode candles (below),
  and cache it long. Compute `MC = price × fixedSupply` identically at every
  timeframe. This alone kills the cross-timeframe rescaling.
- **Anchor the forming bar to the live feed.** Drive the last/most-recent bar's
  close from the *same* price source the header uses (or a live websocket), so
  the newest candle agrees with the header MC/price.

### 0.3 Options, re-compared with quality prioritized

#### Option A — TradingView Advanced Charts (the real terminal) ✅ RECOMMENDED

New facts confirmed this pass:

- **It is genuinely free** for companies using it in a **public web project** —
  not a $500–5000/mo product (that figure refers to the broker-oriented
  *Trading Platform* library or third-party wrappers, not Advanced Charts). You
  self-host it and feed your own data.
- **Access requires an approval step**: submit the request form on the Advanced
  Charts landing page; on approval you receive a GitHub invite to the private
  `charting_library` repo. Granted to companies/public web projects; **not**
  granted for personal/hobby/unpublished projects.
- **It is literally TradingView's terminal UI** — professional candle
  rendering, full timeframe/scale toolbar, drawing tools, smooth natural
  touch/zoom/pan. This is the "TradingView feel" by definition; nothing to
  rebuild.
- **Attribution**: the TradingView logo is shown and can sit small in a chart
  corner (`move_logo_to_main_pane` featureset); it cannot be fully removed
  without a separate agreement. This satisfies "small normal attribution, no
  billboard."
- **Our data plugs in** via the **Datafeed API** (`getBars` for history,
  `subscribeBars` for live). Our Solana/memecoin OHLCV — GeckoTerminal today or
  a richer provider (below) — feeds straight in. **Price *and* market-cap
  modes** are standard (the reference implementation below ships exactly this).
- **BlackPebble overlays**: entry/target/stop/liquidation lines via the shapes
  API (horizontal-line shapes / order-line style); own-trade + event markers
  via the **marks API** or a synced HTML overlay for rich markers (profile
  pics, DS logos) — same overlay layer we already designed, now on a premium
  base.
- **Proven pattern**: every premium Solana terminal (DexScreener, Birdeye,
  Photon, Axiom, Solana Tracker) is Advanced Charts + a custom datafeed. There
  is a public reference implementation —
  `solanatracker/solana-tradingview-advanced-chart-example` — doing precisely
  our target: Advanced Charts + Solana OHLCV 1s–1d, **Price/Market-Cap
  toggle**, outlier removal, dynamic pool selection, dark theme, layout
  persistence.

**Gating risks (must be resolved before/with this path):**

- **Approval is required and not guaranteed instantly.** Timeline is typically
  days to ~2 weeks. BlackPebble qualifies as a public web project, but…
- **The license expects a *publicly accessible* implementation** TradingView
  can view as your users do. If BlackPebble is still localhost/pre-launch, we
  likely need a public deployment (even a staging URL) to get and keep
  approval. **This is the biggest blocker to flag.**
- **Bundle/complexity**: it's a larger, self-hosted library requiring a
  datafeed implementation — more moving parts than LWC, but standard work.

#### Option B — A provider chart with real TradingView-style UI, no billboard

Finding: **there is no clean drop-in.** Every provider that shows a
TradingView-grade UI for Solana (DexScreener, Birdeye, Photon, GMGN, Solana
Tracker) does it by building **Advanced Charts themselves with their own
datafeed** — and their embeds carry *their* branding (the billboard we already
rejected) or aren't offered as white-label embeds at all. So Option B
collapses into Option A: we build Advanced Charts ourselves. The only real
sub-decision is the **data provider** (next).

#### Option C — Keep Lightweight Charts, but redesigned to feel premium

Honest assessment: the specific bugs are all fixable —

- MC consistency → the §0.2 fixed-supply + live-anchor fix.
- 15s/30s → hide/disable timeframes the data source can't serve.
- Touch → loosen the gate toward natural interaction.
- UI → build a real toolbar, richer axis/crosshair, drawing affordances.

…but "build a real toolbar + drawing tools + terminal chrome on top of a
minimalist plotting lib" is re-implementing a large chunk of what Advanced
Charts gives for free, and it still won't match TradingView's feel. Given your
explicit goal ("full TradingView-quality," "not a basic chart component") and
that you've said the current LWC is unacceptable, **C is not the destination.**
Its only legitimate role is a **short-term interim** while Advanced Charts
approval / public deployment is sorted — and only if you want *something*
better than today's build in the meantime.

### 0.4 Data provider decision (independent of the UI library)

The data source is what actually fixes the CRITICAL issues, so it matters more
than the library:

| Source | 1s/5s/15s candles | Native market-cap candles | Cost | Notes |
|---|---|---|---|---|
| **GeckoTerminal** (current) | ✗ (no real sub-minute) | ✗ (we derive supply) | Free (~30/min) | Cause of #1/#3 |
| **Solana Tracker Data API** | ✓ (1s–1d) | ✓ (`marketCap: true`) | Free tier + paid | Cleanest fit; outlier removal, dynamic pools |
| **Birdeye** | ✓ (with key) | partial | Free tier + paid | Already stubbed as a sparkline fallback (`BIRDEYE_API_KEY`) |
| **Bitquery** | ✓ | derivable | Free tier + paid | GraphQL + websocket live bars |

A provider that returns **market-cap candles natively** (Solana Tracker) makes
MC consistency automatic — no client-side supply math at all — and gives real
sub-minute candles, killing #1 and #3 together. The tradeoff is a likely
**paid data tier** vs. today's free GeckoTerminal.

### 0.5 Recommendation

1. **Target architecture: Option A — TradingView Advanced Charts + a proper
   Solana OHLCV/market-cap data provider.** It is the only path that delivers a
   genuine TradingView-quality terminal, it's free for a public web project,
   supports small corner attribution, ingests our data, and its overlay/marks
   APIs support the Phase-2+ markers we already designed.
2. **Fix the market-cap architecture regardless of library** (§0.2): constant
   on-chain supply (or provider MC-mode candles) + live-anchored forming bar.
   This is the "MC must be consistent and agree with the header" requirement,
   and it's mandatory work no matter what.
3. **Move to a data provider with real 1s–1d + native MC candles** (Solana
   Tracker is the cleanest); keep GeckoTerminal as a free fallback.
4. **Two blockers only you can clear** before we build Option A:
   (a) apply for Advanced Charts access (company/public web project), and
   (b) confirm a public/staging URL exists for review, since the license
   expects a publicly viewable implementation.
5. **Interim question:** while approval is pending, either (i) leave today's
   chart and wait, or (ii) I do a focused, *bounded* fix pass on the current
   LWC (MC consistency, hide broken 15s/30s, loosen touch) so it's not
   embarrassing — explicitly a stopgap, not the final product. I do **not**
   recommend a full LWC premium redesign (Option C), since that effort is
   largely thrown away once Advanced Charts lands.

No Phase-2 work (event/social/KOL/dev/DEX markers) proceeds until the base
chart is one you approve.

---

## 0.6 DECISION LOG (July 8, 2026)

Owner decisions confirmed:

- **Chart engine → Option A: TradingView Advanced Charts.** Real
  TradingView-grade terminal. No large billboard branding; small standard
  attribution only if the license requires it. Will set up a public/staging URL
  for TradingView review. **No Phase 2–4 overlays until the base chart is
  approved.**
- **Candle data → GeckoTerminal (free), with corrected supply.** Market cap is
  pinned to a **constant on-chain supply (Helius `getTokenSupply`)** so MC is
  identical across timeframes; the newest bar is **live-anchored** to the header
  price so the latest chart value agrees with the header.
- **Interim → bounded stopgap on the current chart (DONE).** Not the final
  product; just prevents an embarrassing chart while Advanced Charts is stood
  up.

### Interim fix — shipped

- `api-server/src/lib/helius.ts`: added `getTokenSupply(mint)` (on-chain UI
  supply, cached 12 h).
- `api-server/src/lib/candles.ts`: `resolvePool` now pins supply to the
  on-chain value (price-derived only as a last-resort fallback, never
  overwriting a pinned value) → **fixes cross-timeframe MC rescaling.**
- `blackpebble/src/components/token-chart.tsx`: last bar live-anchored to
  `info.priceUsd` (**latest value agrees with header**); removed the
  tap-to-activate gate for **natural, scroll-safe** interaction (page always
  scrolls; chart pans on drag/horizontal-swipe, zooms on pinch/axis-drag).
- `blackpebble/src/lib/chart-candles.ts`: **15s/30s hidden** (GeckoTerminal
  can't serve them reliably); auto-ladder now 1m → 5m → 15m by age.

### Advanced Charts — execution plan

**Track 1 — Access & deployment (owner-driven, blocks go-live):**
1. Submit the Advanced Charts access request form (company/public web project =
   BlackPebble) — needs project name, a public URL, contact email, short
   description. Approval ≈ days to ~2 weeks.
2. Stand up a public/staging deployment (frontend + API) at a reviewable URL —
   TradingView's license expects a publicly viewable implementation.
3. On approval: drop the private `charting_library` into
   `blackpebble/public/charting_library/` (git-ignored — the library is
   non-redistributable and must not live in a public repo).

**Track 2 — Integration scaffolding (buildable now, before approval):**
4. Extend `GET /markets/:mint/candles` to accept `from`/`to`/`countBack`
   (range pagination via GeckoTerminal `before_timestamp`+`limit`) and a
   `marketCap=true` mode (price × pinned supply, server-side) — the shapes the
   TradingView Datafeed API needs.
5. Implement a framework-agnostic **Datafeed adapter** (`onReady`,
   `resolveSymbol`, `getBars`, `subscribeBars`, `searchSymbols`) wrapping that
   endpoint — unit-testable without the library present.
6. Build a **TVChartContainer** React component that lazy-loads
   `charting_library` behind a feature flag and gracefully falls back to the
   interim chart when the library isn't installed — so the build never breaks
   pre-approval.
7. Configure the widget: dark/gold theme, small corner attribution
   (`move_logo_to_main_pane`), Price/MC symbol modes, sensible
   enabled/disabled featuresets.

**Track 3 — Overlays (DEFERRED until base chart approved):** entry/TP/SL/liq
lines via the shapes API; own-trade + event markers via the marks API or a
synced HTML overlay. No work until sign-off on the base chart.

### Track 2 — SHIPPED (integration scaffolding, July 8, 2026)

Everything below is committed and built; it activates the moment the library is
installed + `VITE_TV_CHARTS=1`. Nothing changes for users until then (the app
falls back to the interim chart).

- **Backend datafeed endpoint** — `GET /markets/:mint/candles/range`
  (`api-server/src/routes/markets.ts` + `getCandleRange` in
  `lib/candles.ts`): history paging via `before` (unix sec) + `countBack`, and
  `marketCap=1` mode that returns MC-valued OHLCV using the **pinned on-chain
  supply** (MC consistent across timeframes by construction). Empty ranges
  return `{ candles: [], noData: true }` (datafeed contract), 404 only when the
  pool can't be resolved.
- **Datafeed adapter** — `blackpebble/src/lib/tv-datafeed.ts`: framework-free,
  no library import; implements `onReady`/`resolveSymbol`/`getBars`/
  `subscribeBars`/`searchSymbols`. Sub-minute resolutions are excluded
  (`TV_SUPPORTED_RESOLUTIONS` = 1/5/15/60/240/1D) so there are no broken 15s/30s
  options. Price vs MC is carried on the symbol ticker (`mint` vs `mint~mc`).
  Pure helpers unit-tested (`tv-datafeed.test.ts`, 9 tests).
- **Lazy loader** — `blackpebble/src/lib/tv-loader.ts`: loads the self-hosted
  `charting_library` script on demand; resolves to `null` (never throws) when
  absent. `tvChartsEnabled()` gates on `VITE_TV_CHARTS`.
- **Container** — `blackpebble/src/components/tv-chart.tsx` (`TokenChartPanel`):
  renders the real TradingView terminal when enabled+installed, else falls back
  to the interim `TokenChart`. Dark/gold theme overrides, small corner
  attribution (`move_logo_to_main_pane`, no billboard), Price/MC toggle via
  `setSymbol`. Wired into `pages/trading.tsx`.
- **Staging structure** — `charting_library/` + `datafeeds/` git-ignored (the
  library must not live in a public repo); `VITE_TV_CHARTS` documented in
  `.env.example`.
- **Verification** — FE+BE typecheck clean, 19 unit tests pass, production
  build succeeds with the library absent (fallback confirmed).

### Visual target (owner screenshot, July 8, 2026)

The owner supplied a screenshot as the visual target: a GeckoTerminal token
page whose chart is **TradingView Advanced Charts** (header reads
"COBRA/USD (Market Cap) · 15 | PumpSwap | GeckoTerminal.com", TV logo bottom
-left, purple "DS" dev markers). This is the *same engine* we're integrating —
confirming the direction. We keep its structure and reskin it for BlackPebble.

Requirement → configuration mapping (baked into `components/tv-chart.tsx`):

| Target from screenshot | How we achieve it |
|---|---|
| Real trading-terminal feel, compact top toolbar, legit candles | Advanced Charts native header/legend/candles (it IS this engine) |
| Market-cap mode | Price/MC toggle → datafeed symbol `mint` vs `mint~mc`, MC via pinned supply |
| Expandable fullscreen | Native `header_fullscreen_button` (kept enabled) |
| Right-side trading panel beside chart | Already exists in `pages/trading.tsx` layout |
| No large bottom billboard branding | Advanced Charts has no billboard; only small TV logo via `move_logo_to_main_pane` |
| No purple theme/text | Gold crosshair + gold accents; dark `#0e0e0e` surface (`BP_OVERRIDES`) |
| Gold accents not purple | `ACCENT = #c9a96e` on crosshair; candles green/red, subtle volume |
| No giant symbol watermark | `symbolWatermarkProperties.transparency: 100` |
| No broken 15s/30s | `TV_SUPPORTED_RESOLUTIONS` = 1/5/15/60/240/1D only |
| MC/Price consistent across timeframes | Pinned on-chain supply in the datafeed's `marketCap` mode |
| Clean, uncluttered markers (future) | Left drawing toolbar collapsed by default; Track 3 markers styled gold/clean, NOT purple "DS" |

Note: until the library is installed + `VITE_TV_CHARTS=1`, the token page shows
the **interim** chart (not the screenshot). The screenshot look is delivered by
the Advanced Charts integration above once Track 1 completes. The rejected
Lightweight Charts frontend is **not** the target and will not be polished
further as a final solution.

### Remaining — Track 1 (owner-driven)

- **Deploy** to a public/staging URL (chosen: Vercel for FE + a host for the
  API). Needed for TradingView's review.
- **Apply** for Advanced Charts access (owner will submit; walk through the form
  together when ready).
- **Install** the approved `charting_library` into
  `blackpebble/public/charting_library/`, set `VITE_TV_CHARTS=1` on staging,
  and review the real chart before any Track 3 overlay work.

---


The token page chart should become BlackPebble's main token intelligence
surface: a native terminal component with trader-intent lines (Entry, Targets,
Risk, Orders) and time-anchored event markers (calls, theses, campaigns, DEX
Screener events, dev activity, trader activity) — not an embedded third-party
iframe with billboard branding.

---

## 1. Current state (what we have today)

### The chart

`artifacts/blackpebble/src/components/tradingview-chart.tsx` renders a
**GeckoTerminal iframe embed** (`geckoterminal.com/solana/pools/{pool}?embed=1`)
for migrated tokens. Pre-migration (bonding-curve) tokens use a Chart.js live
price line built from in-app price polling (`PriceChart` in `pages/trading.tsx`).

Problems, confirmed in code:

- **Branding**: the embed carries GeckoTerminal's full bottom branding; we
  control nothing inside the iframe.
- **Iframe, not native**: we already fight it — remount-per-pool `key` hacks,
  `about:blank` teardown, 20-second stall timers.
- **Touch hijacking**: the iframe consumes touch events; scrolling the page
  over the chart pans/zooms the chart. Unfixable from outside an iframe.
- **No overlays possible**: we cannot draw order lines, markers, or hover
  cards over a cross-origin iframe.
- **Fixed `resolution=15m`** in the embed URL — every token defaults to 15m.

### Data already available (audit results)

| Need | Status | Where |
|---|---|---|
| Pool/pair address per token | EXISTS | `TokenInfo.pairAddress` (trusted-pool selection in `lib/prices.ts`) |
| Token age | EXISTS | `TokenInfo.pairCreatedAt` (ms epoch, already shown on token page) |
| Price ↔ MC conversion | DERIVABLE | supply = `marketCapUsd / priceUsd` — same derivation `lib/trading.ts` `maxTokensForSupply` already uses |
| OHLCV candles | PARTIAL | `lib/sparklines.ts` already calls GeckoTerminal pool OHLCV but **discards O/H/L/V/time, keeping closes only**; no candle API route exists |
| Avg entry (spot) | EXISTS | `Position.avg_entry_price`, `entry_market_cap`; token page already finds position by mint |
| Buy limits / TP / SL | EXISTS | `PaperOrder` (`trigger_type: market_cap\|price`, `trigger_value`, direction); per-mint route exists (`GET /trade/orders/:wallet?mint=`) |
| Perps entry/liq/TP/SL | EXISTS | `LeveragePositionRow.entry_market_cap`, `liq_market_cap`, `tp_trigger_mc`, `sl_trigger_mc` + exit orders |
| My historical buys/sells w/ MC | EXISTS | `Trade.executed_at` + `market_cap_usd`; needs a `?mint=` filter on `GET /trade/history/:wallet` (client-side filter works meanwhile) |
| Other users' public trades per mint | MISSING | feed queries have no mint filter; `trades.token_mint` exists so it's a new query, not a schema change |
| Calls (callouts) per mint w/ MC | EXISTS | `GET /markets/:mint/intelligence` → `recentCallouts[]` with `call_market_cap` + `created_at` |
| Theses per mint | PARTIAL | mint + timestamp exist; **no MC snapshot at post time** (time-anchored only, or backfill going forward) |
| Campaign events per mint | PARTIAL | `campaigns.token_mint` + `campaign_events` timestamps exist; no per-mint endpoint, no MC snapshots |
| Dev buy/sell | MISSING | needs creator-wallet identification + Helius parsed tx history (Helius already integrated) |
| KOL wallets | MISSING | needs an admin-verified wallet registry (new table) + on-chain tx source |
| Chart library | MISSING | only `chart.js` (no candlesticks anywhere); no lightweight-charts/TradingView lib installed |
| Feed icon language | EXISTS | `feed-card.tsx`: buy `ArrowUpRight` success, sell `ArrowDownRight` danger, perps `Zap`, call/campaign `Megaphone` accent, thesis `ScrollText` accent, achievements `Medal/Gem/Crown`, recovery `Sparkles` — circular tinted `rounded-full` containers, same shape language the chart markers should reuse |

---

## 2. Architecture options compared

### Option 1 — TradingView Advanced Charts

Free to *use* but **not free to obtain**: requires a company application and
TradingView approval ("we don't provide [it] for personal use… only available
to companies for use in public web projects"). Review is selective and
pricing/terms vary by agreement. The license agreement (§3.2) makes
TradingView branding/attribution **mandatory and non-removable**, with logo
placement determined by the license terms — we cannot guarantee "small corner
only." It ships its own toolbar/UI, so it never fully feels native, and its
marks API (circular marks on bars) is far more limited than our marker spec
(profile-picture markers, clustering, BlackPebble hover cards). Touch behavior
is its own; our tap-to-activate scroll model can't be enforced cleanly.

**Verdict: rejected.** Approval risk, timeline risk, branding terms outside
our control, and it still would not do the custom overlay work for us.

### Option 2 — TradingView Lightweight Charts (+ our overlay layer)

- **License**: Apache 2.0, open source, free, no application or approval.
- **Attribution**: the license requires the NOTICE attribution and a link to
  tradingview.com. The library's built-in `attributionLogo` option renders a
  **small TradingView logo in the chart corner** and officially satisfies the
  requirement — exactly the "small normal corner attribution" the spec allows.
  No bottom billboard, nothing to hide, fully legal.
- **Data**: bring-your-own — we feed it our own candles (GeckoTerminal OHLCV
  through our backend). Price candles and MC candles both work (MC = price ×
  derived supply).
- **Theme**: fully themeable — dark background, subtle grid, muted axis
  labels, gold crosshair/hover accents all map to existing `chart-theme.ts`
  values.
- **Lines**: `series.createPriceLine()` gives horizontal lines with axis
  labels — Entry / Targets / Risk / Orders out of the box.
- **Markers**: `createSeriesMarkers` supports circle markers natively; for
  profile pictures, DS logos, "DB/DS" badges and clustering we implement a
  **custom primitive** (`ISeriesPrimitive` — official plugin API drawing on
  the chart canvas with time/price → pixel coordinate conversion). This is the
  supported, documented extension path, not a hack.
- **Touch/scroll**: `handleScroll` and `handleScale` options can be toggled at
  runtime via `applyOptions`. Chart starts fully passive (page scrolls over
  it), becomes interactive on an intentional tap/click, reverts on outside
  scroll. No mode UI needed. **This is impossible with any iframe option.**
- **Fullscreen / share cards**: it's a normal DOM component (works in an
  overlay modal like `ImageLightbox`), and `takeScreenshot()` returns a canvas
  — a clean base for share-card rendering later.
- **What it lacks**: built-in indicators and drawing tools (not in our spec)
  and any candle data (we supply it).

### Option 3 — Advanced Charts + custom overlay

Inherits all of Option 1's approval/branding risk, then adds the fragility of
syncing an external overlay to a closed rendering engine. Worst of both.

### Option 4 — Fully custom chart

Maximum control, zero attribution, but we would re-implement candle rendering,
axis math, zoom/pan physics, and crosshair behavior from scratch — weeks of
work to reach a quality bar Lightweight Charts gives us on day one. Only
justified if the corner logo were unacceptable; it is acceptable per the spec.

### ✅ Recommendation

**Option 2: Lightweight Charts base + a custom BlackPebble overlay layer**
(price lines via the native API; markers/clusters/hover cards via the official
series-primitive plugin API and a thin DOM layer for hover cards).

- Cost: **$0**. No approval, no licensing negotiation, no waiting.
- Legal: Apache 2.0 + NOTICE attribution + small corner `attributionLogo`.
- Bundle: ~45 KB gzipped, tree-shakeable.

---

## 3. Data architecture

### 3.1 Candle endpoint (new)

`GET /markets/:mint/candles?resolution=1m|5m|15m|1h|4h|1d[&before=ts]`

- Resolves the trusted pool via the existing `getBestPairs` logic in
  `lib/prices.ts` (same pool the price/MC/sparklines already use — no
  divergence between chart and header numbers).
- Fetches GeckoTerminal pool OHLCV (the same upstream `lib/sparklines.ts`
  already calls) but returns **full candles**:
  `{ t, o, h, l, c, v }[]` plus `{ supply }` (derived MC ratio) so the client
  can render price *or* MC candles from one payload.
- Caching mirrors the sparkline pattern: in-memory TTL keyed
  `(mint, resolution)` — 15–30s TTL for the active resolution keeps a token
  page at roughly one upstream call per half-minute.

**GeckoTerminal supported resolutions** (free API): second 1/15/30 (recent
history only), minute 1/5/15, hour 1/4/12, day 1. Limit 1000 candles/call.

Two caveats:

- **3m candles are not supported** upstream. The auto-timeframe ladder uses 1m
  for the 2–6h band (or aggregates 1m → 3m server-side, which is trivial and
  exact). Recommendation: start with 1m and add server-side 3m aggregation if
  1m feels too noisy.
- **Rate limit ~30 calls/min** on the free tier. Fine at current traffic with
  caching; a CoinGecko paid plan (500/min) is the scaling lever later. The
  endpoint should degrade gracefully (serve stale cache + retry header) rather
  than error.

Pre-migration bonding-curve tokens have no pool: keep the existing Chart.js
live line for them (unchanged behavior), switch to the new chart at migration.

### 3.2 Smart auto-timeframe

Token age comes from `TokenInfo.pairCreatedAt` (already on the page):

| Token age | Auto resolution | Upstream |
|---|---|---|
| < 30 min | 15s/30s (if `second` timeframe returns data for the pool; else 1m) | `second` agg 15/30 |
| 30 min – 2 h | 1m | `minute` agg 1 |
| 2 – 6 h | 1m (3m via server aggregation if added) | `minute` agg 1 |
| 6 – 24 h | 5m | `minute` agg 5 |
| > 24 h | 15m, initial visible range fitted to token life (capped) | `minute` agg 15 |

Never auto-select above 15m. Manual selection overrides and is remembered per
session (same `localStorage` pattern as today's `bp_chart_mode`).

### 3.3 Overlay data (per mint)

| Overlay | Source | Work needed |
|---|---|---|
| Avg Entry, position | existing positions query | none (client already has it) |
| Buy Limit / TP / SL / DCA lines | existing per-mint orders route | none |
| Perps Entry / Liquidation / TP / SL | existing leverage positions | none |
| My buy/sell markers | `GET /trade/history/:wallet` | add `?mint=` filter (small, mirrors orders route) |
| Calls | `GET /markets/:mint/intelligence` (`call_market_cap` + time) | raise limit / dedicated param |
| Theses | `theses` by mint (indexed) | time-anchored only; **add `market_cap_usd` snapshot column** so future theses get exact y-anchoring |
| Campaigns | `campaigns` + `campaign_events` | new `GET /campaigns/by-token/:mint/events`; add MC snapshot at event time going forward |
| Trader activity (other users) | `trades` table (has mint + MC + time) | new endpoint `GET /markets/:mint/trader-activity` returning public trades joined to profiles, reputation-ranked, capped (e.g. 50) |
| DEX Screener paid events | public API `GET api.dexscreener.com/orders/v1/solana/{mint}` → `{ type: tokenProfile\|communityTakeover\|tokenAd\|trendingBarAd, status, paymentTimestamp }` (60 rpm) | new cached backend fetch; boosts via `token-boosts` endpoints |
| Dev buy/sell | creator wallet (pump.fun creator / mint authority) + Helius parsed tx history | Phase 4 — real work, needs verification rules |
| KOL wallets | new admin-verified registry table + Helius | Phase 4+ — see risks |

One aggregate endpoint keeps the chart to a single fetch:
`GET /markets/:mint/chart-events` returning typed, time-anchored events
(kind, timestamp, MC-at-event when known, payload for the hover card). This is
deliberately shaped like feed events so the Feed, chart, notifications, and
future share cards consume the same event language.

---

## 4. Frontend architecture

```
<TokenChart>
 ├─ useCandles(mint, resolution, mode)        // TanStack Query → /candles
 ├─ useChartEvents(mint)                      // TanStack Query → /chart-events
 ├─ useMyChartLines(mint)                     // derived from existing queries
 ├─ LightweightChart (candlestick series, volume histogram)
 │    ├─ priceLines: Entry / Targets / Risk / Orders (createPriceLine)
 │    ├─ BPMarkerPrimitive (ISeriesPrimitive)  // circular markers, clustering
 │    └─ attributionLogo: true                 // small TV corner logo
 ├─ HoverCard layer (DOM, positioned from primitive hit-tests)
 ├─ Toolbar: resolution pills · Price/MC toggle · overlay filters (later) · fullscreen (later)
 └─ InteractionGate                            // passive ↔ active state
```

### Interaction gate (the touch model)

- **Passive (default)**: `handleScroll: false`, `handleScale: false` — wheel
  and touch events scroll the page; the chart never moves. Crosshair on hover
  still works (it doesn't consume scroll).
- **Activate**: a deliberate tap/click *on the chart* flips to interactive
  (`applyOptions` at runtime). No banner, no toggle, no hint text.
- **Deactivate**: any page scroll gesture originating outside the chart, or
  focus/tap outside, returns to passive.
- Touchscreen laptops follow the same pointer-type rules as mobile; desktop
  click-drag pans only in the active state; fullscreen mode is always active
  because opening it is intentional.

### Visual style

Reuses `chart-theme.ts` values: background `bg-card`, grid
`rgba(255,255,255,0.04)`, axis text `#a0a0a0`, crosshair + selected-line accent
`#c9a96e` (gold, sparingly), tooltip cards matching `bpTooltip` (dark, rounded,
gold title). Green/red (`success`/`danger` tokens) strictly for buy/sell,
profit/loss, TP/SL, dev buy/sell.

### Marker language (matches feed exactly)

All markers are small circles (~16–20 px), never rectangles over candles:

- Buy/sell (mine + others): green/red ring; others' show profile picture
  inside the ring (never the viewer's own).
- Dev Buy / Dev Sell: green "DB" / red "DS" monogram circles.
- Call: `Megaphone` accent circle. Thesis: `ScrollText` accent. Campaign:
  `Megaphone` accent with campaign-status dot. Achievement: rarity icon.
- Verified KOL: profile circle + small gold verified dot/ring.
- DEX Screener events: DS logo in a circle (see logo risk, §6).
- **Clustering**: markers within N pixels collapse into one circle with a
  count badge; tap/hover expands the cluster into a list card. Reputation
  ranks which avatars survive when space is limited.
- Hover (desktop) / tap (mobile) opens a BlackPebble-styled mini card with the
  exact copy patterns from the spec (event name, actor, MC/price, time, links).

### Line language (trader intent, not exchange jargon)

- **Entry**: Avg Entry (solid), Buy Limit / DCA Buy (dashed).
- **Targets**: Target 1/2/3 with sell % in the label ("Target 1 · $2.4M · sell 25%").
- **Risk**: Stop Loss, Break-even, Liquidation (perps), each visually distinct
  but quiet.
- **Orders**: pending manual orders.
- No "current position" banner line and no loud current-price line — the last
  candle + right-axis value already communicate that.

---

## 5. Phasing

**Phase 1 — Native chart replaces the iframe** *(the big win)*
Backend candle endpoint (+ pool resolution + caching). Lightweight Charts
candlestick + volume, BlackPebble theme, small TV corner attribution, Price/MC
toggle, smart auto-timeframe, interaction gate (scroll-safe touch model),
loading/error states. My lines: Avg Entry, Buy Limit, TP/SL, perps
Entry/Liq/TP/SL. My own buy/sell circle markers (add `?mint=` to history).
Hover/tap cards for lines and my markers.

**Phase 2 — Event layer**
`/chart-events` aggregate endpoint. Call + thesis + campaign markers
(campaign per-mint endpoint; MC snapshot columns for theses/campaign events
going forward). DEX Screener paid/boost markers from the public orders/boosts
APIs. Marker clustering. Overlay filter menu (settings popover, not a mode).

**Phase 3 — Social layer + fullscreen**
Public trader-activity endpoint (reputation-ranked, privacy-gated) →
profile-picture markers. Fullscreen chart modal (always-active interactions,
filters, event detail panel).

**Phase 4 — Advanced sources**
Dev buy/sell via creator-wallet detection + Helius tx parsing. Admin-verified
KOL wallet registry + markers. Share-card rendering from `takeScreenshot()` +
event metadata. Listing/discovery events (Pump.fun graduation, Raydium pool
creation, CoinGecko/CMC listings) — each only when a trusted verification
source exists.

---

## 6. Risks and open flags

1. **GeckoTerminal rate limits (medium)** — ~30 calls/min free. Mitigated by
   per-resolution caching and one-token-page-one-call design; the paid
   CoinGecko tier is the scaling path. The endpoint must serve stale data
   rather than fail.
2. **DEX Screener logo (flagged — decision needed before Phase 2)** — the
   orders/boosts *data* API is public and documented, but DEX Screener
   publishes no brand-asset license for third-party logo use. Per the spec: do
   not trace or approximate it. Options: (a) request permission / find an
   official press asset, or (b) ship a neutral circular "DS" monogram marker
   labeled "DEX Screener" until cleared. **Recommend (b) as the default and
   upgrade if permission is confirmed.**
3. **KOL wallet labeling / privacy (flagged — policy before Phase 4)** — only
   wallets that are user-linked (self-verified in BlackPebble) or
   admin-verified public figures may be labeled; no heuristic "this looks like
   a KOL" labeling, no doxing arbitrary wallets. Needs a small admin registry
   + audit trail. Hover cards must state the provenance ("BlackPebble trade" /
   "verified on-chain wallet" / "admin-verified KOL").
4. **Trader-activity privacy (medium)** — reuse the feed's existing visibility
   semantics; only trades that are already public in the feed can appear as
   chart markers. Viewer's own marker hidden by design.
5. **Sub-minute candles for brand-new tokens (low)** — the `second` timeframe
   covers recent history only and may be empty for some pools; the ladder
   falls back to 1m automatically.
6. **3m candles unsupported upstream (low)** — use 1m or aggregate
   server-side.
7. **Thesis/campaign y-anchoring (low)** — historical rows lack MC snapshots;
   markers anchor to the candle at their timestamp (correct x, approximate y),
   exact for all new rows once snapshot columns land.

## 7. What changes in current code

- `components/tradingview-chart.tsx`: replaced by the new native `TokenChart`
  (the pre-migration Chart.js line in `trading.tsx` stays).
- New backend: `lib/candles.ts` (+ route), `?mint=` on trade history,
  `/markets/:mint/chart-events`, campaign per-mint events route.
- Schema (additive, runtime DDL as usual): `theses.market_cap_usd`,
  `campaign_events.market_cap_usd`; later a `verified_wallets` registry.
- New frontend dep: `lightweight-charts` (Apache 2.0, ~45 KB gz) + NOTICE
  attribution in the repo and the corner `attributionLogo` enabled.
- Existing sparkline/pool-resolution/caching infra is reused, not duplicated.
