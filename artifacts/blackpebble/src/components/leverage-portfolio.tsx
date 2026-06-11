import { useEffect, useRef, useState } from "react";
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

/** Current market value of a leverage position: notional + unrealized P&L. */
function currentValueSol(p: LeveragePosition): number | null {
  return p.unrealizedPnlSol != null ? p.notional_sol + p.unrealizedPnlSol : null;
}

/**
 * Distance from the current market cap down to the liquidation market cap, as a
 * percentage of the current market cap. Smaller = closer to liquidation.
 *   distance% = ((currentMC − liqMC) / currentMC) × 100
 */
function distanceToLiqPercent(p: LeveragePosition): number | null {
  const cur = p.currentMarketCapUsd;
  const liq = p.liq_market_cap;
  if (cur == null || liq == null || cur <= 0) return null;
  return ((cur - liq) / cur) * 100;
}

function fmtDistance(d: number | null): string {
  if (d == null || !Number.isFinite(d)) return "—";
  return `${d.toFixed(1)}%`;
}

/**
 * Shared leverage data hook: polls positions (so the server can evaluate
 * liquidation / TP / SL), surfaces any auto-closes as toasts, exposes history,
 * and a close mutation. Exactly one mounted consumer should announce fills, so
 * pass `announce: false` for read-only consumers (e.g. summaries).
 */
function useLeverageData(wallet: string, announce = true) {
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

  useEffect(() => {
    if (!announce) return;
    const fills = posData?.fills ?? [];
    const fresh = fills.filter((f) => !seenFills.current.has(f.positionId));
    if (fresh.length === 0) return;
    for (const f of fresh) {
      seenFills.current.add(f.positionId);
      announceFill(f, toast);
    }
    qc.invalidateQueries({ queryKey: ["account"] });
    qc.invalidateQueries({ queryKey: ["leverage-history", wallet] });
  }, [posData?.fills, qc, toast, wallet, announce]);

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

  return {
    positions: posData?.positions ?? [],
    trades: histData?.trades ?? [],
    closeMutation,
  };
}

/**
 * Portfolio-page leverage section: every open position (live unrealized P&L +
 * liquidation) plus full leverage trade history. Signed-in only.
 */
export function LeveragePortfolioSection({
  wallet,
  onNavigate,
}: {
  wallet: string;
  onNavigate: (mint: string) => void;
}) {
  const { positions, trades, closeMutation } = useLeverageData(wallet);

  const openMargin = positions.reduce((s, p) => s + p.margin_sol, 0);
  const unrealized = positions.reduce((s, p) => s + (p.unrealizedPnlSol ?? 0), 0);
  const realized = trades
    .filter((t) => t.action === "close" || t.action === "liquidated")
    .reduce((s, t) => s + (t.pnl_sol ?? 0), 0);

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
        <div className="rounded-xl bg-card shadow-card px-4 py-8 text-center text-sm text-muted-foreground">
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
          <LeverageHistoryTable trades={trades} onNavigate={onNavigate} />
        </>
      )}
    </section>
  );
}

/**
 * Token-page leverage box: a separate, tabbed Positions / History panel scoped
 * to a single token. Mirrors the spot Positions / History box but stays fully
 * isolated from spot. Signed-in only (leverage requires a wallet).
 */
export function TokenLeverageActivity({
  wallet,
  mint,
  onNavigate,
}: {
  wallet: string;
  mint: string;
  onNavigate: (mint: string) => void;
}) {
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const { positions, trades, closeMutation } = useLeverageData(wallet);

  const tokenPositions = positions.filter((p) => p.token_mint === mint);
  const tokenTrades = trades.filter((t) => t.token_mint === mint);

  const tabs = [
    { id: "positions" as const, label: "Leverage Positions" },
    { id: "history" as const, label: "Leverage History" },
  ];

  return (
    <div className="mt-8 rounded-2xl bg-card shadow-card overflow-hidden" data-testid="leverage-activity">
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-leverage-${t.id}`}
            className={cn(
              "px-4 py-3 text-sm transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "positions" && (
        <div className="p-3">
          {tokenPositions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No open leverage positions for this token.
            </div>
          ) : (
            <div className="space-y-2">
              {tokenPositions.map((p) => (
                <LeverageRow
                  key={p.id}
                  p={p}
                  onNavigate={onNavigate}
                  onClose={() => closeMutation.mutate(p.id)}
                  closing={
                    closeMutation.isPending && closeMutation.variables === p.id
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="p-3">
          {tokenTrades.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No leverage history for this token.
            </div>
          ) : (
            <LeverageHistoryTable trades={tokenTrades} onNavigate={onNavigate} />
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-foreground", valueClass)}>{value}</div>
    </div>
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
  const curVal = currentValueSol(p);
  const dist = distanceToLiqPercent(p);
  return (
    <div className="rounded-xl bg-card shadow-card p-3.5">
      <div className="flex items-start justify-between gap-3">
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
            <div className="flex items-center gap-1.5 text-sm font-medium">
              {p.token_symbol ?? "Token"}
              <span className="text-[11px] font-semibold uppercase text-accent">
                {p.leverage}x Long
              </span>
            </div>
            {p.token_name && (
              <div className="text-[11px] text-muted-foreground">
                {p.token_name}
              </div>
            )}
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

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-[11px]">
        <StatCell label="Margin" value={`${fmtSol(p.margin_sol)} SOL`} />
        <StatCell label="Position Size" value={`${fmtSol(p.notional_sol)} SOL`} />
        <StatCell
          label="Current Value"
          value={curVal != null ? `${fmtSol(curVal)} SOL` : "—"}
        />
        <StatCell label="Entry MC" value={fmtMarketCap(p.entry_market_cap)} />
        <StatCell label="Current MC" value={fmtMarketCap(p.currentMarketCapUsd)} />
        <StatCell
          label="Liq MC"
          value={fmtMarketCap(p.liq_market_cap)}
          valueClass="text-red-400"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">
          Distance to Liq:{" "}
          <span
            className={cn(
              "font-mono",
              dist != null && dist < 10 ? "text-red-400" : "text-foreground",
            )}
          >
            {fmtDistance(dist)}
          </span>
        </span>
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

function LeverageHistoryTable({
  trades,
  onNavigate,
}: {
  trades: LeverageTrade[];
  onNavigate: (mint: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Token</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2 text-right">Lev</th>
            <th className="px-3 py-2 text-right">Margin</th>
            <th className="px-3 py-2 text-right">Size</th>
            <th className="px-3 py-2 text-right">MC</th>
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
      ? "Opened Long"
      : t.action === "liquidated"
        ? "Liquidated"
        : "Closed Long";
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
      <td className="px-3 py-2 text-right font-mono text-xs">
        {fmtSol(t.notional_sol)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {fmtMarketCap(t.market_cap)}
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
