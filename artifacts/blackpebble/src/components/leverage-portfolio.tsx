import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  api,
  type LeverageFill,
  type LeveragePosition,
  type LeverageTrade,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { fmtSol, fmtMarketCap, fmtPercent, pnlColor, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const FILL_LABELS: Record<string, string> = {
  liquidated: "Liquidated",
  take_profit: "Take-profit hit",
  stop_loss: "Stop-loss hit",
  manual: "Closed",
};

/**
 * Leverage portfolio section: open positions (live unrealized P&L + liquidation)
 * and leverage trade history. Polls positions so liquidation / TP / SL evaluate
 * server-side; surfaces any auto-closes as toasts. Signed-in only.
 */
export function LeveragePortfolioSection({
  wallet,
  onNavigate,
}: {
  wallet: string;
  onNavigate: (mint: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const seenFills = useRef<Set<number>>(new Set());

  const { data: posData } = useQuery({
    queryKey: ["leverage-positions", wallet],
    queryFn: () => api.leverage.positions(wallet),
    enabled: !!wallet,
    refetchInterval: 15_000,
  });
  const { data: histData } = useQuery({
    queryKey: ["leverage-history", wallet],
    queryFn: () => api.leverage.history(wallet),
    enabled: !!wallet,
  });

  const positions = posData?.positions ?? [];
  const trades = histData?.trades ?? [];

  // Toast any newly auto-closed positions, then refresh balance + history.
  useEffect(() => {
    const fills = posData?.fills ?? [];
    const fresh = fills.filter((f) => !seenFills.current.has(f.positionId));
    if (fresh.length === 0) return;
    for (const f of fresh) {
      seenFills.current.add(f.positionId);
      announceFill(f, toast);
    }
    qc.invalidateQueries({ queryKey: ["account"] });
    qc.invalidateQueries({ queryKey: ["leverage-history", wallet] });
  }, [posData?.fills, qc, toast, wallet]);

  const openMargin = positions.reduce((s, p) => s + p.margin_sol, 0);
  const unrealized = positions.reduce((s, p) => s + (p.unrealizedPnlSol ?? 0), 0);
  const realized = trades
    .filter((t) => t.action === "close" || t.action === "liquidated")
    .reduce((s, t) => s + (t.pnl_sol ?? 0), 0);

  const closeMutation = useMutation({
    mutationFn: (id: number) => api.leverage.close(wallet, id),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({
          title: "Close failed",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Position closed",
        description:
          res.realizedPnlSol != null
            ? `P&L ${fmtSol(res.realizedPnlSol)} SOL`
            : undefined,
      });
      qc.invalidateQueries({ queryKey: ["leverage-positions", wallet] });
      qc.invalidateQueries({ queryKey: ["leverage-history", wallet] });
      qc.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (e: Error) =>
      toast({ title: "Close failed", description: e.message, variant: "destructive" }),
  });

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Leverage Positions ({positions.length})
        </h2>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            Margin{" "}
            <span className="font-mono text-foreground">{fmtSol(openMargin)}</span>
          </span>
          <span>
            Unrealized{" "}
            <span className={cn("font-mono", pnlColor(unrealized))}>
              {fmtSol(unrealized)}
            </span>
          </span>
          <span>
            Realized{" "}
            <span className={cn("font-mono", pnlColor(realized))}>
              {fmtSol(realized)}
            </span>
          </span>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No open leverage positions.
        </div>
      ) : (
        <div className="space-y-2">
          {positions.map((p) => (
            <LeverageRow
              key={p.id}
              p={p}
              onNavigate={onNavigate}
              onClose={() => closeMutation.mutate(p.id)}
              closing={closeMutation.isPending && closeMutation.variables === p.id}
            />
          ))}
        </div>
      )}

      {trades.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold">Leverage History</h2>
          <div className="overflow-auto border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Token</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2 text-right">Lev</th>
                  <th className="px-3 py-2 text-right">Margin</th>
                  <th className="px-3 py-2 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <LeverageHistoryRow key={t.id} t={t} onNavigate={onNavigate} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function LeverageRow({
  p,
  onNavigate,
  onClose,
  closing,
}: {
  p: LeveragePosition;
  onNavigate: (mint: string) => void;
  onClose: () => void;
  closing: boolean;
}) {
  const pnl = p.unrealizedPnlSol;
  const roi = p.roiOnMargin;
  return (
    <div className="border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate(p.token_mint)}
          className="flex items-center gap-2 text-left"
          data-testid={`button-leverage-token-${p.id}`}
        >
          {p.token_logo && (
            <img
              src={p.token_logo}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          )}
          <div>
            <div className="text-sm font-medium">
              {p.token_symbol ?? "Token"}{" "}
              <span className="ml-1 text-[11px] font-semibold uppercase text-accent">
                {p.leverage}x Long
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Entry {fmtMarketCap(p.entry_market_cap)} · Liq{" "}
              <span className="text-red-400">{fmtMarketCap(p.liq_market_cap)}</span>
            </div>
          </div>
        </button>
        <div className="text-right">
          <div className={cn("font-mono text-sm", pnlColor(pnl ?? 0))}>
            {pnl != null ? `${fmtSol(pnl)} SOL` : "—"}
          </div>
          <div className={cn("text-[11px]", pnlColor(roi ?? 0))}>
            {roi != null ? fmtPercent(roi * 100) : "—"}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex gap-4 text-[11px] text-muted-foreground">
          <span>
            Margin{" "}
            <span className="font-mono text-foreground">{fmtSol(p.margin_sol)}</span>
          </span>
          <span>
            Size{" "}
            <span className="font-mono text-foreground">
              {fmtSol(p.notional_sol)}
            </span>
          </span>
          <span>
            Now{" "}
            <span className="font-mono text-foreground">
              {fmtMarketCap(p.currentMarketCapUsd)}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={closing}
          data-testid={`button-leverage-close-${p.id}`}
          className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-red-400/40 text-red-400 hover:bg-red-500/15 transition-colors rounded-md disabled:opacity-40"
        >
          {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Close
        </button>
      </div>
    </div>
  );
}

function LeverageHistoryRow({
  t,
  onNavigate,
}: {
  t: LeverageTrade;
  onNavigate: (mint: string) => void;
}) {
  const isOpen = t.action === "open";
  const actionLabel =
    t.action === "open"
      ? "Open"
      : t.action === "liquidated"
        ? "Liquidated"
        : "Close";
  const actionColor =
    t.action === "liquidated"
      ? "text-red-400"
      : t.action === "open"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {timeAgo(t.executed_at)}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => onNavigate(t.token_mint)}
          className="text-xs font-medium hover:text-accent transition-colors"
        >
          {t.token_symbol ?? "Token"}
        </button>
      </td>
      <td className={cn("px-3 py-2 text-xs font-medium", actionColor)}>
        {actionLabel}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">{t.leverage}x</td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {fmtSol(t.margin_sol)}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right font-mono text-xs",
          isOpen ? "text-muted-foreground" : pnlColor(t.pnl_sol ?? 0),
        )}
      >
        {isOpen || t.pnl_sol == null ? "—" : `${fmtSol(t.pnl_sol)} SOL`}
      </td>
    </tr>
  );
}

function announceFill(
  f: LeverageFill,
  toast: ReturnType<typeof useToast>["toast"],
) {
  const label = FILL_LABELS[f.reason] ?? "Closed";
  const sym = f.tokenSymbol ?? "position";
  toast({
    title: `${label}: ${sym}`,
    description:
      f.realizedPnlSol != null
        ? `P&L ${fmtSol(f.realizedPnlSol)} SOL`
        : undefined,
    variant: f.reason === "liquidated" ? "destructive" : undefined,
  });
}
