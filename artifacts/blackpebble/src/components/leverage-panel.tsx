import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { api, type TokenInfo } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { useToast } from "@/hooks/use-toast";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { fmtSol, fmtMarketCap, fmtPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEVERAGE_OPTIONS = [2, 5, 10, 20] as const;
const MIN_MARGIN_SOL = 0.1;
const MAINTENANCE_BUFFER = 0.005;

/**
 * Leverage trade box (Phase 1: longs only). Fully separate from the spot panel.
 * Margin is debited from the paper balance; max loss is the margin (equity can
 * never go negative). Liquidation level is shown live as the trader edits.
 */
export function LeveragePanel({ info }: { info: TokenInfo }) {
  const { wallet, account, isGuest } = useAccount();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [margin, setMargin] = useState("");
  const [leverage, setLeverage] = useState<number>(2);

  const cashBalance = account?.paper_balance ?? 0;
  const marginNum = Number(margin);
  const marginValid = Number.isFinite(marginNum) && marginNum >= MIN_MARGIN_SOL;
  const notionalSol = marginValid ? marginNum * leverage : 0;

  // Reset the form whenever the token changes.
  useEffect(() => {
    setMargin("");
    setLeverage(2);
  }, [info.mint]);

  // Liquidation preview, derived from the current entry market cap. The price
  // (and thus MC) at liquidation is entry × (1 − (1/lev − buffer)).
  const liqDropPercent = 1 / leverage - MAINTENANCE_BUFFER;
  const liqMarketCap = useMemo(() => {
    if (info.marketCapUsd == null || info.marketCapUsd <= 0) return null;
    return info.marketCapUsd * (1 - liqDropPercent);
  }, [info.marketCapUsd, liqDropPercent]);

  const insufficient = marginValid && marginNum > cashBalance;

  const mutation = useMutation({
    mutationFn: () =>
      api.leverage.open({
        wallet: wallet!,
        mint: info.mint,
        symbol: info.symbol,
        name: info.name,
        logo: info.logo,
        marginSol: marginNum,
        leverage,
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
        description: `${fmtSol(marginNum)} SOL margin → ${fmtSol(
          notionalSol,
        )} SOL position`,
      });
      setMargin("");
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

  const canSubmit = marginValid && !insufficient && !mutation.isPending;

  return (
    <div className="p-4 space-y-4" data-testid="panel-leverage">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Cash balance</span>
        <span className="font-mono text-foreground">
          {fmtSol(cashBalance)} SOL
        </span>
      </div>

      <div>
        <label className="mb-1.5 block text-xs text-muted-foreground">
          Margin (SOL)
        </label>
        <input
          type="number"
          value={margin}
          onChange={(e) => setMargin(e.target.value)}
          placeholder="0.0"
          min={MIN_MARGIN_SOL}
          step={0.1}
          data-testid="input-leverage-margin"
          className="w-full h-11 bg-background border border-border px-3 font-mono text-sm focus:outline-none focus:border-accent"
        />
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

      <div className="space-y-1.5 border border-border bg-background/50 p-3 rounded-md text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Position size</span>
          <span className="font-mono text-foreground">
            {fmtSol(notionalSol)} SOL
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Entry market cap</span>
          <span className="font-mono text-foreground">
            {fmtMarketCap(info.marketCapUsd)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Est. liquidation</span>
          <span className="font-mono text-red-400">
            {liqMarketCap != null ? fmtMarketCap(liqMarketCap) : "—"}
            <span className="ml-1 text-muted-foreground">
              ({fmtPercent(-liqDropPercent * 100)})
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Max loss</span>
          <span className="font-mono text-red-400">
            {marginValid ? `${fmtSol(marginNum)} SOL` : "—"}
          </span>
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
