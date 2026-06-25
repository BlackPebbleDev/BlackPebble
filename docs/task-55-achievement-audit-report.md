# Task #55 — Achievement Experience Polish & Integrity Audit

_BlackPebble · Solana paper-trading · `artifacts/blackpebble` (Vite React SPA) +
`artifacts/api-server` (Express) · pnpm monorepo · deployed blackpebble.fun_

Scope was **additive only**: no destructive schema or migrations; no changes to
Live PnL / trading / portfolio / markets / sparkline logic; Founder & BP Team
badges and the reputation calculation were preserved.

---

## 1. Root cause (both high-priority bugs)

The badge system was **PULL-based**. Achievement rows in `user_achievements`
were only minted as a side effect of `getUserBadges`, which historically ran only
when someone opened a profile/badges view. The activity feed is a live UNION over
`user_achievements`, so:

- **Thesis publish produced no feed card** — the row did not exist until a profile
  view, so the feed had nothing to surface.
- **Watchlist Builder never appeared to unlock** — same reason; the unlock was
  real but unpersisted until a profile fetch.

The fix converts minting to **PUSH-based**: each qualifying action fires a
non-blocking mint, so the unlock persists immediately and surfaces in the feed
without a refresh.

## 2. New module: `lib/badge-mint.ts`

- `mintBadgesForUser(idOrHandle)` — assembles the **exact** `BadgeStatsInput` the
  profile/badges route builds (`getProfile` + `getCallerStats`) and calls
  `getUserBadges`, so thresholds evaluated here are identical to those on the
  profile. Returns early for users without a public (X-authenticated) profile —
  matching the rest of the system, whose feed/achievement union is X-identity
  gated.
- `mintBadgesAsync(idOrHandle)` — fire-and-forget; never blocks the request and
  never throws (errors logged + swallowed).
- `mintBadgesForWalletAsync(wallet)` — wallet-keyed variant for wallet-scoped
  routes; resolves the internal user id via `user_identities (provider='wallet')`,
  no-op for unlinked wallets.

## 3. Idempotency / integrity

Minting still funnels through `getUserBadges`, whose insert is
`INSERT ... ON CONFLICT DO NOTHING`. Repeated triggers (e.g. multiple trades) can
never create duplicate achievement rows or re-fire a feed card for an
already-earned badge.

## 4. Non-blocking guarantee

Every wired call site uses the `*Async` (fire-and-forget) variant. A mint
failure is caught and logged (`logger.warn`) and can never break or delay the
user-facing request that triggered it (thesis create, trade, etc.).

## 5. Qualifying actions now wired to mint

| Action | Route | Trigger key |
| --- | --- | --- |
| Publish thesis | `POST /theses` | by user id |
| Create callout | `POST /profiles/me/callouts` | by user id |
| Follow a user | follow route | **target** user id (`String(req.params.id)`) |
| Update bio | `PUT` profile bio | by user id |
| Execute trade (buy + sell) | `POST /trade/execute` | by wallet, gated on `result.ok` |
| Add to watchlist | `POST /trade/watchlist/add` | by wallet |
| Recovery event | `POST /recovery/events` | by wallet, gated on `verification?.verified` |
| X login / profile refresh | `upsertXUser` (auth-x) | by user id, after commit (covers `profile_complete` once avatar + bio present) |

## 6. High-priority bug A — thesis → feed card (FIXED)

`POST /theses` now mints immediately after a successful create. The
thesis-related achievement row is written at action time, so the feed UNION
returns the card on the very next feed read — no profile view required.

## 7. High-priority bug B — Watchlist Builder (FIXED)

`POST /trade/watchlist/add` now mints by wallet immediately after the successful
upsert, so the `watchlist_builder` badge unlocks at the moment the watchlist
threshold is crossed.

> Note: `watchlist_builder` and `profile_complete` are in `NON_FEED_BADGE_KEYS`
> (feed:false) **by design** — they unlock and appear on the profile but do not
> post a feed card. This is intentional and was preserved.

## 8. Avatar/profile-complete gap (closed after review)

