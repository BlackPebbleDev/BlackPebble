/** Section 2 — Position Sizing. Mode A (risk-based) or Mode B (fixed size). */
import { SectionCard, SegmentedToggle, PlannerField, Stat } from "./primitives";
import { fmtUnitAmt, fmtPct } from "./util";
import type { SizingMode, PlanErrors, PlanResult, Unit } from "@/lib/trade-planner";

export interface SizingFields {
  accountSize: string;
  riskPct: string;
  preferredSize: string;
}

export function PositionSizing({
  unit,
  sizingMode,
  onSizingModeChange,
  fields,
  onFieldChange,
  errors,
  result,
}: {
  unit: Unit;
  sizingMode: SizingMode;
  onSizingModeChange: (mode: SizingMode) => void;
  fields: SizingFields;
  onFieldChange: (field: keyof SizingFields, value: string) => void;
  errors: PlanErrors;
  result: PlanResult;
}) {
  const subtitle =
    sizingMode === "risk"
      ? "Account + risk % + stop → suggested position size."
      : "Preferred position size → actual risk taken.";

  const unitLabel = unit === "USD" ? "USD" : "SOL";

  return (
    <SectionCard title="Position Sizing" subtitle={subtitle}>
      <div className="space-y-4">
        <SegmentedToggle
          ariaLabel="Sizing mode"
          value={sizingMode}
          onChange={onSizingModeChange}
          options={[
            { value: "risk", label: "Risk Based" },
            { value: "fixed", label: "Fixed Size" },
          ]}
        />

        {sizingMode === "risk" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PlannerField
              label="Account Size"
              value={fields.accountSize}
              onChange={(v) => onFieldChange("accountSize", v)}
              placeholder={unit === "USD" ? "e.g. 5000" : "e.g. 20"}
              unit={unitLabel}
              error={errors.accountSize}
              testId="input-account"
            />
            <PlannerField
              label="Risk Per Trade"
              value={fields.riskPct}
              onChange={(v) => onFieldChange("riskPct", v)}
              placeholder="e.g. 2"
              unit="%"
              error={errors.riskPct}
              testId="input-risk"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PlannerField
              label="Preferred Position Size"
              value={fields.preferredSize}
              onChange={(v) => onFieldChange("preferredSize", v)}
              placeholder={unit === "USD" ? "e.g. 500" : "e.g. 2"}
              unit={unitLabel}
              error={errors.preferredSize}
              testId="input-preferred"
            />
            <PlannerField
              label="Account Size"
              value={fields.accountSize}
              onChange={(v) => onFieldChange("accountSize", v)}
              placeholder={unit === "USD" ? "e.g. 5000" : "e.g. 20"}
              unit={unitLabel}
              error={errors.accountSize}
              optional
              testId="input-account"
            />
          </div>
        )}

        {result.sizingValid ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-border pt-4">
            {sizingMode === "risk" ? (
              <>
                <Stat label="Max Risk" value={fmtUnitAmt(result.maxRisk, unit)} />
                <Stat
                  label="Suggested Position"
                  value={fmtUnitAmt(result.suggestedPosition, unit)}
                  tone="accent"
                  emphasis
                />
                <Stat label="Loss At Stop" value={fmtUnitAmt(result.lossAtStop, unit)} tone="loss" />
              </>
            ) : (
              <>
                <Stat
                  label="Position Size"
                  value={fmtUnitAmt(result.positionSize, unit)}
                  tone="accent"
                  emphasis
                />
                <Stat label="Loss At Stop" value={fmtUnitAmt(result.lossAtStop, unit)} tone="loss" />
                <Stat
                  label="Risk Of Account"
                  value={
                    result.riskPctOfAccount != null
                      ? fmtPct(result.riskPctOfAccount)
                      : "—"
                  }
                />
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            {result.tradeValid
              ? "Enter your sizing inputs to size the position."
              : "Complete the trade setup above first."}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
