import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { fmtPrice, fmtUsd, fmtPercent } from "@/lib/format";
import { bondingCurvePoint } from "@/lib/education/interactive/calc-math";
import { SimulatorShell } from "../shared/simulator-shell";
import { RangeField } from "../shared/fields";
import { Assumptions, Headline, Metric, Note } from "../shared/results";
import { RelatedActions } from "../shared/actions";
import { useModuleInteraction } from "./use-module-interaction";
import type { InteractiveModuleProps } from "../contract";

const BASE_PRICE = 0.0001;
const SLOPE = 0.0000002;
const MAX_SUPPLY = 800_000; // migration threshold (illustrative)

export function BondingCurveSimulator(props: InteractiveModuleProps) {
  const { lesson } = props;
  const [supplySold, setSupplySold] = useState(200_000);
  const onInteract = useModuleInteraction(props);

  const current = useMemo(
    () => bondingCurvePoint({ basePrice: BASE_PRICE, slope: SLOPE, supplySold }),
    [supplySold],
  );
  const early = useMemo(
    () => bondingCurvePoint({ basePrice: BASE_PRICE, slope: SLOPE, supplySold: MAX_SUPPLY * 0.1 }),
    [],
  );
  const progressPct = Math.min(100, (supplySold / MAX_SUPPLY) * 100);
  const premiumVsEarly =
    early.price > 0 ? ((current.price - early.price) / early.price) * 100 : 0;

  return (
    <SimulatorShell
      title="Bonding-curve simulator"
      icon={TrendingUp}
      testId="bonding-curve"
      onReset={() => setSupplySold(200_000)}
      onGuidedExample={() => {
        setSupplySold(Math.round(MAX_SUPPLY * 0.9));
        onInteract();
      }}
      assumptions={
        <Assumptions>
          this is a deliberately simplified linear curve for teaching, not a
          reproduction of any specific launchpad. Price rises as more supply is
          bought; earlier buyers pay less than later buyers. Near the migration
          threshold, liquidity typically moves to an open market.
        </Assumptions>
      }
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <RangeField
            label="Supply purchased"
            value={supplySold}
            min={0}
            max={MAX_SUPPLY}
            step={10_000}
            display={`${progressPct.toFixed(0)}%`}
            testId="bc-supply"
            onChange={(v) => { setSupplySold(v); onInteract(); }}
          />
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all motion-reduce:transition-none"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <Note tone={progressPct > 85 ? "warning" : "info"}>
            {progressPct > 85
              ? "Near the migration threshold, buying pressure and price often peak. Late buyers carry the most risk if demand fades."
              : "Early on the curve, price moves in smaller steps. Watch how each purchase raises the next buyer's price."}
          </Note>
        </div>
        <div className="space-y-3">
          <Headline label="Current price" value={fmtPrice(current.price)} testId="bc-price" />
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Cost to reach here" value={fmtUsd(current.cumulativeCost)} testId="bc-cost" />
            <Metric label="Average price" value={fmtPrice(current.averagePrice)} testId="bc-avg" />
            <Metric label="Early buyer price" value={fmtPrice(early.price)} testId="bc-early" />
            <Metric
              label="Premium vs early"
              value={fmtPercent(premiumVsEarly)}
              tone={premiumVsEarly > 0 ? "text-amber-300" : "text-foreground"}
              testId="bc-premium"
            />
          </div>
        </div>
      </div>
    </SimulatorShell>
  );
}
