/** Section 4 — Trade Summary. Final read-out + setup rating + disclaimer. */
import { SectionCard, Stat } from "./primitives";
import { fmtValuation, fmtUnitAmt, fmtRR } from "./util";
import { cn } from "@/lib/utils";
import type {
  InputMode,
  PlanResult,
  SetupRating,
  Unit,
} from "@/lib/trade-planner";

/** Rating colours stay within brand: gold for strong, muted otherwise. No P&L green/red. */
function ratingClass(rating: SetupRating): string {
  switch (rating) {
    case "Excellent":
      return "border-accent/50 bg-accent/15 text-accent";
    case "Good":
      return "border-accent/30 text-accent";
    case "Weak":
      return "border-border text-muted-foreground";
    case "High Risk":
      return "border-border text-foreground";
  }
}

export function TradeSummary({
  unit,
  inputMode,
  entry,
  stop,
  target,
  result,
}: {
  unit: Unit;
  inputMode: InputMode;
  entry: number | null;
  stop: number | null;
  target: number | null;
  result: PlanResult;
}) {
  return (
    <SectionCard title="Trade Summary">
      {result.tradeValid ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Setup Rating
            </span>
            {result.rating ? (
              <span
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold uppercase tracking-wider border rounded-md",
                  ratingClass(result.rating),
                )}
                data-testid="setup-rating"
              >
                {result.rating}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-border pt-4">
            <Stat label="Entry" value={fmtValuation(entry, inputMode)} />
            <Stat label="Stop" value={fmtValuation(stop, inputMode)} />
            <Stat label="Target" value={fmtValuation(target, inputMode)} />
            <Stat label="Position Size" value={fmtUnitAmt(result.positionSize, unit)} />
            <Stat label="Risk Amount" value={fmtUnitAmt(result.lossAtStop, unit)} tone="loss" />
            <Stat label="Risk / Reward" value={fmtRR(result.riskReward)} />
            <Stat
              label="Potential Profit"
              value={fmtUnitAmt(result.profitAtTarget, unit)}
              tone="profit"
            />
            <Stat
              label="Potential Loss"
              value={
                result.lossAtStop != null ? fmtUnitAmt(-result.lossAtStop, unit) : "—"
              }
              tone="loss"
            />
          </div>

          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            For planning and education only. Not financial advice.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Complete the trade setup to generate a summary.
          </p>
          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            For planning and education only. Not financial advice.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
