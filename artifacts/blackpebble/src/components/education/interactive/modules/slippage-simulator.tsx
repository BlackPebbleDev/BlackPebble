import { useMemo, useState } from "react";
import { Gauge } from "lucide-react";
import { fmtPrice, fmtPercent } from "@/lib/format";
import {
  computeSlippage,
  type TradeDirection,
} from "@/lib/education/interactive/calc-math";
import { SimulatorShell } from "../shared/simulator-shell";
import {
  NumberField,
  SegmentedChoice,
  parseNum,
} from "../shared/fields";
import {
  Assumptions,
  Headline,
  Metric,
  Note,
  StepTimeline,
} from "../shared/results";
import { RelatedActions } from "../shared/actions";
import { useModuleInteraction } from "./use-module-interaction";
import type { InteractiveModuleProps } from "../contract";

const DEFAULTS = {
  expected: "0.02",
  trade: "3000",
  liquidity: "150000",
  tolerance: "1",
};

export function SlippageSimulator(props: InteractiveModuleProps) {
  const { lesson } = props;
  const [expected, setExpected] = useState(DEFAULTS.expected);
  const [trade, setTrade] = useState(DEFAULTS.trade);
  const [liquidity, setLiquidity] = useState(DEFAULTS.liquidity);
  const [tolerance, setTolerance] = useState(DEFAULTS.tolerance);
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const onInteract = useModuleInteraction(props);

  const r = useMemo(
    () =>
      computeSlippage({
        expectedPrice: parseNum(expected),
        tradeSizeUsd: parseNum(trade),
        liquidityUsd: parseNum(liquidity),
        tolerancePct: parseNum(tolerance),
        direction,
      }),
    [expected, trade, liquidity, tolerance, direction],
  );

  return (
    <SimulatorShell
      title="Slippage simulator"
      icon={Gauge}
      testId="slippage-sim"
      onReset={() => {
        setExpected(DEFAULTS.expected);
        setTrade(DEFAULTS.trade);
        setLiquidity(DEFAULTS.liquidity);
        setTolerance(DEFAULTS.tolerance);
        setDirection("buy");
      }}
      onGuidedExample={() => {
        setTrade("20000");
        setLiquidity("80000");
        setTolerance("1");
        onInteract();
      }}
      assumptions={
        <Assumptions>
          slippage tolerance is the maximum price move you accept; actual
          slippage is what really happens; price impact is the move your own
          trade causes. If estimated impact exceeds your tolerance, the trade may
          fail or need a higher tolerance. Estimates use a simplified model.
        </Assumptions>
      }
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Expected price" value={expected} prefix="$" testId="slip-expected"
              onChange={(v) => { setExpected(v); onInteract(); }} />
            <NumberField label="Trade size" value={trade} prefix="$" testId="slip-trade"
              onChange={(v) => { setTrade(v); onInteract(); }} />
            <NumberField label="Pool liquidity" value={liquidity} prefix="$" testId="slip-liquidity"
              onChange={(v) => { setLiquidity(v); onInteract(); }} />
            <NumberField label="Slippage tolerance" value={tolerance} suffix="%" testId="slip-tolerance"
              onChange={(v) => { setTolerance(v); onInteract(); }} />
          </div>
          <SegmentedChoice
            label="Direction"
            value={direction}
            onChange={(v) => { setDirection(v); onInteract(); }}
            options={[
              { value: "buy", label: "Buy" },
              { value: "sell", label: "Sell" },
            ]}
            testId="slip-direction"
          />
        </div>
        <div className="space-y-3">
          <Headline
            label="Estimated price impact"
            value={fmtPercent(r.priceImpactPct)}
            tone={r.exceedsTolerance ? "text-destructive" : "text-foreground"}
            testId="slip-impact"
          />
          <StepTimeline
            steps={[
              { label: "Expected", value: fmtPrice(r.expectedPrice) },
              { label: "Estimated fill", value: fmtPrice(r.estimatedExecutedPrice) },
              { label: "Worst allowed", value: fmtPrice(r.worstCasePrice) },
            ]}
          />
          {r.exceedsTolerance ? (
            <Note tone="warning" testId="slip-warning">
              Estimated impact ({fmtPercent(r.priceImpactPct)}) exceeds your
              tolerance ({fmtPercent(r.tolerancePct)}). A real trade could fail or
              fill at a worse price.
            </Note>
          ) : (
            <Note tone="success" testId="slip-ok">
              Estimated impact is within your tolerance for this simplified
              scenario.
            </Note>
          )}
          <Metric label="Tolerance" value={fmtPercent(r.tolerancePct)} testId="slip-tol-out" />
        </div>
      </div>
    </SimulatorShell>
  );
}
