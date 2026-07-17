import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Lightbulb,
  RotateCcw,
  Target,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPrice, fmtSignedUsd, fmtUsd, fmtNum } from "@/lib/format";
import {
  computePnl,
  quantityFromInvestment,
  type PnlInputs,
} from "@/lib/education/interactive/pnl-math";
import { trackAcademyInteractiveCompleted } from "@/lib/analytics";

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

function parseNum(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  testId: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center rounded-lg border border-border bg-surface-2 focus-within:border-accent/50">
        {prefix ? (
          <span className="pl-2.5 text-xs text-muted-foreground">{prefix}</span>
        ) : null}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          data-testid={testId}
          className="w-full bg-transparent px-2.5 py-2 text-sm text-foreground outline-none"
        />
        {suffix ? (
          <span className="pr-2.5 text-xs text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
  testId,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "signed";
  signedValue?: number;
  testId?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-sm font-semibold tabular-nums",
          tone === "neutral" && "text-foreground",
        )}
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  );
}

function signedTone(value: number): string {
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "text-foreground";
}

/**
 * Flagship interactive PnL lesson module. Works entirely with simulated values;
 * it never reads real balances. Figures are simulation/hindsight only and imply
 * nothing about future price movement.
 */
export function PnlSimulator() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [advanced, setAdvanced] = useState(false);
  const [completedTracked, setCompletedTracked] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (!completedTracked) {
      setCompletedTracked(true);
      trackAcademyInteractiveCompleted();
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
    <div className="rounded-2xl border border-accent/20 bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" aria-hidden />
          <h3 className="m-0 text-sm font-semibold text-foreground">
            Interactive PnL calculator
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-pressed={advanced}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              advanced
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
            data-testid="pnl-advanced-toggle"
          >
            <SlidersHorizontal className="h-3 w-3" aria-hidden />
            {advanced ? "Advanced" : "Simple"}
          </button>
          <button
            type="button"
            onClick={() => setForm(DEFAULT_FORM)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            data-testid="pnl-reset"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Reset
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2">
        {/* Inputs */}
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

          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>Portion sold</span>
              <span className="font-mono tabular-nums text-foreground">
                {form.percentSold}%
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.percentSold}
              onChange={(e) => update("percentSold", Number(e.target.value))}
              className="w-full accent-[hsl(var(--accent))]"
              aria-label="Portion of position sold"
              data-testid="pnl-input-percent-sold"
            />
          </label>

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

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => setForm(GUIDED_EXAMPLE)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid="pnl-guided-example"
            >
              <Lightbulb className="h-3.5 w-3.5 text-accent" aria-hidden />
              Guided example
            </button>
            <button
              type="button"
              onClick={() => {
                setAdvanced(true);
                setForm(PRACTICE_CHALLENGE);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid="pnl-practice-challenge"
            >
              <Target className="h-3.5 w-3.5 text-accent" aria-hidden />
              Practice challenge
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border/60 bg-surface-2 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Combined PnL (simulated)
            </div>
            <div
              className={cn(
                "mt-0.5 font-mono text-2xl font-bold tabular-nums",
                signedTone(result.combinedPnl),
              )}
              data-testid="pnl-combined"
            >
              {fmtSignedUsd(result.combinedPnl)}
            </div>
            <div
              className={cn(
                "text-sm font-semibold tabular-nums",
                signedTone(result.percentReturn),
              )}
              data-testid="pnl-return"
            >
              {result.percentReturn > 0 ? "+" : ""}
              {result.percentReturn.toFixed(2)}% return
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/60 bg-card/60 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Realized PnL
              </div>
              <div
                className={cn(
                  "mt-0.5 font-mono text-sm font-semibold tabular-nums",
                  signedTone(result.realizedPnl),
                )}
                data-testid="pnl-realized"
              >
                {fmtSignedUsd(result.realizedPnl)}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/60 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Unrealized PnL
              </div>
              <div
                className={cn(
                  "mt-0.5 font-mono text-sm font-semibold tabular-nums",
                  signedTone(result.unrealizedPnl),
                )}
                data-testid="pnl-unrealized"
              >
                {fmtSignedUsd(result.unrealizedPnl)}
              </div>
            </div>
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

          {/* Trade lifecycle */}
          <div className="rounded-lg border border-border/60 bg-card/60 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Trade lifecycle
            </div>
            <div className="flex items-center justify-between gap-2 text-center text-[11px]">
              <div className="min-w-0 flex-1">
                <div className="text-muted-foreground">Entry</div>
                <div className="truncate font-mono text-foreground">
                  {fmtPrice(result.inputs.entryPrice)}
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-muted-foreground">Exit ({form.percentSold}%)</div>
                <div className="truncate font-mono text-foreground">
                  {fmtPrice(result.effectiveExitPrice)}
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-muted-foreground">Now</div>
                <div className="truncate font-mono text-foreground">
                  {fmtPrice(result.inputs.currentPrice)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/60 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Assumptions: fees apply to both the buy and the sell, and buy fees are
          split between the sold and retained portions. Slippage reduces the exit
          fill price. These figures are simulated and describe this scenario
          only. They do not predict future price movement.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
            data-testid="pnl-cta-paper"
          >
            Practice in Paper Trading
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/30"
            data-testid="pnl-cta-portfolio"
          >
            See PnL in Portfolio
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link
            href="/utilities/trading-analysis"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/30"
            data-testid="pnl-cta-intelligence"
          >
            Analyze your trading
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
