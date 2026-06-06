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

/** Generic USD display — compact for large values, fixed decimals for small. Never scientific. */
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
 * Token price display — never scientific notation.
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
  return value > 0 ? "text-emerald-400" : "text-red-400";
}
