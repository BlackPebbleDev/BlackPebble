import { useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { fmtPrice, fmtPercent } from "@/lib/format";
import { computeSlTp } from "@/lib/education/interactive/calc-math";
import { SimulatorShell } from "../shared/simulator-shell";
import { NumberField, parseNum } from "../shared/fields";
import { Assumptions, Headline, Metric, Note } from "../shared/results";
import { RelatedActions } from "../shared/actions";
import { useModuleInteraction } from "./use-module-interaction";
import type { InteractiveModuleProps } from "../contract";

const DEFAULTS = { entry: "0.05", stop: "0.04", target: "0.09" };

export function StopLossTakeProfitPlanner(props: InteractiveModuleProps) {
  const { lesson } = props;
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [stop, setStop] = useState(DEFAULTS.stop);
  const [target, setTarget] = useState(DEFAULTS.target);
  const onInteract = useModuleInteraction(props);

  const r = useMemo(
    () =>
      computeSlTp({
        entry: parseNum(entry),
        stop: parseNum(stop),
        target: parseNum(target),
      }),
    [entry, stop, target],
  );

  return (
    <SimulatorShell
      title="Stop loss & take profit planner"
      icon={Crosshair}
      testId="sltp-planner"
      onReset={() => {
        setEntry(DEFAULTS.entry);
        setStop(DEFAULTS.stop);
        setTarget(DEFAULTS.target);
      }}
      onGuidedExample={() => {
        setEntry("0.10");
        setStop("0.09");
        setTarget("0.16");
        onInteract();
      }}
      assumptions={
        <Assumptions>
          risk-reward compares planned downside to planned upside. Stops can slip
          and are not guaranteed; volatile tokens can gap straight through a
          level. This is planning practice, not advice.
        </Assumptions>
      }
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <NumberField label="Entry price" value={entry} prefix="$" testId="sltp-entry"
            onChange={(v) => { setEntry(v); onInteract(); }} />
          <NumberField label="Stop loss" value={stop} prefix="$" testId="sltp-stop"
            onChange={(v) => { setStop(v); onInteract(); }} />
          <NumberField label="Take profit" value={target} prefix="$" testId="sltp-target"
            onChange={(v) => { setTarget(v); onInteract(); }} />
          {!r.valid ? (
            <Note tone="warning" testId="sltp-invalid">
              For a long trade, the stop should sit below entry and the target
              above entry. Adjust the levels to plan a valid trade.
            </Note>
          ) : null}
        </div>
        <div className="space-y-3">
          <Headline
            label="Risk-reward ratio"
            value={r.riskRewardRatio != null ? `${r.riskRewardRatio.toFixed(2)} : 1` : "—"}
            tone={r.riskRewardRatio && r.riskRewardRatio >= 2 ? "text-success" : "text-foreground"}
            testId="sltp-rr"
          />
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Downside" value={fmtPercent(r.downsidePct)} tone="text-destructive" testId="sltp-downside" />
            <Metric label="Upside" value={fmtPercent(r.upsidePct)} tone="text-success" testId="sltp-upside" />
          </div>
          {/* Simple visual price ladder */}
          <div className="rounded-lg border border-border/60 bg-card/60 p-3 text-xs">
            <div className="flex items-center justify-between text-success">
              <span>Take profit</span>
              <span className="font-mono">{fmtPrice(parseNum(target))}</span>
            </div>
            <div className="my-1 flex items-center justify-between text-foreground">
              <span>Entry</span>
              <span className="font-mono">{fmtPrice(parseNum(entry))}</span>
            </div>
            <div className="flex items-center justify-between text-destructive">
              <span>Stop loss</span>
              <span className="font-mono">{fmtPrice(parseNum(stop))}</span>
            </div>
          </div>
        </div>
      </div>
    </SimulatorShell>
  );
}
