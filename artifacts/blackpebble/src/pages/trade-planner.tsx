import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import {
  computePlan,
  parseAbbreviatedNumber,
  type InputMode,
  type SizingMode,
} from "@/lib/trade-planner";
import { TradeSetup, type SetupFields } from "@/components/trade-planner/trade-setup";
import {
  PositionSizing,
  type SizingFields,
} from "@/components/trade-planner/position-sizing";
import { ProfitTargets } from "@/components/trade-planner/profit-targets";
import { TradeSummary } from "@/components/trade-planner/trade-summary";

const EMPTY_SETUP: SetupFields = { entry: "", stop: "", target: "", current: "" };
const EMPTY_SIZING: SizingFields = {
  accountSize: "",
  riskPct: "",
  preferredSize: "",
};

export default function TradePlanner() {
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
    const value = parsed.entry * multiple;
    // Keep the raw string compact for market-cap mode; full precision for price.
    setSetup((prev) => ({ ...prev, target: String(value) }));
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:py-10 max-w-3xl mx-auto pb-20">
      <div className="space-y-3">
        <Link
          href="/utilities"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-back-utilities"
        >
          <ArrowLeft className="w-4 h-4" />
          Utilities
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Trade Planner</h1>
          <p className="text-sm text-muted-foreground">
            Plan entries, targets, stops, position size, risk, and profit
            scenarios before taking a trade.
          </p>
        </div>
      </div>

      <TradeSetup
        inputMode={inputMode}
        onInputModeChange={setInputMode}
        fields={setup}
        onFieldChange={handleSetupChange}
        errors={result.errors}
        result={result}
      />

      <PositionSizing
        sizingMode={sizingMode}
        onSizingModeChange={setSizingMode}
        fields={sizing}
        onFieldChange={handleSizingChange}
        errors={result.errors}
        result={result}
      />

      <ProfitTargets
        inputMode={inputMode}
        entry={parsed.entry}
        positionSize={result.positionSize}
        onPickMultiple={handlePickMultiple}
      />

      <TradeSummary
        inputMode={inputMode}
        entry={parsed.entry}
        stop={parsed.stop}
        target={parsed.target}
        result={result}
      />
    </div>
  );
}
