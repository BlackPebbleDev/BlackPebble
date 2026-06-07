/**
 * Mini Trade Planner — a compact execution assistant embedded in the token
 * trading page (below the Buy/Sell panel). It is intentionally lighter than the
 * full Utilities Trade Planner: plan an entry/target/stop + size, see the
 * headline outcome, then "Apply To Trade" to pre-fill the existing buy amount.
 *
 * It never executes a trade and never touches paper-trading state directly — it
 * only hands a SOL amount + planned target/stop up to the trading page via the
 * `onApply` callback. All math is pure (see computeMiniPlan).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TokenInfo } from "@/lib/api";
import {
  computeMiniPlan,
  parseAbbreviatedNumber,
  type Unit,
} from "@/lib/trade-planner";
import { SegmentedToggle, PlannerField, Stat } from "./primitives";
import { fmtUnitAmt, fmtPct, fmtMult, fmtRatioOneTo } from "./util";
import { fmtMarketCap } from "@/lib/format";

export interface PlannedTrade {
  targetMc: number | null;
  stopMc: number | null;
  returnPct: number | null;
  riskReward: number | null;
}

const OPEN_KEY = "bp:mini-planner:open";
const UNIT_KEY = "bp:mini-planner:unit";

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore (private mode / disabled storage) */
  }
}

