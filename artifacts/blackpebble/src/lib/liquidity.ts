/**
 * Liquidity-impact color bands, shared by the spot and leverage trade panels so
 * the same percentage always reads the same color. Bands:
 *   green  0–1%   · low impact
 *   yellow 1–3%   · moderate
 *   orange 3–5%   · high
 *   red    5%+    · severe
 *
 * Purely presentational - these never change how a trade is priced or filled.
 */
export type ImpactBand = "low" | "moderate" | "high" | "severe";

export function impactBand(percent: number | null | undefined): ImpactBand {
  const p = percent ?? 0;
  if (p >= 5) return "severe";
  if (p >= 3) return "high";
  if (p >= 1) return "moderate";
  return "low";
}

/** Tailwind text-color class for a liquidity-impact percentage. */
export function impactColor(percent: number | null | undefined): string {
  switch (impactBand(percent)) {
    case "severe":
      return "text-danger";
    case "high":
      return "text-orange-400";
    case "moderate":
      return "text-yellow-400";
    default:
      return "text-success";
  }
}

/** Compact display for a liquidity-impact percentage (handles sub-0.01%). */
export function fmtImpact(percent: number | null | undefined): string {
  const p = percent ?? 0;
  if (!Number.isFinite(p)) return "—";
  if (p > 0 && p < 0.01) return "<0.01%";
  return `${p.toFixed(2)}%`;
}
