import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradeQuote } from "@/lib/api";

/**
 * Reusable pre-trade warning card. Infrastructure shared by the spot and
 * leverage panels so any execution-cost caution reads consistently. Purely
 * advisory — it never blocks or alters a trade.
 */
export type WarningTone = "caution" | "danger";

export interface TradeWarning {
  id: string;
  tone: WarningTone;
  title: string;
  message: string;
}

export function TradeWarningCard({ warning }: { warning: TradeWarning }) {
  const danger = warning.tone === "danger";
  return (
    <div
      data-testid={`trade-warning-${warning.id}`}
      className={cn(
        "flex items-start gap-2 border px-3 py-2 text-xs",
        danger
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-300",
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <div className="font-medium">{warning.title}</div>
        <div className="text-[11px] leading-relaxed opacity-90">
          {warning.message}
        </div>
      </div>
    </div>
  );
}

/**
 * Lightweight rule helper deriving advisory warnings from an existing quote.
 * Reads quote fields only — no new calculations. Returned warnings can be
 * rendered with <TradeWarningCard>; callers decide how aggressively to surface
 * them (kept intentionally minimal for now).
 */
export function getTradeWarnings(
  quote: Pick<
    TradeQuote,
    "slippagePercent" | "tradeImpactPercent" | "warningLevel" | "lowData"
  > | null
  | undefined,
): TradeWarning[] {
  if (!quote) return [];
  const warnings: TradeWarning[] = [];

  if (quote.lowData) {
    warnings.push({
      id: "low-liquidity",
      tone: "caution",
      title: "Low liquidity token",
      message:
        "Limited market data for this token. Fills are estimated from thin liquidity and can move sharply.",
    });
  }

  if (quote.tradeImpactPercent >= 5) {
    warnings.push({
      id: "high-impact",
      tone: "danger",
      title: "High liquidity impact",
      message:
        "This order consumes a large share of available liquidity, so it fills well off the listed price.",
    });
  }

  if (quote.warningLevel === "extreme" || quote.slippagePercent >= 5) {
    warnings.push({
      id: "high-slippage",
      tone: "danger",
      title: "High slippage",
      message:
        "Your fill price is far from the listed price. Consider a smaller order size.",
    });
  }

  return warnings;
}
