import { useMemo, useState } from "react";
import { PieChart } from "lucide-react";
import { fmtPercent } from "@/lib/format";
import { computeConcentration } from "@/lib/education/interactive/calc-math";
import { SimulatorShell } from "../shared/simulator-shell";
import { RangeField } from "../shared/fields";
import { Assumptions, Headline, Metric, Note } from "../shared/results";
import { RelatedActions } from "../shared/actions";
import { useModuleInteraction } from "./use-module-interaction";
import type { InteractiveModuleProps } from "../contract";

const BAND_LABELS: Record<string, string> = {
  distributed: "Broadly distributed",
  moderate: "Moderately concentrated",
  concentrated: "Concentrated",
  "highly-concentrated": "Highly concentrated",
};

const BAND_TONE: Record<string, string> = {
  distributed: "text-success",
  moderate: "text-foreground",
  concentrated: "text-amber-300",
  "highly-concentrated": "text-destructive",
};

export function HolderConcentrationExplorer(props: InteractiveModuleProps) {
  const { lesson } = props;
  const [dev, setDev] = useState(20);
  const [whales, setWhales] = useState(30);
  const [community, setCommunity] = useState(50);
  const onInteract = useModuleInteraction(props);

  const r = useMemo(() => {
    const allocations = [
      dev,
      whales * 0.5,
      whales * 0.3,
      whales * 0.2,
      ...Array.from({ length: 40 }, () => community / 40),
    ];
    return computeConcentration(allocations);
  }, [dev, whales, community]);

  return (
    <SimulatorShell
      title="Holder concentration explorer"
      icon={PieChart}
      testId="holder-concentration"
      onReset={() => {
        setDev(20);
        setWhales(30);
        setCommunity(50);
      }}
      assumptions={
        <Assumptions>
          this uses a fictional distribution to build intuition. There is no
          universal "safe" threshold — concentration is one signal among many.
          Always combine it with liquidity, authority, and behavior checks.
        </Assumptions>
      }
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <RangeField label="Developer allocation" value={dev} display={`${dev}`} testId="hc-dev"
            onChange={(v) => { setDev(v); onInteract(); }} />
          <RangeField label="Whale cluster" value={whales} display={`${whales}`} testId="hc-whales"
            onChange={(v) => { setWhales(v); onInteract(); }} />
          <RangeField label="Wider community" value={community} display={`${community}`} testId="hc-community"
            onChange={(v) => { setCommunity(v); onInteract(); }} />
          <Note tone="info">
            Move the sliders to see how developer and whale allocations change the
            concentration picture. Weights are relative, not percentages.
          </Note>
        </div>
        <div className="space-y-3">
          <Headline
            label="Concentration"
            value={BAND_LABELS[r.band]}
            tone={BAND_TONE[r.band]}
            testId="hc-band"
          />
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Top holder" value={fmtPercent(r.topHolderPct)} testId="hc-top" />
            <Metric label="Top 10 holders" value={fmtPercent(r.top10Pct)} testId="hc-top10" />
          </div>
          <Note tone={r.band === "highly-concentrated" ? "warning" : "info"}>
            When a few wallets hold most of the supply, a single decision to sell
            can move the price sharply. Distribution reduces, but does not
            remove, that risk.
          </Note>
        </div>
      </div>
    </SimulatorShell>
  );
}
