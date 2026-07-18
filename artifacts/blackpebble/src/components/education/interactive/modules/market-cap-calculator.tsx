import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { fmtMarketCap, fmtPrice, fmtNum } from "@/lib/format";
import { marketCap } from "@/lib/education/interactive/calc-math";
import { SimulatorShell } from "../shared/simulator-shell";
import { NumberField, parseNum } from "../shared/fields";
import { Assumptions, Headline, Metric, Note } from "../shared/results";
import { RelatedActions } from "../shared/actions";
import { useModuleInteraction } from "./use-module-interaction";
import type { InteractiveModuleProps } from "../contract";

const DEFAULTS = { price: "0.05", supply: "100000000" };
const GUIDED = { price: "0.10", supply: "1000000000" };

export function MarketCapCalculator(props: InteractiveModuleProps) {
  const { lesson } = props;
  const [price, setPrice] = useState(DEFAULTS.price);
  const [supply, setSupply] = useState(DEFAULTS.supply);
  const onInteract = useModuleInteraction(props);

  const cap = useMemo(
    () => marketCap(parseNum(price), parseNum(supply)),
    [price, supply],
  );

  function reset() {
    setPrice(DEFAULTS.price);
    setSupply(DEFAULTS.supply);
  }

  return (
    <SimulatorShell
      title="Market cap calculator"
      icon={BarChart3}
      testId="market-cap-calc"
      onReset={reset}
      onGuidedExample={() => {
        setPrice(GUIDED.price);
        setSupply(GUIDED.supply);
        onInteract();
      }}
      assumptions={
        <Assumptions>
          market cap = price x circulating supply. Circulating supply is the
          number of tokens available to trade now, not the total that may exist.
          Changing supply here does not by itself change the market price.
        </Assumptions>
      }
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <NumberField
            label="Token price"
            value={price}
            onChange={(v) => {
              setPrice(v);
              onInteract();
            }}
            prefix="$"
            testId="mc-price"
          />
          <NumberField
            label="Circulating supply"
            value={supply}
            onChange={(v) => {
              setSupply(v);
              onInteract();
            }}
            suffix="tokens"
            testId="mc-supply"
          />
          <Note tone="info">
            A higher price with a small supply can be worth less than a low price
            with a huge supply. Always compare market cap, not price alone.
          </Note>
        </div>
        <div className="space-y-3">
          <Headline
            label="Market cap"
            value={fmtMarketCap(cap)}
            testId="mc-result"
          />
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Price" value={fmtPrice(parseNum(price))} testId="mc-out-price" />
            <Metric
              label="Circulating"
              value={fmtNum(parseNum(supply))}
              testId="mc-out-supply"
            />
          </div>
        </div>
      </div>
    </SimulatorShell>
  );
}
