/**
 * TradingView external-link resolution.
 *
 * BlackPebble tracks Solana memecoins, the vast majority of which have no
 * TradingView listing. To keep the "View on TradingView" link honest we only
 * ever surface it for assets we KNOW TradingView lists — a curated allowlist
 * keyed by mint address. We never construct a TradingView URL for an unlisted
 * low-cap token (that would produce a dead / misleading link), so the link is
 * simply absent for tokens not in this map.
 *
 * Extending: add a mint → TradingView symbol entry once you've confirmed the
 * asset resolves at https://www.tradingview.com/symbols/<SYMBOL>/.
 */
const TRADINGVIEW_SYMBOLS: Record<string, string> = {
  // Wrapped SOL
  So11111111111111111111111111111111111111112: "SOLUSD",
  // USD Coin
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDCUSD",
  // Tether USD
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDTUSD",
};

/** The TradingView symbol for a mint, or null when the asset isn't listed. */
export function tradingViewSymbolForMint(
  mint: string | null | undefined,
): string | null {
  if (!mint) return null;
  return TRADINGVIEW_SYMBOLS[mint] ?? null;
}

/** Canonical TradingView symbol page URL. */
export function tradingViewUrl(symbol: string): string {
  return `https://www.tradingview.com/symbols/${encodeURIComponent(symbol)}/`;
}