The architect review flagged that avatar updates happen in `auth-x.ts` and were
not minting. Added a post-commit `mintBadgesAsync(payload.sub)` in `upsertXUser`
so `profile_complete` (bio + avatar) mints on the next login/profile refresh. The
mint runs **after** the transaction commits so it reads the freshly-written
avatar/bio.

## 9. Admin integrity endpoint: `GET /admin/achievements/audit`

Returns a live catalogue-integrity snapshot:

- **`hasUnlockPath`** — `evaluateBadges` is pure and key-stable, so a zeroed
  `BadgeMetrics` enumerates every reachable unlock path; each definition is
  checked against that key set.
- **`feedEligible`** — `!NON_FEED_BADGE_KEYS.includes(key)`.
- **`holders` / `globalEarnedPercent` / `firstEarnedAt`** — per badge, from
  `user_achievements`.
- **Integrity violations** — `definitionsWithoutPath` (defined but unreachable)
  and `evaluatorsWithoutDefinition` (evaluated but uncatalogued); both should be
  empty in a healthy catalogue.

## 10. Catalogue ↔ evaluator consistency

Verified that every key in `BADGE_DEFINITIONS` has a matching `evaluateBadges`
branch and vice-versa (no orphan definitions, no unreachable evaluator keys). The
audit endpoint makes this an ongoing, queryable check rather than a one-off.

## 11. Premium card redesign — `achievement-badge.tsx`

- ~20–30% smaller / denser footprint: padding `p-3 → px-2 py-2.5`, medallion
  `h-12 w-12 → h-9 w-9`, name `text-xs → text-[11px]`, rarity label
  `text-[9px] → text-[8px]`, tighter gaps — the catalogue now reads like a trophy
  case rather than a sparse grid.
- Metallic rarity treatment: per-rarity medallion **gradient** (`medallion`),
  rarity-tinted card **border** accent (`border`), retained glow, plus a faint
  corner **foil sheen** on epic/legendary for a collectible feel.
- Preserved: share entry point, progress bar, `justUnlocked` shimmer, locked
  greyscale + lock overlay, and the public `RARITY_META` (incl. `.chip` / `.label`
  consumed by `profile.tsx`), `rarityOf`, and `AchievementBadge` exports.

## 12. Better icon mapping

- Added richer lucide icons to the resolver (`Crown`, `Gem`, `Shield`, `Medal`,
  `Zap`) — additive, existing hints unaffected.
- Differentiated the three legendary capstones (previously all `Trophy`): server
  hints `top_100_trader → Crown`, `whale_pnl → Gem`. Display-only; no stored
  values, rank, or trust math touched.

## 13. Feed achievement card improvements — `feed-card.tsx`

The card already carried icon, rarity color/tint, timestamp, title, and rarity
label. Added a **rarity-flavored medallion icon** (`Crown` for legendary, `Gem`
for epic, `Medal` otherwise) so a legendary unlock reads premium in the feed.
`globalEarnedPercent` is **not** rendered in the feed card because it is not part
of the feed payload — surfacing it there would require expanding the feed UNION,
which is out of the additive scope; it is available via the admin audit endpoint.

## 14. Mobile / responsiveness

The badge grid is layout-owned by `profile.tsx` (unchanged); the denser tile
reduces overflow pressure. The feed achievement card uses
`flex-wrap` on its meta row and `min-w-0 flex-1` on the body, so the rarity chip
and "View on X" link wrap cleanly with no horizontal scroll on narrow viewports.

## 15. Verification

- `pnpm --filter @workspace/api-server exec tsc --noEmit` → clean.
- `pnpm --filter @workspace/blackpebble exec tsc --noEmit` → clean.
- `artifacts/api-server: API Server` workflow restarted (no-watch build); booted
  clean (listening, PumpPortal connected, no errors).
- App preview renders without console errors.
- Architect (`evaluate_task`, `includeGitDiff`) → **PASS**; the one material gap
  it raised (avatar `profile_complete`) was closed (§8). No security findings; no
  do-not-touch surfaces were modified.

---

### Do-not-touch surfaces — confirmed untouched

Live PnL, trade/portfolio accounting, markets, and sparkline logic received no
changes; trade/recovery edits are additive post-success hooks only. Founder & BP
Team badges and the reputation calculation are unchanged.
