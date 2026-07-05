/**
 * Mini Trade Planner - a compact execution assistant embedded in the token
 * trading page (below the Buy/Sell panel). It is intentionally lighter than the
 * full Utilities Trade Planner: plan an entry/target/stop + size, see the
 * headline outcome, then "Apply To Trade" to pre-fill the existing buy amount.
 *
 * It never executes a trade and never touches paper-trading state directly - it
 * only hands a SOL amount + planned target/stop up to the trading page via the
 * `onApply` callback. All math is pure (see computeMiniPlan).
 *
 * Phase 2: also supports setting a Buy Limit order. When enabled, the trading
 * page creates the buy-limit order immediately on Apply - before the user
 * clicks Buy - so the token is purchased automatically when its MC dips.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TokenInfo } from "@/lib/api";
import {
  computeMiniPlan,
  parseAbbreviatedNumber,
  type Unit,
} from "@/lib/trade-planner";
import { SegmentedToggle, PlannerField, Stat } from "./primitives";
import { fmtUnitAmt, fmtPct, fmtMult, fmtRatioOneTo } from "./util";
import { fmtMarketCap, fmtSol } from "@/lib/format";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useTradeRate } from "@/hooks/use-sol-usd";

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

/** Buy-limit spec carried up to the trading page. Created immediately on Apply. */
export interface BuyLimitSpec {
  enabled: boolean;
  /** Buy when MC drops to or below this value (USD). Taken from Entry MC. */
  triggerMc: number | null;
  /** SOL amount to spend when the order fires. */
  solAmount: number | null;
}