export function MiniPlanner({
  info,
  onApply,
  unit: unitProp,
  onUnitChange,
}: {
  info: TokenInfo;
  onApply: (payload: { amount: number; planned: PlannedTrade }) => void;
  /** When provided, the SOL/USD unit is controlled by the parent (shared with
   *  the Buy/Sell panel). Falls back to local state + sessionStorage otherwise. */
  unit?: Unit;
  onUnitChange?: (unit: Unit) => void;
}) {
  // Default collapsed; restore expand state for the rest of the session.
  const [open, setOpen] = useState(() => readSession(OPEN_KEY) === "1");
  const [unitInternal, setUnitInternal] = useState<Unit>(() =>
    readSession(UNIT_KEY) === "USD" ? "USD" : "SOL",
  );
  const controlled = unitProp != null && onUnitChange != null;
  const unit = controlled ? unitProp : unitInternal;
  const setUnit = (u: Unit) => {
    if (controlled) onUnitChange(u);
    else setUnitInternal(u);
  };

  const currentMc = info.marketCapUsd ?? null;
  const currentMcStr = currentMc != null ? String(Math.round(currentMc)) : "";

  const [entry, setEntry] = useState(currentMcStr);
  const [target, setTarget] = useState("");
  const [stop, setStop] = useState("");
  const [investment, setInvestment] = useState("");
  const [applied, setApplied] = useState(false);

  // Auto-fill / reset planning inputs when the viewed token changes so Entry MC
  // always defaults to the current token's market cap.
  const lastMint = useRef(info.mint);
  useEffect(() => {
    if (lastMint.current !== info.mint) {
      lastMint.current = info.mint;
      setEntry(currentMcStr);
      setTarget("");
      setStop("");
      setApplied(false);
    } else if (entry === "" && currentMcStr !== "") {
      // First load before market cap resolved, then it arrived.
      setEntry(currentMcStr);
    }
  }, [info.mint, currentMcStr, entry]);

  useEffect(() => writeSession(OPEN_KEY, open ? "1" : "0"), [open]);
  // Persist the unit only when uncontrolled; the parent owns persistence when
  // the unit is shared with the Buy/Sell panel.
  useEffect(() => {
    if (!controlled) writeSession(UNIT_KEY, unit);
  }, [unit, controlled]);

  const parsed = useMemo(
    () => ({
      entry: parseAbbreviatedNumber(entry),
      target: parseAbbreviatedNumber(target),
      stop: parseAbbreviatedNumber(stop),
      investment: parseAbbreviatedNumber(investment),
    }),
    [entry, target, stop, investment],
  );

  const result = useMemo(
    () =>
      computeMiniPlan({
        entry: parsed.entry,
        target: parsed.target,
        stop: parsed.stop,
        investment: parsed.investment,
      }),
    [parsed],
  );

  // SOL/USD rate derived straight from the token quote — no extra fetch.
  const solUsd =
    info.priceUsd != null && info.priceSol != null && info.priceSol > 0
      ? info.priceUsd / info.priceSol
      : null;

  // The SOL value that would be pushed into the buy field on Apply.
  const amountSol = useMemo(() => {
    const amt = parsed.investment;
    if (amt == null || amt <= 0) return null;
    if (unit === "SOL") return amt;
    return solUsd != null && solUsd > 0 ? amt / solUsd : null;
  }, [parsed.investment, unit, solUsd]);

  const usdRateMissing = unit === "USD" && solUsd == null;
  // Apply needs a positive investment, and a valid rate when sizing in USD so
  // the Buy/Sell panel can convert.
  const canApply =
    parsed.investment != null &&
    parsed.investment > 0 &&
    !(unit === "USD" && (solUsd == null || solUsd <= 0));

  function handleApply() {
    if (!canApply || parsed.investment == null) return;
    // Fill the buy field in the active unit — the Buy/Sell panel handles the
    // USD→SOL conversion at execution time.
    onApply({
      amount: parsed.investment,
      planned: {
        targetMc: parsed.target,
        stopMc: parsed.stop,
        returnPct: result.returnPct,
        riskReward: result.riskReward,
      },
    });
    setApplied(true);
  }

  // Any input edit invalidates the "applied" confirmation hint.
  function edited<T>(setter: (v: T) => void) {
    return (v: T) => {
      setApplied(false);
      setter(v);
    };
  }

  return (
    <div className="border border-border bg-card" data-testid="mini-planner">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="button-mini-planner-toggle"
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary/40"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          Trade Planner
          {!open && (
            <span className="text-[11px] font-normal text-muted-foreground">
              Plan a trade and apply it
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <PlannerField
              label="Entry MC"
              value={entry}
              onChange={edited(setEntry)}
              placeholder="e.g. 100k"
              testId="input-mini-entry"
            />
            <PlannerField
              label="Target MC"
              value={target}
              onChange={edited(setTarget)}
              placeholder="e.g. 500k"
              testId="input-mini-target"
            />
            <PlannerField
              label="Stop MC"
              value={stop}
              onChange={edited(setStop)}
              placeholder="e.g. 70k"
              testId="input-mini-stop"
            />
            <PlannerField
              label="Investment"
              value={investment}
              onChange={edited(setInvestment)}
              placeholder={unit === "SOL" ? "e.g. 2" : "e.g. 250"}
              unit={unit}
              testId="input-mini-investment"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Investment Unit
            </div>
            <SegmentedToggle
              ariaLabel="Investment unit"
              value={unit}
              onChange={(v) => {
                setApplied(false);
                setUnit(v);
              }}
              options={[
                { value: "SOL", label: "SOL" },
                { value: "USD", label: "USD" },
              ]}
            />
          </div>

          {/* Outputs */}
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
            <Stat
              label="Expected Value"
              value={fmtUnitAmt(result.expectedValue, unit)}
              tone="accent"
              emphasis
            />
            <Stat
              label="Projected Profit"
              value={
                result.projectedProfit != null
                  ? `+${fmtUnitAmt(result.projectedProfit, unit)}`
                  : "—"
              }
              tone={
                result.projectedProfit == null
                  ? "default"
                  : result.projectedProfit >= 0
                    ? "profit"
                    : "loss"
              }
              emphasis
            />
            <Stat label="Return" value={fmtPct(result.returnPct)} tone="profit" />
            <Stat
              label="Risk / Reward"
              value={fmtRatioOneTo(result.riskReward)}
            />
            <Stat label="Reward %" value={fmtPct(result.rewardPct)} />
            <Stat label="Risk %" value={fmtPct(result.riskPct)} tone="loss" />
            <Stat
              label="Target Multiple"
              value={fmtMult(result.targetMultiple)}
            />
            <Stat
              label="Buy Amount"
              value={amountSol != null ? fmtUnitAmt(amountSol, "SOL") : "—"}
            />
          </div>

          {usdRateMissing && (
            <p className="text-[11px] text-red-400">
              SOL price unavailable for this token — switch to SOL to apply.
            </p>
          )}

          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            data-testid="button-mini-apply"
            className="h-10 w-full bg-accent text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {applied ? "Applied — set your amount" : "Apply To Trade"}
          </button>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Apply fills your buy amount and saves the target & stop as planning
            notes. It does not place a trade — you still click Buy. Planning only,
            not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compact read-out of an applied plan, shown next to the Buy/Sell controls.
 * Pure display — clearing it only drops the local note, never a position.
 */
export function PlannedTradeSummary({
  planned,
  onClear,
}: {
  planned: PlannedTrade;
  onClear: () => void;
}) {
  return (
    <div
      data-testid="planned-trade-summary"
      className="border border-accent/40 bg-accent/5 px-3 py-2.5"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-accent">
          Planned Trade
        </span>
        <button
          type="button"
          onClick={onClear}
          data-testid="button-clear-planned"
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Target MC</span>
          <span className="font-mono">{fmtMarketCap(planned.targetMc)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Stop MC</span>
          <span className="font-mono">{fmtMarketCap(planned.stopMc)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Return</span>
          <span className="font-mono text-emerald-400">
            {fmtPct(planned.returnPct)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">R / R</span>
          <span className="font-mono">{fmtRatioOneTo(planned.riskReward)}</span>
        </div>
      </div>
    </div>
  );
}
