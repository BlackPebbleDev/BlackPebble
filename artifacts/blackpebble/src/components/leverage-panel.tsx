import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { api, type TokenInfo } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { useTradeRate } from "@/hooks/use-sol-usd";
import { useToast } from "@/hooks/use-toast";
import { useXAuth } from "@/hooks/use-x-auth";
import { fmtSol, fmtMarketCap, fmtPercent, fmtPrice } from "@/lib/format";
import { fmtUnitAmt } from "@/components/trade-planner/util";
import { parseAbbreviatedNumber, type Unit } from "@/lib/trade-planner";
import { impactColor as liquidityImpactColor, fmtImpact } from "@/lib/liquidity";
import { cn } from "@/lib/utils";

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const LEVERAGE_OPTIONS = [2, 5, 10, 20] as const;
const MIN_MARGIN_SOL = 0.1;
const MAINTENANCE_BUFFER = 0.005;
const SOL_MARGIN_PRESETS = [0.5, 1, 5, 10];
const USD_MARGIN_PRESETS = [25, 50, 100, 500];
const ROI_EXAMPLES = [0.2, 0.5, 1.0];

/** Amount shown in the active unit (margin/size are SOL internally). */
function unitAmt(solValue: number, unit: Unit, solUsd: number | null): string {
  if (unit === "USD" && solUsd != null && solUsd > 0) {
    return fmtUnitAmt(solValue * solUsd, "USD");
  }
  return fmtUnitAmt(solValue, "SOL");
}

/**
 * Leverage trade box (Phase 1: longs only). Fully separate from the spot panel.
 * Margin is debited from the paper balance; max loss is the margin (equity can
 * never go negative). Liquidation level + ROI previews update live as the trader
 * edits. Optional Take Profit / Stop Loss (by market cap) attach to the position.
 */
