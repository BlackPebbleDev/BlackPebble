/**
 * Display helpers local to the Trade Planner. Output-only formatting — parsing
 * lives in src/lib/trade-planner.ts. Keeps brand rules in one place so future
 * planner modules format identically.
 */
import { fmtMarketCap, fmtPrice } from "@/lib/format";
import type { InputMode, Unit } from "@/lib/trade-planner";

/** Format a valuation for display: compact market cap or token price. */
export function fmtValuation(
  value: number | null | undefined,
  mode: InputMode,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return mode === "marketcap" ? fmtMarketCap(value) : fmtPrice(value);
}

/** SOL amount with a trailing unit, 2–4 decimals. */
export function fmtSolAmt(value: number | null | undefined): string {
  return fmtUnitAmt(value, "SOL");
}

/**
 * Unit-aware amount: "2.00 SOL" in SOL mode, "$100.00" in USD mode.
 * 2–4 decimal places (more for sub-1 SOL values, always 2 for USD).
 */
export function fmtUnitAmt(value: number | null | undefined, unit: Unit): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (unit === "USD") {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  const digits = abs > 0 && abs < 1 ? 4 : 2;
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} SOL`;
}

/** Plain percent, no leading + sign: "20%", "12.5%". */
export function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const s = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
  return `${s}%`;
}

/** Risk/reward ratio as "20R", "2.5R". */
export function fmtRR(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const s = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
  return `${s}R`;
}

/** Risk/reward ratio as "1 : 4.2". Used by the compact Mini Planner. */
export function fmtRatioOneTo(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return `1 : ${value.toFixed(1)}`;
}

/** Multiple as "5×", "12.5×". */
export function fmtMult(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  const s = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
  return `${s}×`;
}
