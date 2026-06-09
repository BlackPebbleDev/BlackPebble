# Public Trader Profiles — Implementation Plan

Status: **scaffolded** (route + placeholder page live; full implementation pending).

The route `/trader/:id` is registered and rendered by
`src/pages/trader-profile.tsx`, and leaderboard rows link to it via the
`profileId()` helper in `src/pages/leaderboard.tsx`. The page is currently a
placeholder. This document captures the plan for the full, login-free public
trader profile (a public paper-trading portfolio).

## Goals

- A login-free, shareable, SEO-friendly page showing a trader's public
  paper-trading portfolio and track record.
- Because all balances and trades are simulated paper-trading data, the public
  profile may show the trader's full paper portfolio. It must still never expose
  real-wallet custody data, account secrets, admin/internal fields, or synthetic
  internal keys.

## The `:id` scheme

`profileId(entry)` derives a public, non-sensitive identifier:

1. Public X handle (`x_username`, `@` stripped) when present.
2. Otherwise the real wallet address (already public on-chain).
3. Otherwise `null` — synthetic internal keys (`x:<id>`) are **never** placed in
   a URL, and those rows are not linkable.

The full implementation must keep this rule: the public id is either a real X
handle or a real wallet address. The backend lookup must accept both forms and
404 anything that resolves to a synthetic `x:<id>` key so internal keys never
round-trip through the URL.

## Public profile data model (the full set of fields to plan for)

The profile is a public paper-trading portfolio. Plan to surface all of:

- **Identity / X profile link** — display name, X handle, avatar, and an
  outbound link to the trader's x.com profile; graduation tier badge.
- **Equity** — total paper-portfolio value (cash + value of open positions).
- **Cash** — available (uninvested) virtual SOL balance.
- **P&L** — realized and unrealized P&L (SOL and USD), plus best trade.
- **ROI** — return on investment, consistent with leaderboard semantics.
- **Rank** — current leaderboard rank (optionally per period: daily / weekly /
  all-time).
- **Open positions** — current paper positions (token, size, average entry,
  current price, unrealized P&L / ROI).
- **Pending orders** — open limit / TP / SL orders attached to positions.
- **Trade history** — recent closed trades (token, side, realized P&L, ROI,
  timestamp), paginated/capped.
- **Equity chart** — time series of paper-portfolio equity for a visual track
  record.

## Backend (api-server)

Add a public, unauthenticated, read-only endpoint, e.g.:

```
GET /api/traders/:id
```

- Resolve `:id`: if it matches a known `x_username`, look up by that; otherwise
  treat it as a wallet address. Reject/404 anything resolving to a synthetic
  `x:<id>` key.
- Return ONLY the public paper-trading fields in the data model above:
  identity + X link, equity, cash, P&L (realized/unrealized), ROI, rank, open
  positions, pending orders, trade history, and equity-chart series.
- Respect the same minimum-trades gating as the leaderboard (e.g. 404 / "not
  ranked yet" below threshold) so profiles only exist for ranked traders.
- Read-only. No mutations. No auth required. Never expose real-wallet custody
  data, session/account secrets, admin fields, or internal keys.

## Frontend (blackpebble)

Replace the placeholder in `src/pages/trader-profile.tsx` with:

- A TanStack Query fetch to `GET /api/traders/:id`.
- Header: avatar, display name, X handle linking out to x.com, graduation tier
  badge — reuse `Trader`-style presentation and `TierBadge`.
- Summary stat grid reusing `PnlAmount`, `fmtPercent`, and `pnlClass`: equity,
  cash, realized/unrealized P&L, ROI, rank, best trade.
- Open positions list and pending orders list.
- Equity chart (reuse the project's existing chart approach).
- Recent closed-trades history list.
- Loading, empty/not-ranked, and 404 states (mirror leaderboard styling).
- Keep black/gold styling; numbers in `font-mono`; emerald/red for P&L sign.

## SEO

- `/trader/:id` is dynamic; do not enumerate profiles in `sitemap.xml`. Rely on
  internal links from the leaderboard instead.
- Set per-profile `<title>`/meta via a small head effect (already setting
  `document.title`).

## Out of scope (do NOT build here)

- No real SOL custody or real-money features (paper trading only).
- No Community Boost Pool / DEX boost pools.
- No private/admin data, account secrets, or internal keys on the public
  profile.