export interface PlannedAttachments {
  tp: AttachmentSpec;
  sl: AttachmentSpec;
  buyLimit: BuyLimitSpec;
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
  const flags = useFeatureFlags();
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
  // Buy limit order: created immediately on Apply (no Buy click needed).
  const [attachBl, setAttachBl] = useState(false);
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
      setAttachBl(false);
    } else if (!entryUserControlled && currentMcStr !== "" && entry !== currentMcStr) {
      setEntry(currentMcStr);
    }
  }, [info.mint, currentMcStr, entry, entryUserControlled]);

  useEffect(() => writeSession(OPEN_KEY, open ? "1" : "0"), [open]);
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

  // Authoritative SOL/USD rate - `rate` for the SOL amount applied to the buy
  // field, `rateReady` to gate Apply. Using the trusted rate (not the per-token
  // quote) keeps the applied SOL amount correct when the quote is stale.
  const { rate, rateReady } = useTradeRate(info);

  // The SOL value that would be pushed into the buy field on Apply.
  const amountSol = useMemo(() => {
    const amt = parsed.investment;
    if (amt == null || amt <= 0) return null;
    if (unit === "SOL") return amt;
    return rate != null && rate > 0 ? amt / rate : null;
  }, [parsed.investment, unit, rate]);

  const usdRateMissing = unit === "USD" && !rateReady;

  // Field-level validation for a long trade. Only flags a field once the user
  // has entered a value (blank Target/Stop are optional and never error), so the
  // form stays quiet until there is something concrete to validate.
  const entryError =
    parsed.entry != null && parsed.entry <= 0
      ? "Entry MC must be greater than 0."
      : undefined;
  const targetError =
    parsed.target != null && parsed.entry != null && parsed.entry > 0
      ? parsed.target <= 0
        ? "Target MC must be greater than 0."
        : parsed.target <= parsed.entry
          ? "Target MC must be above Entry MC."
          : undefined
      : parsed.target != null && parsed.target <= 0
        ? "Target MC must be greater than 0."
        : undefined;
  const stopError =
    parsed.stop != null && parsed.entry != null && parsed.entry > 0
      ? parsed.stop <= 0
        ? "Stop MC must be greater than 0."
        : parsed.stop >= parsed.entry
          ? "Stop MC must be below Entry MC."
          : undefined
      : parsed.stop != null && parsed.stop <= 0
        ? "Stop MC must be greater than 0."
        : undefined;
  const investmentError =
    parsed.investment != null && parsed.investment <= 0
      ? "Investment must be greater than 0."
      : undefined;
  const hasFieldError =
    !!entryError || !!targetError || !!stopError || !!investmentError;

  const canApply =
    parsed.investment != null &&
    parsed.investment > 0 &&
    !hasFieldError &&
    !(unit === "USD" && !rateReady);

  const canAttachTp = parsed.target != null && parsed.target > 0;
  const canAttachSl = parsed.stop != null && parsed.stop > 0;
  // Buy limit needs: entry MC set + investment ≥ 0.1 SOL
  const canAttachBl =
    parsed.entry != null &&
    parsed.entry > 0 &&
    amountSol != null &&
    amountSol >= 0.1;

  // Whether the planned entry MC is BELOW current (i.e., waiting for a dip).
  const blBelowCurrent =
    parsed.entry != null &&
    currentMc != null &&
    parsed.entry < currentMc;

  function handleApply() {
    if (!canApply || parsed.investment == null) return;
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
          enabled: attachTp && canAttachTp && flags.tp_sl,
          triggerMc: parsed.target,
          percent: tpPercent,
        },
        sl: {
          enabled: attachSl && canAttachSl && flags.tp_sl,
          triggerMc: parsed.stop,
          percent: slPercent,
        },
        buyLimit: {
          enabled: attachBl && canAttachBl && flags.buy_limits,
          triggerMc: parsed.entry,
          solAmount: amountSol,
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
    <div className="rounded-xl bg-card shadow-card overflow-hidden" data-testid="mini-planner">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="button-mini-planner-toggle"
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary/40"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          Advanced Trade Planner
          <span className="text-[11px] font-normal text-muted-foreground">
            (Optional)
          </span>
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
              error={entryError}
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
              error={targetError}
              testId="input-mini-target"
            />
            <PlannerField
              label="Stop MC"
              value={stop}
              onChange={edited(setStop)}
              placeholder="e.g. 70k"
              error={stopError}
              testId="input-mini-stop"
            />
            <PlannerField
              label="Investment"
              value={investment}
              onChange={edited(setInvestment)}
              placeholder={unit === "SOL" ? "e.g. 2" : "e.g. 250"}
              unit={unit}
              error={investmentError}
              testId="input-mini-investment"
            />
          </div>

          {blBelowCurrent && (
            attachBl ? (
              <div
                data-testid="mini-buy-limit-scenario"
                className="flex items-start gap-1.5 text-[11px] leading-relaxed text-blue-400"
              >
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Buy Limit Scenario - order stays pending until market cap
                  drops to {fmtMarketCap(parsed.entry)}.
                </span>
              </div>
            ) : (
              <p
                data-testid="mini-below-current-warning"
                className="text-[11px] leading-relaxed text-warning"
              >
                Earlier Entry Scenario - calculations assume entry at{" "}
                {fmtMarketCap(parsed.entry)} MC rather than the current price.
              </p>
            )
          )}

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
              help="How much you stand to gain compared to what you risk. A 1:3 ratio means the potential reward is three times the potential loss - higher is generally better."
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

          {/* Buy Limit order (phase 2): auto-buy when MC dips to Entry MC. */}
          {flags.buy_limits && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Buy Limit (optional)
            </div>
            <div className="rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={attachBl && canAttachBl}
                    disabled={!canAttachBl}
                    onChange={(e) => {
                      setApplied(false);
                      setAttachBl(e.target.checked);
                    }}
                    data-testid="checkbox-attach-buy-limit"
                    className="h-4 w-4 accent-[var(--accent)] disabled:opacity-40"
                  />
                  <span
                    className={cn(
                      "font-medium text-accent",
                      !canAttachBl && "opacity-60",
                    )}
                  >
                    Buy Limit
                  </span>
                </label>
                {canAttachBl ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {fmtSol(amountSol ?? 0)} SOL @ ≤ {fmtMarketCap(parsed.entry)} MC
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    Set Entry MC + Investment (≥ 0.1 SOL)
                  </span>
                )}
              </div>
              {attachBl && canAttachBl && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {blBelowCurrent
                    ? `Order created now - will auto-buy when MC drops to ${fmtMarketCap(parsed.entry)}.`
                    : `Entry MC is at or above current price - order will fire if MC dips to ${fmtMarketCap(parsed.entry)}.`}
                </p>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Buy limit orders are created immediately when you click Apply and
              fill automatically when the live market cap reaches your target.
              Capped at 5 active orders per account.
            </p>
          </div>
          )}

          {/* Optional exit orders (TP/SL) attached after the next buy. */}
          {flags.tp_sl && (
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
              fixedPercent
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Exit orders are created only after your next successful Buy and run
              automatically against the live market cap.
            </p>
          </div>
          )}

          {usdRateMissing && (
            <p className="text-[11px] text-danger">
              SOL price unavailable for this token - switch to SOL to apply.
            </p>
          )}

          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            data-testid="button-mini-apply"
            className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-card transition-all hover:bg-accent/90 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {applied ? "Applied ✓" : "Apply To Trade"}
          </button>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Apply fills your buy amount and saves the target & stop as planning
            notes. If Buy Limit is enabled, the order is created immediately. You
            still click Buy for an immediate trade. Planning only, not financial
            advice.
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
  fixedPercent = false,
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
  fixedPercent?: boolean;
}) {
  const active = enabled && canEnable;
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
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
              tone === "profit" ? "text-success" : "text-danger",
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

      {active && fixedPercent && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Sells <span className="font-mono text-foreground">100%</span> of your
          remaining position when triggered.
        </div>
      )}

      {active && !fixedPercent && (
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
                  "h-7 px-2.5 rounded-md text-xs font-medium border transition-colors",
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
 * Pure display - clearing it only drops the local note, never a position.
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
          <span className="font-mono text-success">
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
