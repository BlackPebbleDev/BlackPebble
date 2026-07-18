import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { fmtUsd, fmtPercent, fmtNum, fmtPrice } from "@/lib/format";
import { computePositionSize } from "@/lib/education/interactive/calc-math";
import { SimulatorShell } from "../shared/simulator-shell";
import { NumberField, parseNum } from "../shared/fields";
import { Assumptions, Headline, Metric, Note } from "../shared/results";
import { RelatedActions } from "../shared/actions";
import { useModuleInteraction } from "./use-module-interaction";
import type { InteractiveModuleProps } from "../contract";

const DEFAULTS = { balance: "10000", risk: "1", entry: "0.05", stop: "0.045" };

export function PositionSizeCalculator(props: InteractiveModuleProps) {
  const { lesson } = props;
  const [balance, setBalance] = useState(DEFAULTS.balance);
  const [risk, setRisk] = useState(DEFAULTS.risk);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [stop, setStop] = useState(DEFAULTS.stop);
  const onInteract = useModuleInteraction(props);

  const r = useMemo(
    () =>
      computePositionSize({
        accountBalance: parseNum(balance),
        riskPct: parseNum(risk),
        entry: parseNum(entry),
        stop: parseNum(stop),
      }),
    [balance, risk, entry, stop],
  );

  const highRisk = parseNum(risk) > 5;

  return (
    <SimulatorShell
      title="Position-size calculator"
      icon={Scale}
      testId="position-size-calc"
      onReset={() => {
        setBalance(DEFAULTS.balance);
        setRisk(DEFAULTS.risk);
        setEntry(DEFAULTS.entry);
        setStop(DEFAULTS.stop);
      }}
      onGuidedExample={() => {
        setBalance("5000");
        setRisk("2");
        setEntry("0.10");
        setStop("0.085");
        onInteract();
      }}
      assumptions={
        <Assumptions>
          uses a simulated account balance only. It never reads your real funds.
          Position size = amount risked / stop distance. Fees and slippage are
          not included and would increase the real loss at the stop.
        </Assumptions>
      }
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Account (simulated)" value={balance} prefix="$" testId="ps-balance"
              onChange={(v) => { setBalance(v); onInteract(); }} />
            <NumberField label="Risk per trade" value={risk} suffix="%" testId="ps-risk"
              onChange={(v) => { setRisk(v); onInteract(); }} />
            <NumberField label="Entry price" value={entry} prefix="$" testId="ps-entry"
              onChange={(v) => { setEntry(v); onInteract(); }} />
            <NumberField label="Stop loss" value={stop} prefix="$" testId="ps-stop"
              onChange={(v) => { setStop(v); onInteract(); }} />
          </div>
          {highRisk ? (
            <Note tone="warning" testId="ps-warning">
              Risking more than 5% per trade is unusually high. A short losing
              streak can draw down the account quickly.
            </Note>
          ) : null}
          {!r.valid ? (
            <Note tone="warning" testId="ps-invalid">
              The stop must sit below entry (and at or above zero) to size a long
              position.
            </Note>
          ) : null}
        </div>
        <div className="space-y-3">
          <Headline label="Position size" value={fmtUsd(r.positionSize)} testId="ps-size" />
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Amount at risk" value={fmtUsd(r.riskAmount)} tone="text-destructive" testId="ps-risk-amt" />
            <Metric label="Stop distance" value={fmtPercent(r.stopDistancePct)} testId="ps-stop-dist" />
            <Metric label="Token quantity" value={fmtNum(r.tokenQuantity)} testId="ps-qty" />
            <Metric label="Loss at stop" value={fmtUsd(r.lossAtStop)} tone="text-destructive" testId="ps-loss" />
          </div>
          <Note tone="info">
            Entry {fmtPrice(parseNum(entry))} with this stop keeps the loss near
            your chosen risk, before fees and slippage.
          </Note>
        </div>
      </div>
    </SimulatorShell>
  );
}
