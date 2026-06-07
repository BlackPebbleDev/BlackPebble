/** Section 2 — Position Sizing. Mode A (risk-based) or Mode B (fixed size). */
import { SectionCard, SegmentedToggle, PlannerField, Stat } from "./primitives";
import { fmtSolAmt, fmtPct } from "./util";
import type { SizingMode, PlanErrors, PlanResult } from "@/lib/trade-planner";

export interface SizingFields {
  accountSize: string;
  riskPct: string;
  preferredSize: string;
}

export function PositionSizing({
  sizingMode,
  onSizingModeChange,
  fields,
  onFieldChange,
  errors,
  result,
}: {
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
              placeholder="e.g. 20"
              unit="SOL"
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
              placeholder="e.g. 2"
              unit="SOL"
              error={errors.preferredSize}
              testId="input-preferred"
            />
            <PlannerField
              label="Account Size"
              value={fields.accountSize}
              onChange={(v) => onFieldChange("accountSize", v)}
              placeholder="e.g. 20"
              unit="SOL"
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
                <Stat label="Max Risk" value={fmtSolAmt(result.maxRisk)} />
                <Stat
                  label="Suggested Position"
                  value={fmtSolAmt(result.suggestedPosition)}
                  tone="accent"
                  emphasis
                />
                <Stat label="Loss At Stop" value={fmtSolAmt(result.lossAtStop)} tone="loss" />
              </>
            ) : (
              <>
                <Stat
                  label="Position Size"
                  value={fmtSolAmt(result.positionSize)}
                  tone="accent"
                  emphasis
                />
                <Stat label="Loss At Stop" value={fmtSolAmt(result.lossAtStop)} tone="loss" />
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
