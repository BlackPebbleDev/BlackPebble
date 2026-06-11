import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  TimeScale,
} from "chart.js";
import { Wallet, Loader2, Sparkles } from "lucide-react";
import { useAccount } from "@/hooks/use-account";
import { api, type PortfolioStats } from "@/lib/api";
import { OpenPositions } from "@/components/open-positions";
import { LeveragePortfolioSection } from "@/components/leverage-portfolio";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { AllOrders } from "@/components/position-orders";
import { Watchlist } from "@/components/watchlist";
import { TradeList } from "@/components/trade-list";
import { GuestCountdown } from "@/components/guest-countdown";
import { TierBadge } from "@/components/tier-badge";
import { trackPortfolioView } from "@/lib/analytics";
import { fmtSol, fmtPercent, pnlColor } from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
import { CurrencyAmount } from "@/components/currency-amount";
import { useSolUsd } from "@/hooks/use-sol-usd";
import { RecoveryDiscoveryCard } from "@/components/recovery-discovery-card";
import { cn } from "@/lib/utils";
import {
  useGuestStore,
  useGuestValuedPositions,
  guestHistory,
  computeGuestStats,
} from "@/lib/guest-store";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  TimeScale,
);

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="rounded-xl bg-card shadow-card px-4 py-3.5 transition-colors hover:bg-surface-3">
      <div className="stat-label mb-1.5">{label}</div>
      <div className={cn("stat-value text-xl md:text-2xl", className)}>
        {value}
      </div>
    </div>
  );
}

/**
 * Best Trade is tri-state so it never shows a misleading 0.00:
 *  - a winning closed trade exists  → show the SOL amount (green)
 *  - closed trades exist but none won → "No winning trades yet"
 *  - no closed trades at all          → "No closed trades yet"
 */
