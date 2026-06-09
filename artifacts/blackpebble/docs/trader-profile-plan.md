# Public Trader Profiles — Implementation Plan

Status: **scaffolded** (route + placeholder page live; full implementation pending).

The route `/trader/:id` is registered and rendered by
`src/pages/trader-profile.tsx`, and leaderboard rows link to it via the
`profileId()` helper in `src/pages/leaderboard.tsx`. The page is currently a
placeholder. This document captures the plan for the full, login-free public
trader profile.

## Goals

- A login-free, shareable, SEO-friendly page showing a trader's public
  paper-trading track record.
- Only ever expose data that is already public on the leaderboard. No private
  account data, no real wallet custody data, no admin/internal fields.

## The `:id` scheme

`profileId(entry)` derives a public, non-sensitive identifier:

1. Public X handle (`x_username`, `@` stripped) when present.
2. Otherwise the real wallet address (already public on-chain).
3. Otherwise `null` — synthetic internal keys (`x:<id>`) are **never** placed in
   a URL, and those rows are not linkable.

The full implementation must keep this rule: the public id is either a real X
handle or a real wallet address. The backend lookup must accept both forms.

## Backend (api-server)

Add a public, unauthenticated, read-only endpoint, e.g.:

```
GET /api/traders/:id
```

- Resolve `:id` to a trader: if it matches a known `x_username`, look up by that;
  otherwise treat it as a wallet address. Reject/404 anything that resolves to a
  synthetic `x:<id>` key so internal keys never round-trip through the URL.
- Return ONLY public fields, mirroring what the leaderboard already exposes:
  - Display name, X handle, avatar url (public profile bits).
  - Aggregate stats: realized P&L, ROI, win rate, total closed trades, best
    trade, current graduation tier, rank (optional, per period).
  - A capped list of recent **closed** trades (token, side, realized P&L, ROI,
    timestamp) — closed trades only, matching leaderboard semantics. No open
    positions, no balances, no order book, no wallet internals.
- Respect the same minimum-trades gating as the leaderboard (e.g. 404 / "not
  ranked yet" if below the threshold) so profiles only exist for ranked traders.
- Read-only. No mutations. No auth required. No rate-limited secrets exposed.

## Frontend (blackpebble)

Replace the placeholder in `src/pages/trader-profile.tsx` with:

- A TanStack Query fetch to `GET /api/traders/:id`.
- Header: avatar, display name, X handle (linking out to x.com), graduation tier
  badge — reuse `Trader`-style presentation and `TierBadge`.
- Stat grid reusing `PnlAmount`, `fmtPercent`, and `pnlClass` for consistency
  with the leaderboard (P&L, ROI, win rate, trades, best trade).
- Recent closed-trades list.
- Loading, empty/not-ranked, and 404 states (mirror leaderboard styling).
- Keep black/gold styling; numbers in `font-mono`; emerald/red for P&L sign.

## SEO

- Add `/trader/:id` patterns are dynamic; do not enumerate them in
  `sitemap.xml`. Instead rely on internal links from the leaderboard.
- Optionally add per-profile `<title>`/meta via a small head effect (already
  setting `document.title`).

## Out of scope (do NOT build here)

- No real SOL custody or real-money features.
- No Community Boost Pool / DEX boost pools.
- No private/admin data on the public profile.
