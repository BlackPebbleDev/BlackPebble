/**
 * Centralized live-market polling cadences (milliseconds).
 *
 * One place to tune how often each surface re-fetches so PnL/valuation track the
 * chart without manual refresh. The server caches the underlying DexScreener
 * pair (~3s) and recomputes valuations on every read, so polling cadence ==
 * valuation freshness. React Query pauses interval refetches while the tab is
 * hidden (refetchIntervalInBackground defaults to false) and keeps the last
 * successful data on a failed refetch, so these are safe to run aggressively on
 * the active token without hammering APIs or wiping values to zero.
 *
 * Tiering: the actively-viewed token (where the user is watching the chart) polls
 * fastest; portfolio-wide reads that value every position run slightly slower to
 * keep external load bounded.
 */
export const LIVE_MS = {
  /** The token currently open on the trading desk (price / MC / chart context). */
  activeToken: 4_000,
  /** Open spot positions valued on the active trading desk. */
  positions: 6_000,
  /** Open leverage positions valued on the active trading desk. */
  leverage: 6_000,
  /** Buy/sell preview quote while the panel is open. */
  quote: 8_000,
  /** Recent live trades feed for the active token. */
  trades: 5_000,
  /** Portfolio page totals + every-position valuation (heavier, so slower). */
  portfolio: 12_000,
  /** Single-position detail page valuation. */
  positionDetail: 8_000,
} as const;