export function LeveragePanel({ info }: { info: TokenInfo }) {
  const { wallet, account, isGuest, loading: accountLoading, refresh } =
    useAccount();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { login } = useXAuth();

  // USD is the default trade-size unit app-wide; only an explicit prior SOL
  // choice (this session) overrides it. Shares the spot panel's session key so
  // the two stay in sync.
  const [unit, setUnit] = useState<Unit>(() => {
    try {
      return sessionStorage.getItem("bp:trade-unit") === "SOL" ? "SOL" : "USD";
    } catch {
      return "USD";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("bp:trade-unit", unit);
    } catch {
      /* ignore (private mode / disabled storage) */
    }
  }, [unit]);
  const [margin, setMargin] = useState("");
  const [leverage, setLeverage] = useState<number>(2);
  const [exitOpen, setExitOpen] = useState(false);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpMc, setTpMc] = useState("");
  const [slMc, setSlMc] = useState("");

  const cashBalance = account?.paper_balance ?? 0;
  // Authoritative SOL/USD rate (position-independent). `rate` is the trusted value
  // used for sizing + validation; `solUsd` is the best-effort display value; the
  // panel disables submission until `rateReady` so an order is never sized against
  // a stale per-token quote that has collapsed toward ~1.
  const { solUsd, rate, rateReady } = useTradeRate(info);
  const usdUnavailable = unit === "USD" && !rateReady;

  // Convert the (possibly USD) margin field into the SOL the API expects, using
  // the trusted rate only.
  const marginSol = useMemo(() => {
    const n = Number(margin);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    if (unit === "SOL") return n;
    return rate != null && rate > 0 ? n / rate : NaN;
  }, [margin, unit, rate]);
  // Raw USD margin (USD mode only) — sent so the server re-derives margin from its
  // own authoritative SOL price (defence in depth; client rate is never trusted).
  const marginUsd = useMemo(() => {
    if (unit !== "USD") return null;
    const n = Number(margin);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [margin, unit]);

  const marginValid = Number.isFinite(marginSol) && marginSol >= MIN_MARGIN_SOL;
  const notionalSol = marginValid ? marginSol * leverage : 0;
  const insufficient = marginValid && marginSol > cashBalance;

  // Debounced position size so we don't re-quote on every keystroke. The quote
  // is read-only — it only surfaces the slippage / liquidity impact the opening
  // fill would incur; it never changes how the position is priced server-side.
  const [debouncedNotional, setDebouncedNotional] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedNotional(notionalSol), 350);
    return () => clearTimeout(id);
  }, [notionalSol]);
  const quoteEnabled = debouncedNotional > 0;
  const { data: quote, isFetching: quoteFetching } = useQuery({
    queryKey: ["leverage-quote", info.mint, debouncedNotional],
    queryFn: () =>
      api.quote({ mint: info.mint, side: "buy", solAmount: debouncedNotional }),
    enabled: quoteEnabled,
    staleTime: 10_000,
  });
  const quoteReady = quoteEnabled && quote?.ok === true;

  // Reset the form whenever the token changes.
  useEffect(() => {
    setMargin("");
    setLeverage(2);
    setTpEnabled(false);
    setSlEnabled(false);
    setTpMc("");
    setSlMc("");
  }, [info.mint]);

  // Liquidation preview: price (and thus MC) at liquidation is
  // entry × (1 − (1/lev − buffer)).
  const liqDropPercent = 1 / leverage - MAINTENANCE_BUFFER;
  const entryMc = info.marketCapUsd;
  const liqMarketCap = useMemo(() => {
    if (entryMc == null || entryMc <= 0) return null;
    return entryMc * (1 - liqDropPercent);
  }, [entryMc, liqDropPercent]);
  // Liquidation price in USD: entry price scaled by the same liquidation drop.
  const liqPriceUsd = useMemo(() => {
    if (info.priceUsd == null || info.priceUsd <= 0) return null;
    return info.priceUsd * (1 - liqDropPercent);
  }, [info.priceUsd, liqDropPercent]);

  // TP/SL validation against entry & liquidation market caps. Triggers need a
  // known entry market cap to be meaningful, so they're disabled without one.
  const exitsAvailable = entryMc != null && entryMc > 0;
  const tpMcNum = parseAbbreviatedNumber(tpMc);
  const slMcNum = parseAbbreviatedNumber(slMc);
  const tpInvalid =
    tpEnabled && (tpMcNum == null || (entryMc != null && tpMcNum <= entryMc));
  const slInvalid =
    slEnabled &&
    (slMcNum == null ||
      (entryMc != null && slMcNum >= entryMc) ||
      (liqMarketCap != null && slMcNum <= liqMarketCap));

  const mutation = useMutation({
    mutationFn: async () => {
      // Refetch the balance immediately before submitting so the client gate is
      // checked against the freshest cash balance (the server re-validates FOR
      // UPDATE regardless, so this is purely for an accurate pre-submit UI).
      await refresh();
      return api.leverage.open({
        wallet: wallet!,
        mint: info.mint,
        symbol: info.symbol,
        name: info.name,
        logo: info.logo,
        marginSol,
        marginUsd,
        leverage,
        tpTriggerMc: tpEnabled && !tpInvalid ? tpMcNum : null,
        slTriggerMc: slEnabled && !slInvalid ? slMcNum : null,
      });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast({
          title: "Position not opened",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `Opened ${leverage}x long`,
        description: `${fmtSol(marginSol)} SOL margin → ${fmtSol(
          notionalSol,
        )} SOL position`,
      });
      setMargin("");
      setTpEnabled(false);
      setSlEnabled(false);
      setTpMc("");
      setSlMc("");
      qc.invalidateQueries({ queryKey: ["leverage-positions"] });
      qc.invalidateQueries({ queryKey: ["leverage-history"] });
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["pf"] });
      qc.invalidateQueries({ queryKey: ["pf-stats"] });
    },
    onError: (e: Error) =>
      toast({
        title: "Position not opened",
        description: e.message,
        variant: "destructive",
      }),
  });

  if (isGuest || !wallet) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.12] to-amber-500/[0.04] px-4 py-4 shadow-card">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Sign in required
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Connect X to save leverage positions, track margin, and build your
            BlackPebble trading history.
          </p>
          <button
            type="button"
            onClick={() => login()}
            data-testid="button-leverage-connect"
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/90 transition-colors"
          >
            <XLogo className="w-3.5 h-3.5" />
            Connect X
          </button>
        </div>
      </div>
    );
  }

  const canSubmit =
    marginValid &&
    !insufficient &&
    !usdUnavailable &&
    !tpInvalid &&
    !slInvalid &&
    !accountLoading &&
    !!account &&
    !mutation.isPending;

  return (
    <div className="p-4 space-y-4" data-testid="panel-leverage">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Cash balance</span>
        <span className="font-mono text-foreground">
          {unitAmt(cashBalance, unit, solUsd)}
        </span>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-xs text-muted-foreground">Margin ({unit})</label>
          <div
            role="tablist"
            aria-label="Margin unit"
            className="inline-flex border border-border rounded-md p-0.5"
          >
            {(["SOL", "USD"] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                role="tab"
                aria-selected={unit === u}
                onClick={() => setUnit(u)}
                data-testid={`toggle-leverage-margin-${u}`}
                className={cn(
                  "px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors",
                  unit === u
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <input
          type="number"
          value={margin}
          onChange={(e) => setMargin(e.target.value)}
          placeholder={unit === "SOL" ? "0.0" : "0"}
          min={unit === "SOL" ? MIN_MARGIN_SOL : 1}
          step={unit === "SOL" ? 0.1 : 1}
          data-testid="input-leverage-margin"
          className="w-full h-11 bg-background border border-border px-3 font-mono text-sm focus:outline-none focus:border-accent"
        />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {(unit === "SOL" ? SOL_MARGIN_PRESETS : USD_MARGIN_PRESETS).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setMargin(String(p))}
              data-testid={`preset-leverage-margin-${p}`}
              className="py-2 text-xs border border-border hover:border-accent hover:text-accent transition-colors font-mono rounded-md"
            >
              {unit === "USD" ? `$${p}` : p}
            </button>
          ))}
        </div>
        {usdUnavailable && (
          <p className="mt-1 text-[11px] text-amber-400">
            USD value unavailable until SOL price loads.
          </p>
        )}
        {insufficient && (
          <p className="mt-1 text-[11px] text-red-400">
            Margin exceeds your cash balance.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs text-muted-foreground">
          Leverage
        </label>
        <div className="grid grid-cols-4 gap-2">
          {LEVERAGE_OPTIONS.map((lv) => (
            <button
              key={lv}
              type="button"
              onClick={() => setLeverage(lv)}
              data-testid={`button-leverage-${lv}x`}
              className={cn(
                "h-10 text-sm font-medium border transition-colors rounded-md",
                leverage === lv
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {lv}x
            </button>
          ))}
        </div>
      </div>

      {/* Optional Take Profit / Stop Loss — collapsed by default to keep the
          panel compact. Both are market-cap triggers evaluated server-side. */}
      <div className="border border-border/60 rounded-md">
        <button
          type="button"
          onClick={() => setExitOpen((o) => !o)}
          data-testid="button-leverage-exits-toggle"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-1.5">
            Take Profit / Stop Loss
            <span className="text-muted-foreground/70">(optional)</span>
            {(tpEnabled || slEnabled) && (
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              exitOpen && "rotate-180",
            )}
          />
        </button>
        {exitOpen && (
          <div className="border-t border-border/60 px-3 py-2.5 space-y-2.5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tpEnabled}
                  onChange={(e) => setTpEnabled(e.target.checked)}
                  disabled={!exitsAvailable}
                  data-testid="checkbox-leverage-tp"
                  className="h-3.5 w-3.5 accent-[var(--accent)] disabled:opacity-50"
                />
                <span className="w-[74px] shrink-0 text-xs font-medium text-emerald-400">
                  Take Profit
                </span>
                <input
                  type="text"
                  value={tpMc}
                  onChange={(e) => setTpMc(e.target.value)}
                  disabled={!tpEnabled}
                  placeholder="Take Profit MC"
                  data-testid="input-leverage-tp-mc"
                  className="flex-1 h-7 bg-background border border-border px-2 font-mono text-[11px] focus:outline-none focus:border-accent disabled:opacity-50"
                />
              </div>
              {tpInvalid && (
                <p className="pl-5 text-[11px] text-red-400">
                  Take Profit must be above the entry market cap.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={slEnabled}
                  onChange={(e) => setSlEnabled(e.target.checked)}
                  disabled={!exitsAvailable}
                  data-testid="checkbox-leverage-sl"
                  className="h-3.5 w-3.5 accent-[var(--accent)] disabled:opacity-50"
                />
                <span className="w-[74px] shrink-0 text-xs font-medium text-red-400">
                  Stop Loss
                </span>
                <input
                  type="text"
                  value={slMc}
                  onChange={(e) => setSlMc(e.target.value)}
                  disabled={!slEnabled}
                  placeholder="Stop Loss MC"
                  data-testid="input-leverage-sl-mc"
                  className="flex-1 h-7 bg-background border border-border px-2 font-mono text-[11px] focus:outline-none focus:border-accent disabled:opacity-50"
                />
              </div>
              {slInvalid && (
                <p className="pl-5 text-[11px] text-red-400">
                  Stop Loss must sit between liquidation and the entry market cap.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5 border border-border bg-background/50 p-3 rounded-md text-xs">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <PreviewRow label="Margin used" value={marginValid ? unitAmt(marginSol, unit, solUsd) : "—"} />
          <PreviewRow label="Position size" value={marginValid ? unitAmt(notionalSol, unit, solUsd) : "—"} />
          <PreviewRow
            label="Est. slippage"
            value={
              quoteReady
                ? `${quote!.slippagePercent.toFixed(2)}%`
                : quoteFetching
                  ? "…"
                  : "—"
            }
          />
          <PreviewRow
            label="Liquidity impact"
            value={quoteReady ? fmtImpact(quote!.tradeImpactPercent) : quoteFetching ? "…" : "—"}
            valueClass={quoteReady ? liquidityImpactColor(quote!.tradeImpactPercent) : undefined}
            testId="leverage-liquidity-impact"
          />
          <PreviewRow
            label="Max loss"
            value={marginValid ? unitAmt(marginSol, unit, solUsd) : "—"}
            valueClass="text-red-400"
          />
          <PreviewRow label="Entry MC" value={fmtMarketCap(entryMc)} />
          <PreviewRow
            label="Liq. price"
            value={liqPriceUsd != null ? fmtPrice(liqPriceUsd) : "—"}
            valueClass="text-red-400"
          />
          <PreviewRow
            label="Est. liq. MC"
            value={liqMarketCap != null ? fmtMarketCap(liqMarketCap) : "—"}
            valueClass="text-red-400"
          />
          <PreviewRow
            label="Est. liq. %"
            value={fmtPercent(-liqDropPercent * 100)}
            valueClass="text-red-400"
          />
        </div>

        <div className="border-t border-border/60 pt-2">
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            ROI preview (price move)
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ROI_EXAMPLES.map((mv) => {
              const pnlSol = notionalSol * mv;
              const roiPct = leverage * mv * 100;
              return (
                <div
                  key={mv}
                  className="border border-border/60 bg-background/40 px-2 py-1.5 rounded-md text-center"
                  data-testid={`roi-preview-${mv}`}
                >
                  <div className="text-[11px] text-muted-foreground">
                    +{mv * 100}%
                  </div>
                  <div className="font-mono text-[11px] text-emerald-400">
                    {marginValid ? `+${unitAmt(pnlSol, unit, solUsd)}` : "—"}
                  </div>
                  <div className="text-[10px] text-emerald-400/80">
                    +{roiPct.toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => mutation.mutate()}
        data-testid="button-leverage-open"
        className={cn(
          "w-full h-11 text-sm font-medium transition-colors rounded-md flex items-center justify-center gap-2",
          canSubmit
            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-400/40 hover:bg-emerald-500/25"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        )}
      >
        {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {marginValid
          ? `Open ${leverage}x Long`
          : `Min margin ${MIN_MARGIN_SOL} SOL`}
      </button>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Longs only. Your position is force-closed if the price falls to the
        liquidation level, losing the full margin. Leverage P&L is tracked
        separately from your spot stats and the leaderboard.
      </p>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  valueClass,
  testId,
}: {
  label: string;
  value: string;
  valueClass?: string;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn("font-mono text-foreground", valueClass)}
        data-testid={testId}
      >
        {value}
      </span>
    </div>
  );
}
