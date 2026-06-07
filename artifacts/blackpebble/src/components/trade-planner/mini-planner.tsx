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

/** One attachable exit order (TP or SL) carried up to the trading page. */
export interface AttachmentSpec {
  enabled: boolean;
  /** The market-cap trigger value (USD), taken from Target/Stop MC. */
  triggerMc: number | null;
  /** Percentage of the position to sell when triggered: 25 | 50 | 100. */
  percent: number;
}

export interface PlannedAttachments {
  tp: AttachmentSpec;
  sl: AttachmentSpec;
}

const PERCENT_CHOICES = [25, 50, 100] as const;

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
  onApply: (payload: {
    amount: number;
    planned: PlannedTrade;
    attachments: PlannedAttachments;
  }) => void;
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
  // Optional exit orders to attach after the next successful buy.
  const [attachTp, setAttachTp] = useState(false);
  const [attachSl, setAttachSl] = useState(false);
  const [tpPercent, setTpPercent] = useState<number>(100);
  const [slPercent, setSlPercent] = useState<number>(100);
  // Once the user manually edits Entry MC, auto-fill stops until the token
  // changes or the user clicks "Use Current MC".
  const [entryUserControlled, setEntryUserControlled] = useState(false);

  // Auto-fill / reset planning inputs when the viewed token changes so Entry MC
  // always defaults to the current token's market cap.
  const lastMint = useRef(info.mint);
  useEffect(() => {
    if (lastMint.current !== info.mint) {
      lastMint.current = info.mint;
      setEntry(currentMcStr);
      setEntryUserControlled(false);
      setTarget("");
      setStop("");
      setApplied(false);
      setAttachTp(false);
      setAttachSl(false);
    } else if (!entryUserControlled && currentMcStr !== "" && entry !== currentMcStr) {
      // First load before market cap resolved, then it arrived.
      setEntry(currentMcStr);
    }
  }, [info.mint, currentMcStr, entry, entryUserControlled]);

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

  const canAttachTp = parsed.target != null && parsed.target > 0;
  const canAttachSl = parsed.stop != null && parsed.stop > 0;

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
      attachments: {
        tp: {
          enabled: attachTp && canAttachTp,
          triggerMc: parsed.target,
          percent: tpPercent,
        },
        sl: {
          enabled: attachSl && canAttachSl,
          triggerMc: parsed.stop,
          percent: slPercent,
        },
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
              onChange={(v) => {
                setEntryUserControlled(true);
                setApplied(false);
                setEntry(v);
              }}
              placeholder="e.g. 100k"
              action={{
                label: "Use Current MC",
                onClick: () => {
                  setEntryUserControlled(false);
                  setApplied(false);
                  setEntry(currentMcStr);
                },
              }}
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

          {/* Optional exit orders (TP/SL) attached after the next buy. */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Attach Exit Orders (optional)
            </div>
            <AttachRow
              label="Take Profit"
              triggerLabel="Sells when MC ≥ Target"
              triggerMc={parsed.target}
              canEnable={canAttachTp}
              disabledHint="Set a Target MC to enable"
              enabled={attachTp}
              onToggle={(v) => {
                setApplied(false);
                setAttachTp(v);
              }}
              percent={tpPercent}
              onPercent={(p) => {
                setApplied(false);
                setTpPercent(p);
              }}
              tone="profit"
            />
            <AttachRow
              label="Stop Loss"
              triggerLabel="Sells when MC ≤ Stop"
              triggerMc={parsed.stop}
              canEnable={canAttachSl}
              disabledHint="Set a Stop MC to enable"
              enabled={attachSl}
              onToggle={(v) => {
                setApplied(false);
                setAttachSl(v);
              }}
              percent={slPercent}
              onPercent={(p) => {
                setApplied(false);
                setSlPercent(p);
              }}
              tone="loss"
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Exit orders are created only after your next successful Buy and run
              automatically against the live market cap.
            </p>
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
 * One attachable exit-order row: a toggle to enable it, a 25/50/100% size
 * selector, and a read-out of the resulting trigger. Disabled until the
 * corresponding Target/Stop MC is set so the trigger is always concrete.
 */
function AttachRow({
  label,
  triggerLabel,
  triggerMc,
  canEnable,
  disabledHint,
  enabled,
  onToggle,
  percent,
  onPercent,
  tone,
}: {
  label: string;
  triggerLabel: string;
  triggerMc: number | null;
  canEnable: boolean;
  disabledHint: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  percent: number;
  onPercent: (p: number) => void;
  tone: "profit" | "loss";
}) {
  const active = enabled && canEnable;
  return (
    <div className="border border-border bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            disabled={!canEnable}
            onChange={(e) => onToggle(e.target.checked)}
            data-testid={`checkbox-attach-${label.toLowerCase().replace(/\s/g, "-")}`}
            className="h-4 w-4 accent-[var(--accent)] disabled:opacity-40"
          />
          <span
            className={cn(
              "font-medium",
              tone === "profit" ? "text-emerald-400" : "text-red-400",
              !canEnable && "opacity-60",
            )}
          >
            {label}
          </span>
        </label>
        {canEnable ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {triggerLabel.replace("Target", "").replace("Stop", "")}{" "}
            {fmtMarketCap(triggerMc)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">{disabledHint}</span>
        )}
      </div>

      {active && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Sell
          </span>
          <div className="flex gap-1">
            {PERCENT_CHOICES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPercent(p)}
                data-testid={`button-attach-pct-${label.toLowerCase().replace(/\s/g, "-")}-${p}`}
                className={cn(
                  "h-7 px-2.5 text-xs font-medium border transition-colors",
                  percent === p
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {p}%
              </button>
            ))}
          </div>
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
