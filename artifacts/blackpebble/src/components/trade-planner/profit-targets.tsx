/** Section 3 — Profit Targets. Quick multiples projected off entry + position. */
import { SectionCard } from "./primitives";
import { fmtValuation, fmtSolAmt } from "./util";
import {
  projectTargets,
  QUICK_MULTIPLES,
  type InputMode,
} from "@/lib/trade-planner";

export function ProfitTargets({
  inputMode,
  entry,
  positionSize,
  onPickMultiple,
}: {
  inputMode: InputMode;
  entry: number | null;
  positionSize: number | null;
  /** Sets the Target field to entry * multiple. */
  onPickMultiple: (multiple: number) => void;
}) {
  const hasEntry = entry != null && entry > 0;
  const rows = projectTargets(entry, positionSize, QUICK_MULTIPLES);
  const valuationHeader = inputMode === "marketcap" ? "Target MC" : "Target Price";

  return (
    <SectionCard
      title="Profit Targets"
      subtitle="Tap a multiple to set it as your target, or scan the projections."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {QUICK_MULTIPLES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={!hasEntry}
              onClick={() => onPickMultiple(m)}
              className="min-h-10 border border-border bg-background text-sm font-mono font-medium rounded-md transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"
              data-testid={`btn-multiple-${m}`}
            >
              {m}x
            </button>
          ))}
        </div>

        {hasEntry ? (
          <div className="overflow-hidden border border-border rounded-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left font-medium px-3 py-2">Multiple</th>
                  <th className="text-right font-medium px-3 py-2">
                    {valuationHeader}
                  </th>
                  <th className="text-right font-medium px-3 py-2">Value</th>
                  <th className="text-right font-medium px-3 py-2">Profit</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {rows.map((r) => (
                  <tr
                    key={r.multiple}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-foreground">{r.multiple}x</td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {fmtValuation(r.valuation, inputMode)}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {r.positionValue != null ? fmtSolAmt(r.positionValue) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-400">
                      {r.profit != null ? fmtSolAmt(r.profit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {positionSize == null ? (
              <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                Add a position size to project value and profit.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Enter an entry valuation to project profit targets.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
