import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { fmtPrice, fmtSignedUsd, fmtUsd, fmtNum } from "@/lib/format";
import {
  computePnl,
  quantityFromInvestment,
  type PnlInputs,
} from "@/lib/education/interactive/pnl-math";
import { SimulatorShell } from "../shared/simulator-shell";
import { NumberField, RangeField, parseNum } from "../shared/fields";
import {
  Assumptions,
  Headline,
  Metric,
  StepTimeline,
  signedTone,
} from "../shared/results";
import { RelatedActions } from "../shared/actions";
import type { InteractiveModuleProps } from "../contract";

interface FormState {
  investment: string;
  entryPrice: string;
  currentPrice: string;
  exitPrice: string;
  percentSold: number;
  feePercent: string;
  slippagePercent: string;
}

const DEFAULT_FORM: FormState = {
  investment: "1000",
  entryPrice: "0.02",
  currentPrice: "0.05",
  exitPrice: "0.05",
  percentSold: 0,
  feePercent: "0",
  slippagePercent: "0",
};

const GUIDED_EXAMPLE: FormState = {
  investment: "500",
  entryPrice: "0.01",
  currentPrice: "0.03",
  exitPrice: "0.04",
  percentSold: 50,
  feePercent: "0.5",
  slippagePercent: "1",
};

const PRACTICE_CHALLENGE: FormState = {
  investment: "1000",
  entryPrice: "0.05",
  currentPrice: "0.02",
  exitPrice: "0.03",
  percentSold: 40,
  feePercent: "0.3",
  slippagePercent: "0.5",
};

/**
 * Flagship interactive PnL module (migrated onto the shared engine). Works
 * entirely with simulated values; it never reads real balances. Figures are
 * simulation/hindsight only and imply nothing about future price movement.
 */
export function PnlSimulator({
  lesson,
  onEvent,
  onComplete,
}: InteractiveModuleProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [advanced, setAdvanced] = useState(false);
  const [touched, setTouched] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (!touched) {
      setTouched(true);
      onEvent({ type: "interacted" });
      onComplete({ completionType: "interaction" });
    }
  }

  const result = useMemo(() => {
    const entryPrice = parseNum(form.entryPrice);
    const quantity = quantityFromInvestment(parseNum(form.investment), entryPrice);
    const inputs: PnlInputs = {
      entryPrice,
      quantity,
      currentPrice: parseNum(form.currentPrice),
      exitPrice: parseNum(form.exitPrice),
      percentSold: form.percentSold,
      feePercent: advanced ? parseNum(form.feePercent) : 0,
      slippagePercent: advanced ? parseNum(form.slippagePercent) : 0,
    };
    return { inputs, ...computePnl(inputs) };
  }, [form, advanced]);

  return (
    <SimulatorShell
      title="Interactive PnL calculator"
      icon={Target}
      testId="pnl-sim"
      mode={{ advanced, onChange: setAdvanced }}
      onReset={() => setForm(DEFAULT_FORM)}
      onGuidedExample={() => {
        setForm(GUIDED_EXAMPLE);
        update("percentSold", GUIDED_EXAMPLE.percentSold);
      }}
      onPractice={() => {
        setAdvanced(true);
        setForm(PRACTICE_CHALLENGE);
        onEvent({ type: "practice" });
      }}
      assumptions={
        <Assumptions>
          fees apply to both the buy and the sell, and buy fees are split between
          the sold and retained portions. Slippage reduces the exit fill price.
          These figures are simulated and describe this scenario only. They do
          not predict future price movement.
        </Assumptions>
      }
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Investment"
              value={form.investment}
              onChange={(v) => update("investment", v)}
              prefix="$"
              testId="pnl-input-investment"
            />
            <NumberField
              label="Entry price"
              value={form.entryPrice}
              onChange={(v) => update("entryPrice", v)}
              prefix="$"
              testId="pnl-input-entry"
            />
            <NumberField
              label="Current price"
              value={form.currentPrice}
              onChange={(v) => update("currentPrice", v)}
              prefix="$"
              testId="pnl-input-current"
            />
            <NumberField
              label="Exit price (sold)"
              value={form.exitPrice}
              onChange={(v) => update("exitPrice", v)}
              prefix="$"
              testId="pnl-input-exit"
            />
          </div>

          <RangeField
            label="Portion sold"
            value={form.percentSold}
            onChange={(v) => update("percentSold", v)}
            min={0}
            max={100}
            step={5}
            display={`${form.percentSold}%`}
            testId="pnl-input-percent-sold"
          />

          {advanced ? (
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Fee per side"
                value={form.feePercent}
                onChange={(v) => update("feePercent", v)}
                suffix="%"
                testId="pnl-input-fee"
              />
              <NumberField
                label="Slippage on exit"
                value={form.slippagePercent}
                onChange={(v) => update("slippagePercent", v)}
                suffix="%"
                testId="pnl-input-slippage"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <Headline
            label="Combined PnL (simulated)"
            value={fmtSignedUsd(result.combinedPnl)}
            sub={`${result.percentReturn > 0 ? "+" : ""}${result.percentReturn.toFixed(2)}% return`}
            tone={signedTone(result.combinedPnl)}
            testId="pnl-combined"
          />
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="Realized PnL"
              value={fmtSignedUsd(result.realizedPnl)}
              tone={signedTone(result.realizedPnl)}
              testId="pnl-realized"
            />
            <Metric
              label="Unrealized PnL"
              value={fmtSignedUsd(result.unrealizedPnl)}
              tone={signedTone(result.unrealizedPnl)}
              testId="pnl-unrealized"
            />
            <Metric
              label="Remaining value"
              value={fmtUsd(result.remainingValue)}
              testId="pnl-remaining-value"
            />
            <Metric
              label="Remaining cost basis"
              value={fmtUsd(result.remainingCostBasis)}
              testId="pnl-remaining-cost"
            />
            <Metric
              label="Fees paid"
              value={fmtUsd(result.totalFees)}
              testId="pnl-fees"
            />
            <Metric
              label="Tokens"
              value={fmtNum(result.inputs.quantity)}
              testId="pnl-quantity"
            />
          </div>
          <StepTimeline
            steps={[
              { label: "Entry", value: fmtPrice(result.inputs.entryPrice) },
              {
                label: `Exit (${form.percentSold}%)`,
                value: fmtPrice(result.effectiveExitPrice),
              },
              { label: "Now", value: fmtPrice(result.inputs.currentPrice) },
            ]}
          />
        </div>
      </div>
    </SimulatorShell>
  );
}
