export function fmtSol(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  let d = digits;
  if (abs > 0 && abs < 1) d = Math.max(digits, 4);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/** Compact shorthand for large USD amounts: $50K, $1.2M, $15M. Never scientific notation. */
export function fmtMarketCap(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Same compact shorthand as fmtMarketCap, for volume columns. */
export const fmtVolume = fmtMarketCap;

/** Generic USD display - compact for large values, fixed decimals for small. Never scientific. */
export function fmtUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function fmtTokenAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return fmtNum(value);
}

export function fmtPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/**
 * Sanity ceiling for an *externally-sourced* market percentage - e.g. a token's
 * 24h price change pulled from DexScreener. A legitimate 24h move never reaches
 * this; a value beyond it means the upstream pair data is corrupt (wrong/junk
 * pool), so we surface "Data Error" instead of an impossible number like
 * +520,651%. Deliberately NOT applied to position/portfolio P&L, where a paper
 * memecoin position can legitimately exceed 1000× (100,000%).
 */
export const PERCENT_SANITY_CEILING = 100_000;

/** True when a percentage is present, finite and within the sanity ceiling. */
export function isPercentSane(value: number | null | undefined): boolean {
  return (
    value != null &&
    Number.isFinite(value) &&
    Math.abs(value) <= PERCENT_SANITY_CEILING
  );
}

/**
 * Percentage display for externally-sourced market data, with a sanity guard:
 * - null / non-finite  -> "—"          (no data available yet)
 * - |value| > ceiling  -> "Data Error" (obviously corrupt upstream value)
 * - otherwise          -> normal signed percent
 */
export function fmtPercentSafe(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) > PERCENT_SANITY_CEILING) return "Data Error";
  return fmtPercent(value, digits);
}

/**
 * Shared premium V2 colour for a performance multiple. Restrained palette —
 * green for winners, rose for losers, neutral foreground near break-even - so
 * the feed reads at a glance without a casino look. "Near 1.0x" (0.95–1.05) is
 * treated as neutral so noise around break-even doesn't flicker red/green.
 */
export function multipleTone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0)
    return "text-muted-foreground";
  if (value >= 1.05) return "text-success";
  if (value <= 0.95) return "text-rose-400";
  return "text-foreground";
}

/**
 * Token price display - never scientific notation.
 * $0.0000118   $0.25   $1.42   $1,234
 */
export function fmtPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000) {
    return `$${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  if (abs >= 1) {
    const s = abs.toFixed(4).replace(/\.?0+$/, "");
    return `$${sign}${s}`;
  }
  if (abs >= 0.001) {
    const s = abs.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `$${sign}${s}`;
  }
  // Very small: count leading fractional zeros to decide how many decimal places.
  // e.g. 0.0000118 -> floor(log10(0.0000118)) = -5 -> need 5+4 = 9 decimal places
  const leadingZeros = -Math.floor(Math.log10(abs));
  const decimalPlaces = Math.min(leadingZeros + 4, 12);
  const s = abs.toFixed(decimalPlaces).replace(/0+$/, "").replace(/\.$/, "");
  return `$${sign}${s}`;
}

export function shortAddr(addr: string | null | undefined, chars = 4): string {
  if (!addr) return "";
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

/**
 * Build a public X (Twitter) profile URL from a handle. Returns null when the
 * handle is missing/blank so callers never render a broken or `undefined` link.
 * Strips any leading `@` and URL-encodes the handle.
 */
export function xProfileUrl(
  username: string | null | undefined,
): string | null {
  const handle = username?.trim().replace(/^@+/, "");
  if (!handle) return null;
  return `https://x.com/${encodeURIComponent(handle)}`;
}

export function timeAgo(tsSeconds: number | null | undefined): string {
  if (!tsSeconds) return "";
  const ms = tsSeconds > 1e12 ? tsSeconds : tsSeconds * 1000;
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function pnlColor(value: number | null | undefined): string {
  if (value == null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-success" : "text-danger";
}

/**
 * pnlColor variant for externally-sourced market percentages: an out-of-range
 * or invalid value (rendered as "Data Error" by fmtPercentSafe) is shown
 * neutral rather than misleadingly green/red.
 */
export function pnlColorSafe(value: number | null | undefined): string {
  if (!isPercentSane(value)) return "text-muted-foreground";
  return pnlColor(value);
}

/**
 * Signed SOL amount for P&L, with an explicit +/- so direction reads at a
 * glance: "+0.2383", "-1.20". Mirrors fmtSol's decimal rules.
 */
export function fmtSignedSol(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${fmtSol(Math.abs(value), digits)}`;
}

/**
 * Signed USD amount for P&L, with the sign before the $ and the same compact
 * shorthand as fmtUsd: "+$34.21", "-$1.20M".
 */
export function fmtSignedUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  let body: string;
  if (abs >= 1_000_000_000) body = `${(abs / 1_000_000_000).toFixed(2)}B`;
  else if (abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) body = `${(abs / 1_000).toFixed(1)}K`;
  else
    body = abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return `${sign}$${body}`;
}

/**
 * Market-cap multiple, e.g. current MC / avg entry MC -> "3.24×".
 * Returns "—" when either input is missing so it never shows a misleading 0.
 */
export function fmtMultiple(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return `${value.toFixed(2)}×`;
}

/**
 * Compact hold-time since a position opened: "3d 4h", "5h 12m", "8m".
 * Accepts seconds (or ms) epoch like the rest of format.ts.
 */
export function fmtHoldTime(tsSeconds: number | null | undefined): string {
  if (!tsSeconds) return "—";
  const ms = tsSeconds > 1e12 ? tsSeconds : tsSeconds * 1000;
  let s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
