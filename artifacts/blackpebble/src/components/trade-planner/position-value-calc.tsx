/**
 * Position Value Calculator — standalone section.
 * Shows what a position may be worth at a future market cap, independent of
 * the main Trade Setup. Shares the global Investment Unit toggle.
 */
import { useState } from "react";
import { SectionCard, PlannerField, Stat } from "./primitives";
import { fmtUnitAmt, fmtPct, fmtMult, fmtValuation } from "./util";
import { parseAbbreviatedNumber, QUICK_MULTIPLES, type Unit, type InputMode } from "@/lib/trade-planner";

interface PvcFields {
  amount: string;
  entryMc: string;
  targetMc: string;
}

interface PvcResult {
  multiple: number | null;
  gainPct: number | null;
  positionValue: number | null;
  profit: number | null;
}

function computePvc(
  amount: number | null,
  entryMc: number | null,
  targetMc: number | null,
): PvcResult {
  if (
    amount == null || amount <= 0 ||
    entryMc == null || entryMc <= 0 ||
    targetMc == null || targetMc <= 0 || targetMc <= entryMc
  ) {
    return { multiple: null, gainPct: null, positionValue: null, profit: null };
  }
  const multiple = targetMc / entryMc;
  const gainPct = (targetMc - entryMc) / entryMc * 100;
  const positionValue = amount * multiple;
  const profit = positionValue - amount;
  return { multiple, gainPct, positionValue, profit };
}

export function PositionValueCalc({
  unit,
  inputMode,
}: {
  unit: Unit;
  inputMode: InputMode;
}) {
  const [fields, setFields] = useState<PvcFields>({ amount: "", entryMc: "", targetMc: "" });

  const parsedAmount = parseAbbreviatedNumber(fields.amount);
  const parsedEntry = parseAbbreviatedNumber(fields.entryMc);
  const parsedTarget = parseAbbreviatedNumber(fields.targetMc);

  const result = computePvc(parsedAmount, parsedEntry, parsedTarget);
  const hasResult = result.multiple != null;

  const mcLabel = inputMode === "marketcap" ? "Market Cap" : "Price";
  const amountPlaceholder = unit === "SOL" ? "e.g. 2" : "e.g. 100";
  const mcPlaceholder = "e.g. 100k";

  function setField(field: keyof PvcFields, value: string) {
    setFields((prev) => ({ ...prev, [field]: value }));
  }

  function handleQuickMultiple(m: number) {
    if (parsedEntry == null || parsedEntry <= 0) return;
    setField("targetMc", String(parsedEntry * m));
  }

  return (
    <SectionCard
      title="Position Value Calculator"
      subtitle="See what an investment may be worth at a future market cap."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PlannerField
            label="Investment Amount"
            value={fields.amount}
            onChange={(v) => setField("amount", v)}
            placeholder={amountPlaceholder}
            unit={unit === "USD" ? "USD" : "SOL"}
            inputMode="text"
            testId="pvc-amount"
          />
          <PlannerField
            label={`Entry ${mcLabel}`}
            value={fields.entryMc}
            onChange={(v) => setField("entryMc", v)}
            placeholder={mcPlaceholder}
            inputMode="text"
            testId="pvc-entry"
          />
          <PlannerField
            label={`Target ${mcLabel}`}
            value={fields.targetMc}
            onChange={(v) => setField("targetMc", v)}
            placeholder={mcPlaceholder}
            inputMode="text"
            testId="pvc-target"
          />
        </div>

        {/* Quick target multiples */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Quick Target
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {QUICK_MULTIPLES.map((m) => (
              <button
                key={m}
                type="button"
                disabled={parsedEntry == null || parsedEntry <= 0}
                onClick={() => handleQuickMultiple(m)}
                className="min-h-9 border border-border bg-background text-sm font-mono font-medium rounded-md transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"
                data-testid={`pvc-btn-${m}`}
              >
                {m}x
              </button>
            ))}
          </div>
        </div>

        {hasResult ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-border pt-4">
            <Stat label="Multiple" value={fmtMult(result.multiple)} tone="accent" emphasis />
            <Stat label="Gain" value={fmtPct(result.gainPct)} />
            <Stat label="Value at Target" value={fmtUnitAmt(result.positionValue, unit)} />
            <Stat label="Profit" value={fmtUnitAmt(result.profit, unit)} tone="profit" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            {parsedEntry != null && parsedEntry > 0
              ? parsedTarget != null && parsedTarget <= parsedEntry
                ? "Target must be above entry market cap."
                : "Enter an investment amount and target to see projections."
              : "Enter an investment amount and entry market cap to start."}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
