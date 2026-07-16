import { useMemo, useState } from "react";
import {
  computePlan,
  parseAbbreviatedNumber,
  type InputMode,
  type SizingMode,
  type Unit,
} from "@/lib/trade-planner";
import { TradeSetup, type SetupFields } from "@/components/trade-planner/trade-setup";
import {
  PositionSizing,
  type SizingFields,
} from "@/components/trade-planner/position-sizing";
import { ProfitTargets } from "@/components/trade-planner/profit-targets";
import { TradeSummary } from "@/components/trade-planner/trade-summary";
import { PositionValueCalc } from "@/components/trade-planner/position-value-calc";
import { SegmentedToggle } from "@/components/trade-planner/primitives";
import { UtilityPageHeader } from "@/components/utility-page-header";
import { getUtility } from "@/lib/utilities-meta";

const TRADE_PLANNER = getUtility("trade_planner");

const EMPTY_SETUP: SetupFields = { entry: "", stop: "", target: "", current: "" };
const EMPTY_SIZING: SizingFields = {
  accountSize: "",
  riskPct: "",
  preferredSize: "",
};

export default function TradePlanner() {
  // Global investment unit - drives Position Value Calc, Position Sizing,
  // Profit Targets, and Trade Summary simultaneously.
  const [unit, setUnit] = useState<Unit>("SOL");

  const [inputMode, setInputMode] = useState<InputMode>("marketcap");
  const [sizingMode, setSizingMode] = useState<SizingMode>("risk");
  const [setup, setSetup] = useState<SetupFields>(EMPTY_SETUP);
  const [sizing, setSizing] = useState<SizingFields>(EMPTY_SIZING);

  const parsed = useMemo(
    () => ({
      entry: parseAbbreviatedNumber(setup.entry),
      stop: parseAbbreviatedNumber(setup.stop),
      target: parseAbbreviatedNumber(setup.target),
      current: parseAbbreviatedNumber(setup.current),
      accountSize: parseAbbreviatedNumber(sizing.accountSize),
      riskPct: parseAbbreviatedNumber(sizing.riskPct),
      preferredSize: parseAbbreviatedNumber(sizing.preferredSize),
    }),
    [setup, sizing],
  );

  const result = useMemo(
    () =>
      computePlan({
        inputMode,
        sizingMode,
        entry: parsed.entry,
        stop: parsed.stop,
        target: parsed.target,
        current: parsed.current,
        accountSize: parsed.accountSize,
        riskPct: parsed.riskPct,
        preferredSize: parsed.preferredSize,
      }),
    [inputMode, sizingMode, parsed],
  );

  function handleSetupChange(field: keyof SetupFields, value: string) {
    setSetup((prev) => ({ ...prev, [field]: value }));
  }
  function handleSizingChange(field: keyof SizingFields, value: string) {
    setSizing((prev) => ({ ...prev, [field]: value }));
  }
  function handlePickMultiple(multiple: number) {
    if (parsed.entry == null || parsed.entry <= 0) return;
    setSetup((prev) => ({ ...prev, target: String(parsed.entry! * multiple) }));
  }

  return (
    <div className="flex flex-col gap-5 px-4 md:px-6 py-5 sm:py-6 max-w-5xl mx-auto pb-20">
      <UtilityPageHeader utility={TRADE_PLANNER} />

      {/* 1. Trade Setup - always in valuation (MC or price) units */}
      <TradeSetup
        inputMode={inputMode}
        onInputModeChange={setInputMode}
        fields={setup}
        onFieldChange={handleSetupChange}
        errors={result.errors}
        result={result}
      />

      {/* Global investment unit toggle - affects all sections below */}
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Investment Unit
        </div>
        <SegmentedToggle
          ariaLabel="Investment unit"
          value={unit}
          onChange={(v) => setUnit(v)}
          options={[
            { value: "SOL", label: "SOL" },
            { value: "USD", label: "USD" },
          ]}
        />
      </div>

      {/* 2. Position Value Calculator - standalone quick projection */}
      <PositionValueCalc unit={unit} inputMode={inputMode} />

      {/* 3. Position Sizing - risk-based or fixed, in selected unit */}
      <PositionSizing
        unit={unit}
        sizingMode={sizingMode}
        onSizingModeChange={setSizingMode}
        fields={sizing}
        onFieldChange={handleSizingChange}
        errors={result.errors}
        result={result}
      />

      {/* 4. Profit Targets - projection table uses selected unit */}
      <ProfitTargets
        unit={unit}
        inputMode={inputMode}
        entry={parsed.entry}
        positionSize={result.positionSize}
        onPickMultiple={handlePickMultiple}
      />

      {/* 5. Trade Summary - all monetary values in selected unit */}
      <TradeSummary
        unit={unit}
        inputMode={inputMode}
        entry={parsed.entry}
        stop={parsed.stop}
        target={parsed.target}
        result={result}
      />
    </div>
  );
}
