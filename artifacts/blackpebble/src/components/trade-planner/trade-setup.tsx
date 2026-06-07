/** Section 1 — Trade Setup. Input-mode toggle + entry/stop/target/current. */
import { SectionCard, SegmentedToggle, PlannerField, Stat } from "./primitives";
import { fmtPct, fmtRR, fmtMult } from "./util";
import type { InputMode, PlanErrors, PlanResult } from "@/lib/trade-planner";

export interface SetupFields {
  entry: string;
  stop: string;
  target: string;
  current: string;
}

const LABELS: Record<InputMode, Record<keyof SetupFields, string>> = {
  marketcap: {
    entry: "Entry Market Cap",
    stop: "Stop Market Cap",
    target: "Target Market Cap",
    current: "Current Market Cap",
  },
  price: {
    entry: "Entry Price",
    stop: "Stop Price",
    target: "Target Price",
    current: "Current Price",
  },
};

export function TradeSetup({
  inputMode,
  onInputModeChange,
  fields,
  onFieldChange,
  errors,
  result,
}: {
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  fields: SetupFields;
  onFieldChange: (field: keyof SetupFields, value: string) => void;
  errors: PlanErrors;
  result: PlanResult;
}) {
  const placeholder = inputMode === "marketcap" ? "e.g. 100k" : "e.g. 0.0000118";
  const labels = LABELS[inputMode];

  return (
    <SectionCard
      title="Trade Setup"
      subtitle="Plan a long. Enter values as market cap or price."
    >
      <div className="space-y-4">
        <SegmentedToggle
          ariaLabel="Input mode"
          value={inputMode}
          onChange={onInputModeChange}
          options={[
            { value: "marketcap", label: "Market Cap" },
            { value: "price", label: "Price" },
          ]}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PlannerField
            label={labels.entry}
            value={fields.entry}
            onChange={(v) => onFieldChange("entry", v)}
            placeholder={placeholder}
            error={errors.entry}
            inputMode="text"
            testId="input-entry"
          />
          <PlannerField
            label={labels.stop}
            value={fields.stop}
            onChange={(v) => onFieldChange("stop", v)}
            placeholder={placeholder}
            error={errors.stop}
            inputMode="text"
            testId="input-stop"
          />
          <PlannerField
            label={labels.target}
            value={fields.target}
            onChange={(v) => onFieldChange("target", v)}
            placeholder={placeholder}
            error={errors.target}
            inputMode="text"
            testId="input-target"
          />
          <PlannerField
            label={labels.current}
            value={fields.current}
            onChange={(v) => onFieldChange("current", v)}
            placeholder={placeholder}
            optional
            inputMode="text"
            testId="input-current"
          />
        </div>

        {result.tradeValid ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-border pt-4">
            <Stat label="Downside" value={fmtPct(result.downsidePct)} />
            <Stat label="Upside" value={fmtPct(result.upsidePct)} />
            <Stat label="Risk / Reward" value={fmtRR(result.riskReward)} />
            <Stat label="Target Multiple" value={fmtMult(result.targetMultiple)} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            Enter a valid entry, stop and target to see downside, upside and
            risk/reward.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
