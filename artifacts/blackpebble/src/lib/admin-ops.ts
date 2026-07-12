/**
 * Pure helpers for the Admin Operations Center. No React / DOM / network here so
 * the status + export logic is unit-testable in isolation.
 */

export type StatusLevel = "healthy" | "warning" | "critical" | "unknown";

export interface StatusMeta {
  label: string;
  /** Tailwind dot background. Red is reserved for `critical` only. */
  dot: string;
  text: string;
}

export const STATUS_META: Record<StatusLevel, StatusMeta> = {
  healthy: { label: "Healthy", dot: "bg-emerald-400", text: "text-emerald-400" },
  warning: { label: "Warning", dot: "bg-amber-400", text: "text-amber-400" },
  critical: { label: "Critical", dot: "bg-red-400", text: "text-red-400" },
  unknown: { label: "Unknown", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

/** Worst (most severe) of a set of statuses, for rolling up a section. */
export function worstStatus(levels: StatusLevel[]): StatusLevel {
  const order: StatusLevel[] = ["critical", "warning", "unknown", "healthy"];
  for (const l of order) if (levels.includes(l)) return l;
  return "healthy";
}

/**
 * Freshness status from a last-updated timestamp (accepts unix seconds or ms).
 * `null`/absent → unknown (never assume healthy). Older than `criticalSec` →
 * critical; older than `warnSec` → warning; otherwise healthy.
 */
export function freshnessStatus(
  ts: number | null | undefined,
  warnSec: number,
  criticalSec: number,
  nowMs: number = Date.now(),
): StatusLevel {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return "unknown";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const ageSec = Math.max(0, (nowMs - ms) / 1000);
  if (ageSec >= criticalSec) return "critical";
  if (ageSec >= warnSec) return "warning";
  return "healthy";
}

/** DB latency → status. null → unknown. */
export function latencyStatus(
  ms: number | null | undefined,
  warnMs = 250,
  criticalMs = 1000,
): StatusLevel {
  if (ms == null || !Number.isFinite(ms)) return "unknown";
  if (ms >= criticalMs) return "critical";
  if (ms >= warnMs) return "warning";
  return "healthy";
}

/** A simple boolean up/down probe → status. undefined → unknown. */
export function boolStatus(
  ok: boolean | null | undefined,
  downLevel: StatusLevel = "critical",
): StatusLevel {
  if (ok == null) return "unknown";
  return ok ? "healthy" : downLevel;
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  let s: string;
  if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  // Escape per RFC 4180 when the cell contains a comma, quote or newline.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Serialize an array of flat records to CSV. Columns are the union of keys in
 * first-seen order. Safe for spreadsheet import (RFC 4180 quoting).
 */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const header = cols.map(csvCell).join(",");
  const body = rows
    .map((r) => cols.map((c) => csvCell(r[c])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

/** Trigger a client-side file download of `content` (browser only). */
export function downloadFile(
  filename: string,
  content: string,
  mime = "text/plain",
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