function BestTradeStat({
  stats,
  solUsd,
}: {
  stats?: PortfolioStats;
  solUsd: number;
}) {
  if (stats?.bestTrade != null) {
    return (
      <Stat
        label="Best Trade"
        value={<PnlAmount sol={stats.bestTrade} solUsd={solUsd} />}
        className="text-emerald-400"
      />
    );
  }
  const hasClosed = (stats?.closedTrades ?? 0) > 0;
  return (
    <div className="rounded-xl bg-card shadow-card px-4 py-3.5">
      <div className="stat-label mb-1.5">Best Trade</div>
      <div className="text-sm text-muted-foreground">
        {hasClosed ? "No winning trades yet" : "No closed trades yet"}
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { wallet, isGuest } = useAccount();
  const flags = useFeatureFlags();
  const [, navigate] = useLocation();
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    trackPortfolioView();
  }, []);

  const { data: serverStats, isLoading: serverStatsLoading } = useQuery({
    queryKey: ["pf-stats", wallet],
    queryFn: () => api.portfolioStats(wallet!),
    enabled: !!wallet,
    refetchInterval: 20_000,
  });

  const { data: portfolio } = useQuery({
    queryKey: ["pf", wallet],
    queryFn: () => api.portfolio(wallet!),
    enabled: !!wallet,
    refetchInterval: 20_000,
  });

  const { data: chart } = useQuery({
    queryKey: ["pf-chart", wallet],
    queryFn: () => api.portfolioChart(wallet!),
    enabled: !!wallet,
    refetchInterval: 60_000,
  });

  const { data: serverHistory } = useQuery({
    queryKey: ["history", wallet],
    queryFn: () => api.history(wallet!),
    enabled: !!wallet,
    refetchInterval: 30_000,
  });

  // Rank is derived from the all-time leaderboard (it isn't part of the stats
  // payload). Guests are never ranked; signed-in traders below the qualifying
  // threshold show "Unranked" rather than a misleading number.
  const { data: leaderboard } = useQuery({
    queryKey: ["leaderboard", "all"],
    queryFn: () => api.leaderboard("all"),
    enabled: !!wallet && !isGuest,
    refetchInterval: 60_000,
  });
  const rank = useMemo(() => {
    if (!wallet || isGuest) return null;
    return leaderboard?.entries.find((e) => e.wallet === wallet)?.rank ?? null;
  }, [leaderboard, wallet, isGuest]);

  const fallbackSolUsd = useSolUsd();
  const guestState = useGuestStore();
  const guestValued = useGuestValuedPositions();
  const guestStats = useMemo(
    () => computeGuestStats(guestState, guestValued.positions, guestValued.solUsd),
    [guestState, guestValued.positions, guestValued.solUsd],
  );

  const stats = isGuest ? guestStats : serverStats;
  const statsLoading = isGuest ? false : serverStatsLoading;
  const history = isGuest ? { trades: guestHistory(guestState) } : serverHistory;

  const chartData = useMemo(() => {
    const points = chart?.points ?? [];
    return {
      labels: points.map((p) =>
        new Date(p.t).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      ),
      datasets: [
        {
          label: "Equity (SOL)",
          data: points.map((p) => p.equity),
          borderColor: "#c9a96e",
          backgroundColor: "rgba(201,169,110,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    };
  }, [chart]);

  if (!wallet && !isGuest) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="text-center max-w-sm">
          <Wallet className="w-12 h-12 text-accent mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Connect your wallet</h1>
          <p className="text-muted-foreground text-sm">
            Connect a Solana wallet to start paper trading and view your
            portfolio performance.
          </p>
        </div>
      </div>
    );
  }

  const positions = isGuest ? guestValued.positions : portfolio?.positions ?? [];
  const derivedSolUsd = isGuest ? guestValued.solUsd : portfolio?.solUsd ?? 0;
  // A position-derived rate only exists once the trader holds something. Fall
  // back to the shared SOL/USD rate so USD (the default currency) still renders
  // on an empty/guest portfolio.
  const positionsSolUsd =
    derivedSolUsd > 0 ? derivedSolUsd : fallbackSolUsd;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="w-7 h-7 text-accent" />
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Portfolio</h1>
        {isGuest && (
          <span
            data-testid="badge-portfolio-guest"
            className="text-[11px] font-semibold uppercase tracking-wider text-accent border border-accent/30 bg-accent/10 px-3 py-1.5 rounded-full"
          >
            Connect X to rank
          </span>
        )}
      </div>

      {isGuest && (
        <div
          data-testid="banner-portfolio-guest"
          className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 mb-6"
        >
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
          <p className="text-xs leading-relaxed text-foreground/90">
            Connect X to build your reputation, climb the leaderboards, and keep
            your trade history. Trades you make now stay on this device until you
            connect.
          </p>
        </div>
      )}

      {isGuest && <GuestCountdown />}

      {statsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Stat
              label="Equity"
              value={
                <CurrencyAmount sol={stats?.equitySol} solUsd={positionsSolUsd} />
              }
            />
            <Stat
              label="Cash Balance"
              value={
                <CurrencyAmount sol={stats?.balance} solUsd={positionsSolUsd} />
              }
            />
            <Stat
              label="Total P&L"
              value={
                <PnlAmount sol={stats?.totalPnlSol} solUsd={positionsSolUsd} />
              }
              className={pnlColor(stats?.totalPnlSol)}
            />
            <Stat
              label="ROI"
              value={fmtPercent(stats?.roiPercent)}
              className={pnlColor(stats?.roiPercent)}
            />
            <Stat
              label="Executions"
              value={String(stats?.totalExecutions ?? 0)}
            />
            <Stat
              label="Closed Trades"
              value={String(stats?.closedTrades ?? 0)}
            />
            <Stat
              label="Win Rate"
              value={`${(stats?.winRate ?? 0).toFixed(1)}%`}
            />
            <BestTradeStat stats={stats} solUsd={positionsSolUsd} />
            <Stat
              label="Rank"
              value={
                isGuest
                  ? "Guest"
                  : leaderboard == null
                    ? "—"
                    : rank != null
                      ? `#${rank}`
                      : "Unranked"
              }
              className={rank != null ? "text-accent" : "text-muted-foreground"}
            />
            <div className="rounded-xl bg-card shadow-card px-4 py-3.5">
              <div className="stat-label mb-2">Tier</div>
              <TierBadge tier={stats?.graduationTier} />
            </div>
          </div>

          {/* P&L breakdown — only shown for signed-in users with any leverage activity */}
          {!isGuest && flags.leverage && serverStats != null &&
            (serverStats.leverageOpenCount > 0 ||
              serverStats.leverageRealizedPnlSol !== 0 ||
              serverStats.openLeverageEquitySol > 0) && (
              <div className="rounded-xl bg-card shadow-card p-5 mb-3 text-xs" data-testid="pnl-breakdown">
                <div className="stat-label mb-3">Equity Breakdown</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                  <div>
                    <div className="text-muted-foreground">Cash</div>
                    <div className="font-mono">{fmtSol(serverStats.balance)} SOL</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Open Spot Value</div>
                    <div className="font-mono">
                      {fmtSol(serverStats.equitySol - serverStats.balance - serverStats.openLeverageEquitySol)} SOL
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Open Leverage Equity</div>
                    <div className="font-mono">{fmtSol(serverStats.openLeverageEquitySol)} SOL</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground font-semibold">Total Equity</div>
                    <div className="font-mono font-semibold">{fmtSol(serverStats.equitySol)} SOL</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Spot P&L</div>
                    <div className={cn("font-mono", pnlColor(serverStats.realizedPnlSol + serverStats.unrealizedPnlSol))}>
                      {fmtSol(serverStats.realizedPnlSol + serverStats.unrealizedPnlSol)} SOL
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Leverage Realized P&L</div>
                    <div className={cn("font-mono", pnlColor(serverStats.leverageRealizedPnlSol))}>
                      {fmtSol(serverStats.leverageRealizedPnlSol)} SOL
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Leverage Unrealized P&L</div>
                    <div className={cn("font-mono", pnlColor(serverStats.leverageUnrealizedPnlSol))}>
                      {fmtSol(serverStats.leverageUnrealizedPnlSol)} SOL
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground font-semibold">Total P&L</div>
                    <div className={cn("font-mono font-semibold", pnlColor(serverStats.totalPnlSol))}>
                      {fmtSol(serverStats.totalPnlSol)} SOL
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* Wallet utility — strictly isolated from paper-trading metrics above. */}
          <div className="mb-6">
            <RecoveryDiscoveryCard />
          </div>

          {!isGuest && (
            <div className="rounded-xl bg-card shadow-card p-5 mb-6">
              <div className="stat-label mb-4">Equity Performance</div>
              <div className="h-64">
                <Line
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: {
                        grid: { color: "rgba(255,255,255,0.04)" },
                        ticks: { color: "#a0a0a0", maxTicksLimit: 8 },
                      },
                      y: {
                        grid: { color: "rgba(255,255,255,0.04)" },
                        ticks: { color: "#a0a0a0" },
                      },
                    },
                  }}
                />
              </div>
            </div>
          )}

          <h2 className="text-lg font-semibold mb-3">
            Open Positions ({positions.length})
          </h2>
          <OpenPositions
            positions={positions}
            solUsd={positionsSolUsd}
            empty="No open positions. Head to the Trading Desk to start."
            onNavigate={(mint) => navigate(`/?token=${mint}`)}
          />

          {flags.leverage && !isGuest && wallet && (
            <LeveragePortfolioSection
              wallet={wallet}
              onNavigate={(mint) => navigate(`/?token=${mint}`)}
            />
          )}

          <AllOrders onNavigate={(mint) => navigate(`/?token=${mint}`)} />

          <h2 className="text-lg font-semibold mb-3 mt-8">Watchlist</h2>
          <Watchlist onNavigate={(mint) => navigate(`/?token=${mint}`)} />

          <h2 className="text-lg font-semibold mb-3 mt-8">
            Trade History{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {(() => {
                const total = history?.trades?.length ?? 0;
                if (total === 0) return null;
                if (historyExpanded) return `${total} trades shown`;
                const shown = Math.min(5, total);
                return `${shown} of ${total} shown`;
              })()}
            </span>
          </h2>
          <div className="rounded-xl bg-card shadow-card overflow-hidden">
            <TradeList
              trades={history?.trades ?? []}
              empty="No trades yet. Your buys and sells will appear here."
              onNavigate={(mint) => navigate(`/?token=${mint}`)}
              limit={5}
              showExpand
              expanded={historyExpanded}
              onExpandChange={setHistoryExpanded}
            />
          </div>
        </>
      )}
    </div>
  );
}

