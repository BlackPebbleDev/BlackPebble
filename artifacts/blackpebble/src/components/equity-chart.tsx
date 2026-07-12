import { useMemo } from "react";
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
} from "chart.js";
import { TrendingDown, TrendingUp } from "lucide-react";
import { api, type ChartPoint } from "@/lib/api";
import { fmtSol, fmtPercent, pnlColor } from "@/lib/format";
import {
  bpScales,
  bpTooltip,
  accentLineDataset,
  crosshairPlugin,
  filterByRange,
  type ChartRange,
} from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
);

/**
 * Shared equity line chart used by both the private Portfolio (large, with a
 * range toggle + snapshot header) and the Public Profile (a small, glanceable
 * "is this trader trending up?" sparkline). One component keeps the equity
 * curve visually identical across both views so they read as one product.
 *
 * Points carry millisecond timestamps (as returned by the API); the shared
 * range filter works in seconds, so we convert internally.
 */

/**
 * Filter points to the selected range, falling back to the full series when the
 * window is too sparse to draw a meaningful line.
 */
export function useRangedEquity(points: ChartPoint[], range: ChartRange) {
  return useMemo(() => {
    const asSeconds = points.map((p) => ({ ...p, t: Math.floor(p.t / 1000) }));
    const filtered = filterByRange(asSeconds, range);
    if (filtered.length > 1) {
      return { points: filtered, sparse: false };
    }
    return { points: asSeconds, sparse: range !== "all" };
  }, [points, range]);
}

/** Change in equity across a series of points (last − first). */
export function equityDelta(points: ChartPoint[]): {
  abs: number;
  pct: number | null;
} | null {
  if (points.length < 2) return null;
  const first = points[0]!.equity;
  const last = points[points.length - 1]!.equity;
  const abs = last - first;
  const pct = first !== 0 ? (abs / Math.abs(first)) * 100 : null;
  return { abs, pct };
}

/**
 * The equity line itself (no card chrome). `mini` strips axes + tooltip for a
 * compact sparkline; otherwise it renders the full axed chart with a crosshair.
 */
export function EquityLine({
  points,
  mini = false,
  className,
}: {
  points: Array<{ t: number; equity: number }>;
  mini?: boolean;
  className?: string;
}) {
  const data = useMemo(
    () => ({
      labels: points.map((p) =>
        new Date(p.t < 1e12 ? p.t * 1000 : p.t).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      ),
      datasets: [
        {
          ...accentLineDataset,
          label: "Equity",
          data: points.map((p) => p.equity),
          pointHoverRadius: mini ? 0 : 4,
        },
      ],
    }),
    [points, mini],
  );

  return (
    <div className={className}>
      <Line
        data={data}
        plugins={mini ? [] : [crosshairPlugin]}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: mini
              ? { enabled: false }
              : {
                  ...bpTooltip,
                  callbacks: {
                    title: (items) => {
                      const idx = items[0]?.dataIndex;
                      const p = idx != null ? points[idx] : null;
                      if (!p) return "";
                      return new Date(
                        p.t < 1e12 ? p.t * 1000 : p.t,
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                    },
                    label: (item) => `Equity: ${fmtSol(item.parsed.y ?? 0)} SOL`,
                  },
                },
          },
          scales: mini
            ? { x: { display: false }, y: { display: false } }
            : bpScales,
          elements: mini ? { line: { borderWidth: 2 } } : undefined,
        }}
      />
    </div>
  );
}

/**
 * Premium empty state for the equity chart: a faint grid, a soft dashed accent
 * baseline and a calm one-liner - so a fresh account shows an intentional, ready
 * canvas instead of a blank box. The real line simply starts drawing on the
 * first trade.
 */
export function EquityEmptyState({ className }: { className?: string }) {
  const rows = [20, 40, 60, 80];
  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {rows.map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="0.4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1="0"
          y1="68"
          x2="100"
          y2="68"
          stroke="rgba(201,169,110,0.30)"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
        <p className="text-xs text-muted-foreground">
          Your equity curve starts drawing on your first trade.
        </p>
      </div>
    </div>
  );
}

/**
 * Compact equity sparkline card for the Public Profile overview. Fetches the
 * trader's equity history by profile id/handle (reusing their paper-account
 * snapshots) and renders a small trend so profiles feel alive. Renders nothing
 * until there are at least two points, so it never shows an empty/flat box.
 */
export function ProfileEquityChart({
  profileId,
  className,
}: {
  profileId: string | number;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["profile-chart", String(profileId)],
    queryFn: () => api.profiles.chart(profileId),
    staleTime: 60_000,
  });

  const points = data?.points ?? [];
  const delta = equityDelta(points);

  if (points.length < 2) return null;

  const up = (delta?.abs ?? 0) >= 0;

  return (
    <div
      data-testid="profile-equity-chart"
      className={cn(
        "rounded-2xl bg-card shadow-card p-4 md:p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/15">
            {up ? (
              <TrendingUp className="h-3 w-3 text-accent" />
            ) : (
              <TrendingDown className="h-3 w-3 text-accent" />
            )}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Equity Trend
          </span>
        </div>
        {delta?.pct != null && (
          <span
            data-testid="profile-equity-delta"
            className={cn(
              "font-mono text-xs font-semibold tabular-nums",
              pnlColor(delta.abs),
            )}
          >
            {fmtPercent(delta.pct)}
          </span>
        )}
      </div>
      <EquityLine points={points} mini className="mt-3 h-20" />
    </div>
  );
}
