import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { fmtMarketCap, fmtPercent } from "@/lib/format";
import { computeFdv } from "@/lib/education/interactive/calc-math";
import { SimulatorShell } from "../shared/simulator-shell";
import { NumberField, parseNum } from "../shared/fields";
import { Assumptions, Headline, Metric, Note } from "../shared/results";
import { RelatedActions } from "../shared/actions";
import { useModuleInteraction } from "./use-module-interaction";
import type { InteractiveModuleProps } from "../contract";

const DEFAULTS = { price: "0.05", circ: "100000000", total: "1000000000" };
const GUIDED = { price: "0.05", circ: "50000000", total: "1000000000" };

export function MarketCapFdvSimulator(props: InteractiveModuleProps) {
  const { lesson } = props;
  const [price, setPrice] = useState(DEFAULTS.price);
  const [circ, setCirc] = useState(DEFAULTS.circ);
  const [total, setTotal] = useState(DEFAULTS.total);
  const onInteract = useModuleInteraction(props);

  const r = useMemo(
    () =>
      computeFdv({
        price: parseNum(price),
        circulatingSupply: parseNum(circ),
        totalSupply: parseNum(total),
      }),
    [price, circ, total],
  );

  const heavyLock = r.lockedPct >= 50;

  return (
    <SimulatorShell
      title="Market cap vs FDV"
      icon={Layers}
      testId="fdv-sim"
      onReset={() => {
        setPrice(DEFAULTS.price);
        setCirc(DEFAULTS.circ);
        setTotal(DEFAULTS.total);
      }}
      onGuidedExample={() => {
        setPrice(GUIDED.price);
        setCirc(GUIDED.circ);
        setTotal(GUIDED.total);
        onInteract();
      }}
      assumptions={
        <Assumptions>
          market cap uses circulating supply; fully diluted valuation (FDV) uses
          total or maximum supply. A large gap means many tokens are not yet
          circulating. This is context, not a prediction of future price.
        </Assumptions>
      }
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <NumberField label="Token price" value={price} prefix="$" testId="fdv-price"
            onChange={(v) => { setPrice(v); onInteract(); }} />
          <NumberField label="Circulating supply" value={circ} suffix="tokens" testId="fdv-circ"
            onChange={(v) => { setCirc(v); onInteract(); }} />
          <NumberField label="Total / max supply" value={total} suffix="tokens" testId="fdv-total"
            onChange={(v) => { setTotal(v); onInteract(); }} />
          {heavyLock ? (
            <Note tone="warning" testId="fdv-warning">
              {fmtPercent(r.lockedPct)} of supply is not yet circulating. Future
              unlocks can add selling pressure. Understand the unlock schedule
              before assuming FDV is fully reflected in the price.
            </Note>
          ) : null}
        </div>
        <div className="space-y-3">
          <Headline label="Market cap" value={fmtMarketCap(r.marketCap)} testId="fdv-mc" />
          <Headline label="Fully diluted valuation" value={fmtMarketCap(r.fdv)} testId="fdv-fdv" />
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Circulating" value={fmtPercent(r.circulatingPct)} testId="fdv-circ-pct" />
            <Metric label="Valuation gap" value={fmtMarketCap(r.valuationGap)} testId="fdv-gap" />
          </div>
        </div>
      </div>
    </SimulatorShell>
  );
}
