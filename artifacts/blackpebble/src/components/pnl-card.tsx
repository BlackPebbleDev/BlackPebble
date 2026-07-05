/**
 * PnLCard - PLACEHOLDER / TODO architecture for shareable trade PnL cards.
 *
 * ⚠️ Not wired into the app yet and intentionally renders nothing. This file
 * only defines the intended data contract and component surface so the social
 * sharing feature can be built later without re-deciding the shape.
 *
 * DO NOT implement share/export logic here yet.
 *
 * Planned capabilities (future):
 *  - BlackPebble branding (logo + black/graphite/gold theme)
 *  - User avatar + X username (sourced from the `user_identities` table)
 *  - Entry price / exit price
 *  - PnL % (e.g. +248% / -35%)
 *  - PnL $ (realized profit/loss)
 *  - X multiplier (e.g. +4.2X / 0.65X)
 *  - Render-to-image export sized for sharing on X (e.g. 1200x675)
 */

export interface PnLCardData {
  /** Token being shown. */
  tokenSymbol: string;
  tokenName?: string | null;
  tokenLogo?: string | null;
  /** Identity overlay (optional - falls back to wallet display). */
  avatarUrl?: string | null;
  xUsername?: string | null;
  /** Trade economics. */
  entryPriceUsd: number;
  exitPriceUsd: number;
  pnlPercent: number;
  pnlUsd: number;
  /** Multiplier on entry, e.g. 4.2 -> "+4.2X", 0.65 -> "0.65X". */
  multiplier: number;
}

/**
 * TODO: implement the shareable card UI + html-to-image export.
 * Renders nothing today by design.
 */
export function PnLCard(_props: { data: PnLCardData }): null {
  return null;
}
