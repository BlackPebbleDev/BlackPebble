import { useMemo } from "react";
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
import { Wallet, Loader2 } from "lucide-react";
import { useAccount } from "@/hooks/use-account";
import { api, type PortfolioStats } from "@/lib/api";
import { OpenPositions } from "@/components/open-positions";
import { fmtSol, fmtUsd, fmtPercent, pnlColor } from "@/lib/format";
import { cn } from "@/lib/utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  TimeScale,
);

/** Display-only tier label: the backend "none" tier reads as "Unranked". */
function fmtTier(tier: string | null | undefined): string {
  if (!tier || tier.toLowerCase() === "none") return "Unranked";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className={cn("text-lg font-mono", className)}>{value}</div>
    </div>
  );
}

/**
 * Best Trade is tri-state so it never shows a misleading 0.00:
 *  - a winning closed trade exists  → show the SOL amount (green)
 *  - closed trades exist but none won → "No winning trades yet"
 *  - no closed trades at all          → "No closed trades yet"
 */
function BestTradeStat({ stats }: { stats?: PortfolioStats }) {
  if (stats?.bestTrade != null) {
    return (
      <Stat
        label="Best Trade"
        value={`+${fmtSol(stats.bestTrade)} SOL`}
        className="text-emerald-400"
      />
    );
  }
  const hasClosed = (stats?.closedTrades ?? 0) > 0;
  return (
    <div className="border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        Best Trade
      </div>
      <div className="text-sm text-muted-foreground">
        {hasClosed ? "No winning trades yet" : "No closed trades yet"}
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { wallet } = useAccount();
  const [, navigate] = useLocation();

  const { data: stats, isLoading: statsLoading } = useQuery({
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

  if (!wallet) {
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

  const positions = portfolio?.positions ?? [];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold">Portfolio</h1>
      </div>

      {statsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              label="Equity"
              value={`${fmtSol(stats?.equitySol)} SOL`}
            />
            <Stat label="Cash Balance" value={`${fmtSol(stats?.balance)} SOL`} />
            <Stat
              label="Total P&L"
              value={`${fmtSol(stats?.totalPnlSol)} SOL`}
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
            <BestTradeStat stats={stats} />
            <Stat label="Tier" value={fmtTier(stats?.graduationTier)} />
          </div>

          <div className="border border-border bg-card p-4 mb-6">
            <div className="text-sm text-muted-foreground mb-3">
              Equity Performance
            </div>
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

          <h2 className="text-lg font-semibold mb-3">
            Open Positions ({positions.length})
          </h2>
          <OpenPositions
            positions={positions}
            solUsd={portfolio?.solUsd ?? 0}
            empty="No open positions. Head to the Trading Desk to start."
            onNavigate={(mint) => navigate(`/?token=${mint}`)}
          />
        </>
      )}
    </div>
  );
}

