---
name: More menu provider pattern (conditional rows + scroll-close)
description: How token-page "More" external-link menu handles conditional visibility, z-index vs sticky header, and sourcing unverified third-party URL formats.
---

The More menu (`more-menu.tsx`) `PROVIDERS` array supports an optional
`isVisible(ctx)` predicate per entry so a row can be conditionally shown
(e.g. a "Pump.fun" link only for tokens that actually originate on Pump.fun —
bonding curve `source: "pumpportal"` implies `isMigrated=false`, or migrated
dexId is `pumpfun`/`pump-fun`/`pumpswap`). Default (no predicate) = always
visible. This keeps the "append one object, no other code changes" contract
mostly intact while allowing gating.

**Why:** Some providers only make sense for a subset of tokens; hardcoding
them unconditionally would produce dead/wrong links for unrelated tokens.

**Sticky-header overlap bug:** the dropdown is `position: absolute` inside
non-fixed flow, so it scrolls with the page. It was previously `z-40`, tying
with the fixed sticky header (`z-40`) and winning paint order due to later
DOM position — causing it to visually float over the header. Fixed by (1)
adding a `window.addEventListener("scroll", ..., {capture:true, passive:true})`
that closes the menu on any scroll, and (2) lowering the dropdown's z-index
below the header's (`z-20` vs header `z-40`) as a second line of defense.

**Sourcing unverified third-party URL formats/logos:** when a provider's
token-deep-link format isn't already verified in code, use a background
explore/web-search subagent to check before hardcoding — confirm via
`extractBranding`/direct `fetch` that the domain is legit and, where
possible, fetch a real static asset (SPA sites often return the app shell
HTML for guessed asset paths like `/favicon.svg` — try alternate static
paths like `/apple-touch-icon.png` on the canonical brand domain).

**Cloudflare-protected brand asset domains (e.g. gmgn.ai, photon-sol.tinyastro.io):**
direct `fetch`/curl of their static SVG/PNG paths returns a "Just a moment..."
403 challenge page even with Referer/User-Agent headers. Workaround: fetch the
exact same asset URL via `https://web.archive.org/web/2024/<url>` (Wayback
Machine mirrors bypass the live challenge). Also useful: a live site's inline
`<img>`/data-URI logo returned by `extractBranding` can itself be the exact
official vector (e.g. Jupiter's header logo is an inline SVG data URI = their
real icon). For combined wordmark+icon SVGs (icon glyph + text in one file,
common pattern: icon paths at low x-coordinates, text path(s) at higher
x-coordinates), crop to just the icon's `<path>`/`<circle>` elements and a
tightened `viewBox` to get a true vector square mark instead of using a raster
screenshot crop — render with local ImageMagick (`magick -background <color>
-density 300 in.svg out.png`, no `sharp`/`rsvg-convert` in this environment)
to visually confirm the crop isolates the icon correctly before adopting it.
