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

export function fmtUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (abs > 0 && abs < 0.01) return `$${value.toExponential(2)}`;
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

export function fmtPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs < 0.000001) return value.toExponential(2);
  if (abs < 1) return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function shortAddr(addr: string | null | undefined, chars = 4): string {
  if (!addr) return "";
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
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
