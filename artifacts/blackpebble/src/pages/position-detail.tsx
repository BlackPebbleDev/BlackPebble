import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Wallet } from "lucide-react";
import { useAccount } from "@/hooks/use-account";
import { api, type Position, type Trade } from "@/lib/api";
import { LIVE_MS } from "@/lib/live";
import { LiveIndicator } from "@/components/live-indicator";
import { TradeList } from "@/components/trade-list";
import { PnlAmount } from "@/components/pnl-amount";
import {
  fmtSol,
  fmtUsd,
  fmtPrice,
  fmtPercent,
  fmtTokenAmount,
  fmtMarketCap,
  fmtMultiple,
  fmtHoldTime,
  pnlColor,
  shortAddr,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useGuestStore,
  useGuestValuedPositions,
  guestHistory,
} from "@/lib/guest-store";

/** A single labelled metric tile. `accent` marks the signature MC metrics. */
function Metric({
  label,
  value,
  sub,
  valueClass,
  accent,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  valueClass?: string;
  accent?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-xl border bg-card px-3 py-2.5",
        accent ? "border-accent/40" : "border-border",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className={cn("font-mono text-base leading-tight", valueClass)}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  );
}

function McChange({ pct }: { pct: number | null }) {
  if (pct == null || !Number.isFinite(pct)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "•";
  return (
    <span className={cn("font-mono", pnlColor(pct))}>
      {arrow} {fmtPercent(pct)}
    </span>
  );
}

export default function PositionDetail() {
  const [, params] = useRoute<{ mint: string }>("/position/:mint");
  const [, navigate] = useLocation();
  const mint = params?.mint ?? "";
  const { wallet, isGuest } = useAccount();

  const {
    data: portfolio,
    isLoading: pfLoading,
    dataUpdatedAt: pfUpdatedAt,
  } = useQuery({
    queryKey: ["pf", wallet],
    queryFn: () => api.portfolio(wallet!),
    enabled: !!wallet,
    refetchInterval: LIVE_MS.positionDetail,
  });

  const { data: serverHistory } = useQuery({
    queryKey: ["history", wallet],
    queryFn: () => api.history(wallet!),
    enabled: !!wallet,
    refetchInterval: 30_000,
  });

  const guestState = useGuestStore();
  const guestValued = useGuestValuedPositions();

  const positions: Position[] = isGuest
    ? guestValued.positions
    : portfolio?.positions ?? [];
  const solUsd = isGuest ? guestValued.solUsd : portfolio?.solUsd ?? 0;
  const allTrades: Trade[] = isGuest
    ? guestHistory(guestState)
    : serverHistory?.trades ?? [];
  const loading = isGuest ? guestValued.isLoading : pfLoading;

  const position = useMemo(
    () => positions.find((p) => p.token_mint === mint) ?? null,
    [positions, mint],
  );

  const trades = useMemo(
    () => allTrades.filter((t) => t.token_mint === mint),
    [allTrades, mint],
  );

  // Avg slippage across this token's executions (audit columns, when present).
  const avgSlippage = useMemo(() => {
    const vals = trades
      .map((t) => t.slippage_percent)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [trades]);

  if (!wallet && !isGuest) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="text-center max-w-sm">
          <Wallet className="w-12 h-12 text-accent mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Connect your wallet</h1>
          <p className="text-muted-foreground text-sm">
            Connect a Solana wallet to view your position analytics.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !position) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!position) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-10">
        <button
          type="button"
          onClick={() => navigate("/portfolio")}
          data-testid="button-back-portfolio"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portfolio
        </button>
        <div className="rounded-2xl bg-card shadow-card text-center py-16 px-6">
          <p className="text-foreground font-medium mb-1">Position not found</p>
          <p className="text-muted-foreground text-sm">
            This token isn't in your open positions. It may have been fully
            closed - check your trade history on the Portfolio page.
          </p>
        </div>
      </div>
    );
  }

  const p = position;
  const sym = p.token_symbol ?? shortAddr(p.token_mint);
  const mcMultiple =
    p.entry_market_cap != null &&
    p.entry_market_cap > 0 &&
    p.currentMarketCapUsd != null
      ? p.currentMarketCapUsd / p.entry_market_cap
      : null;
  const avgEntryUsd = p.avg_entry_price * solUsd;
  const currentUsd =
    p.currentPriceSol != null ? p.currentPriceSol * solUsd : null;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-5">
      <button
        type="button"
        onClick={() => navigate("/portfolio")}
        data-testid="button-back-portfolio"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Portfolio
      </button>

      {/* Token header */}
      <div className="flex items-center gap-3 mb-1">
        {p.token_logo ? (
          <img
            src={p.token_logo}
            alt=""
            className="w-10 h-10 rounded-full object-cover border border-border/60"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-mono text-sm text-muted-foreground">
            {sym.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate" data-testid="text-position-symbol">
            {sym}
          </h1>
          {p.token_name && (
            <div className="text-sm text-muted-foreground truncate">
              {p.token_name}
            </div>
          )}
        </div>
        {isGuest && (
          <span className="ml-auto text-[11px] font-medium uppercase tracking-wider text-warning border border-warning/30 bg-warning/10 rounded-full px-2 py-1">
            Guest
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="text-[11px] font-mono text-muted-foreground">
          {shortAddr(p.token_mint, 6)}
        </div>
        <LiveIndicator dataUpdatedAt={pfUpdatedAt} />
      </div>

      {/* ── Market Cap Analytics - the signature view ──────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Market Cap Analytics
          </h2>
          <McChange pct={p.marketCapChangePercent} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Metric
            label="Avg Entry MC"
            value={fmtMarketCap(p.entry_market_cap)}
            sub={`Avg price ${fmtPrice(avgEntryUsd)}`}
            accent
            testId="metric-avg-entry-mc"
          />
          <Metric
            label="Current MC"
            value={fmtMarketCap(p.currentMarketCapUsd)}
            sub={`Price ${currentUsd != null ? fmtPrice(currentUsd) : "—"}`}
            accent
            testId="metric-current-mc"
          />
          <Metric
            label="MC Multiple"
            value={fmtMultiple(mcMultiple)}
            valueClass={pnlColor(
              mcMultiple != null ? mcMultiple - 1 : null,
            )}
            accent
            testId="metric-mc-multiple"
          />
          <Metric
            label="MC Gain"
            value={fmtPercent(p.marketCapChangePercent)}
            valueClass={pnlColor(p.marketCapChangePercent)}
            testId="metric-mc-gain"
          />
          <Metric
            label="Position Peak MC"
            value="—"
            sub="Not tracked yet"
            testId="metric-peak-mc"
          />
          <Metric
            label="From Position Peak"
            value="—"
            sub="Not tracked yet"
            testId="metric-drawdown"
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/80 leading-relaxed">
          Position Peak MC (the highest market cap reached while this position
          was open) and From Position Peak require continuous market-cap history
          per holding, which isn't tracked yet. Token all-time-high market cap is
          a separate metric and also isn't tracked yet. Every other metric is
          live.
        </p>
      </section>

      {/* ── Position Analytics ─────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Position Analytics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric
            label="Position Value"
            value={`${fmtSol(p.currentValueSol)} SOL`}
            sub={fmtUsd(p.currentValueSol * solUsd)}
            testId="metric-position-value"
          />
          <Metric
            label="Cost Basis"
            value={`${fmtSol(p.total_sol_spent)} SOL`}
            sub={fmtUsd(p.total_sol_spent * solUsd)}
            testId="metric-cost-basis"
          />
          <Metric
            label="P&L (Market)"
            value={<PnlAmount sol={p.unrealizedPnlMarketSol} solUsd={solUsd} />}
            valueClass={pnlColor(p.unrealizedPnlMarketSol)}
            sub="Price move only"
            testId="metric-pnl-market"
          />
          <Metric
            label="Trading Costs"
            value={<PnlAmount sol={p.tradingCostsSol} solUsd={solUsd} />}
            valueClass={pnlColor(p.tradingCostsSol)}
            sub="Entry slippage"
            testId="metric-trading-costs"
          />
          <Metric
            label="Net Result"
            value={<PnlAmount sol={p.netResultSol} solUsd={solUsd} />}
            valueClass={pnlColor(p.netResultSol)}
            sub="True P&L"
            testId="metric-net-result"
          />
          <Metric
            label="ROI"
            value={fmtPercent(p.unrealizedPnlPercent)}
            valueClass={pnlColor(p.unrealizedPnlPercent)}
            testId="metric-roi"
          />
          <Metric
            label="Quantity"
            value={fmtTokenAmount(p.total_tokens)}
            sub={sym}
            testId="metric-quantity"
          />
          <Metric
            label="Hold Time"
            value={fmtHoldTime(p.opened_at)}
            testId="metric-hold-time"
          />
          <Metric
            label="Executions"
            value={String(trades.length)}
            testId="metric-executions"
          />
          <Metric
            label="Avg Slippage"
            value={avgSlippage != null ? `${avgSlippage.toFixed(2)}%` : "—"}
            testId="metric-avg-slippage"
          />
        </div>
      </section>

      {/* ── Trade History ──────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Trade History ({trades.length})
        </h2>
        <div className="rounded-xl bg-card shadow-card overflow-hidden">
          <TradeList
            trades={trades}
            empty="No executions recorded for this token yet."
          />
        </div>
      </section>

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => navigate(`/?token=${p.token_mint}`)}
        data-testid={`button-open-${p.token_mint}`}
        className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-sm font-medium border border-accent/50 text-accent hover:bg-accent/10 transition-colors"
      >
        View Token
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
