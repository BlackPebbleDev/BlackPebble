import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { api, type TokenInfo } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { useToast } from "@/hooks/use-toast";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { fmtSol, fmtMarketCap, fmtPercent } from "@/lib/format";
import { fmtUnitAmt } from "@/components/trade-planner/util";
import { parseAbbreviatedNumber, type Unit } from "@/lib/trade-planner";
import { cn } from "@/lib/utils";

const LEVERAGE_OPTIONS = [2, 5, 10, 20] as const;
const MIN_MARGIN_SOL = 0.1;
const MAINTENANCE_BUFFER = 0.005;
const SOL_MARGIN_PRESETS = [0.5, 1, 5, 10];
const USD_MARGIN_PRESETS = [25, 50, 100, 500];
const ROI_EXAMPLES = [0.2, 0.5, 1.0];

/** SOL/USD rate from a token quote, or null when it can't be derived. */
function solUsdFromInfo(info: TokenInfo): number | null {
  return info.priceUsd != null && info.priceSol != null && info.priceSol > 0
    ? info.priceUsd / info.priceSol
    : null;
}

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
  const { wallet, account, isGuest } = useAccount();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [unit, setUnit] = useState<Unit>("SOL");
  const [margin, setMargin] = useState("");
  const [leverage, setLeverage] = useState<number>(2);
  const [exitOpen, setExitOpen] = useState(false);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpMc, setTpMc] = useState("");
  const [slMc, setSlMc] = useState("");

  const cashBalance = account?.paper_balance ?? 0;
  const solUsd = solUsdFromInfo(info);
  const usdUnavailable = unit === "USD" && (solUsd == null || solUsd <= 0);

  // Convert the (possibly USD) margin field into the SOL the API expects.
  const marginSol = useMemo(() => {
    const n = Number(margin);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    if (unit === "SOL") return n;
    return solUsd != null && solUsd > 0 ? n / solUsd : NaN;
  }, [margin, unit, solUsd]);

  const marginValid = Number.isFinite(marginSol) && marginSol >= MIN_MARGIN_SOL;
  const notionalSol = marginValid ? marginSol * leverage : 0;
  const insufficient = marginValid && marginSol > cashBalance;

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
    mutationFn: () =>
      api.leverage.open({
        wallet: wallet!,
        mint: info.mint,
        symbol: info.symbol,
        name: info.name,
        logo: info.logo,
        marginSol,
        leverage,
        tpTriggerMc: tpEnabled && !tpInvalid ? tpMcNum : null,
        slTriggerMc: slEnabled && !slInvalid ? slMcNum : null,
      }),
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
        <div className="border border-amber-500/30 bg-amber-500/10 px-4 py-3 rounded-md">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Sign in required
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Leverage trading needs a connected wallet so positions and margin can
            be tracked.
          </p>
          <button
            type="button"
            onClick={() => setWalletModalVisible(true)}
            data-testid="button-leverage-connect"
            className="mt-2.5 h-9 w-full bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/90 transition-colors rounded-md"
          >
            Connect Wallet
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
                  "px-2 py-0.5 text-[11px] font-medium rounded-[4px] transition-colors",
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
            label="Max loss"
            value={marginValid ? unitAmt(marginSol, unit, solUsd) : "—"}
            valueClass="text-red-400"
          />
          <PreviewRow label="Entry MC" value={fmtMarketCap(entryMc)} />
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
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-foreground", valueClass)}>{value}</span>
    </div>
  );
}
