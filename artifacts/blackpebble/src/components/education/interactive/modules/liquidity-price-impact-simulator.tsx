import { useMemo, useState } from "react";
import { Droplets } from "lucide-react";
import { fmtUsd, fmtPercent } from "@/lib/format";
import {
  computeImpact,
  type TradeDirection,
} from "@/lib/education/interactive/calc-math";
import { SimulatorShell } from "../shared/simulator-shell";
import {
  NumberField,
  SegmentedChoice,
  parseNum,
} from "../shared/fields";
import { Assumptions, Headline, Metric, Note } from "../shared/results";
import { RelatedActions } from "../shared/actions";
import { useModuleInteraction } from "./use-module-interaction";
import type { InteractiveModuleProps } from "../contract";

const DEFAULTS = { liquidity: "250000", trade: "5000" };

export function LiquidityPriceImpactSimulator(props: InteractiveModuleProps) {
  const { lesson } = props;
  const [liquidity, setLiquidity] = useState(DEFAULTS.liquidity);
  const [trade, setTrade] = useState(DEFAULTS.trade);
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const onInteract = useModuleInteraction(props);

  const r = useMemo(
    () =>
      computeImpact({
        liquidityUsd: parseNum(liquidity),
        tradeSizeUsd: parseNum(trade),
        direction,
      }),
    [liquidity, trade, direction],
  );

  const heavy = r.priceImpactPct >= 5;

  return (
    <SimulatorShell
      title="Liquidity & price impact"
      icon={Droplets}
      testId="liquidity-sim"
      onReset={() => {
        setLiquidity(DEFAULTS.liquidity);
        setTrade(DEFAULTS.trade);
        setDirection("buy");
      }}
      onGuidedExample={() => {
        setLiquidity("40000");
        setTrade("8000");
        onInteract();
      }}
      assumptions={
        <Assumptions>
          this uses a simplified constant-product pool model to show direction
          and scale, not exact execution. Real pools have fees, routing, and
          multiple venues. Thinner liquidity means larger price impact for the
          same trade size.
        </Assumptions>
      }
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <NumberField label="Pool liquidity" value={liquidity} prefix="$" testId="liq-pool"
            onChange={(v) => { setLiquidity(v); onInteract(); }} />
          <NumberField label="Trade size" value={trade} prefix="$" testId="liq-trade"
            onChange={(v) => { setTrade(v); onInteract(); }} />
          <SegmentedChoice
            label="Direction"
            value={direction}
            onChange={(v) => { setDirection(v); onInteract(); }}
            options={[
              { value: "buy", label: "Buy" },
              { value: "sell", label: "Sell" },
            ]}
            testId="liq-direction"
          />
          {heavy ? (
            <Note tone="warning" testId="liq-warning">
              This trade is large relative to the pool, so estimated price impact
              is high. Splitting the trade or using deeper liquidity reduces
              impact.
            </Note>
          ) : null}
        </div>
        <div className="space-y-3">
          <Headline
            label="Estimated price impact"
            value={fmtPercent(r.priceImpactPct)}
            testId="liq-impact"
          />
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Trade % of liquidity" value={fmtPercent(r.pctOfLiquidity)} testId="liq-pct" />
            <Metric label="Reserve (one side)" value={fmtUsd(r.reserveUsdBefore)} testId="liq-reserve" />
          </div>
          <Note tone="info">
            Deep pools absorb trades with little movement. Fragile pools move
            sharply, and exiting can be as hard as entering.
          </Note>
        </div>
      </div>
    </SimulatorShell>
  );
}
