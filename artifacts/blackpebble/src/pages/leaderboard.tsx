import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2 } from "lucide-react";
import { useAccount } from "@/hooks/use-account";
import { api, type LeaderboardPeriod, type LeaderboardEntry } from "@/lib/api";
import { fmtSol, fmtPercent, shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

const tabs: { id: LeaderboardPeriod; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "all", label: "All Time" },
];

function pnlClass(v: number): string {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-muted-foreground";
}

function Trader({ entry }: { entry: LeaderboardEntry }) {
  const name =
    entry.x_display_name ||
    (entry.x_username ? `@${entry.x_username}` : shortAddr(entry.wallet, 4));
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {entry.x_avatar_url ? (
        <img
          src={entry.x_avatar_url}
          alt=""
          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0 font-mono">
          {shortAddr(entry.wallet, 2).slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-foreground font-medium truncate">{name}</div>
        {entry.x_username && (
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {shortAddr(entry.wallet, 4)}
          </div>
        )}
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? "text-amber-300"
      : rank === 2
        ? "text-zinc-300"
        : rank === 3
          ? "text-orange-400"
          : "text-muted-foreground";
  return <span className={cn("font-mono font-semibold", medal)}>#{rank}</span>;
}

export default function Leaderboard() {
  const { wallet, isGuest } = useAccount();
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => api.leaderboard(period),
    refetchInterval: 30_000,
  });

  const entries = data?.entries ?? [];
  const minTrades = data?.minTrades ?? 5;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-1">
        <Trophy className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Ranked by realized P&L from closed trades only. A minimum of {minTrades}{" "}
        closed trades is required to appear.
      </p>

      {isGuest && (
        <div
          data-testid="banner-leaderboard-guest"
          className="border border-accent/40 bg-accent/10 px-4 py-3 mb-6 text-sm text-foreground"
        >
          Connect a wallet or X to appear on the leaderboard. Guest trades stay
          on this device and aren't ranked.
        </div>
      )}

      <div className="flex items-center gap-1 mb-5 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPeriod(t.id)}
            data-testid={`tab-${t.id}`}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              period === t.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="border border-border bg-card text-center py-16 px-6">
          <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-1">No ranked traders yet</p>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Close at least {minTrades} trades on the Trading Desk to qualify for
            this leaderboard.
          </p>
        </div>
      ) : (
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="font-medium px-4 py-3 w-16">Rank</th>
                <th className="font-medium px-4 py-3">Trader</th>
                <th className="font-medium px-4 py-3 text-right">P&L</th>
                <th className="font-medium px-4 py-3 text-right">ROI</th>
                <th className="font-medium px-4 py-3 text-right hidden sm:table-cell">
                  Win Rate
                </th>
                <th className="font-medium px-4 py-3 text-right hidden md:table-cell">
                  Trades
                </th>
                <th className="font-medium px-4 py-3 text-right hidden lg:table-cell">
                  Best Trade
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isMe = wallet && e.wallet === wallet;
                return (
                  <tr
                    key={e.wallet}
                    data-testid={`row-rank-${e.rank}`}
                    className={cn(
                      "border-b border-border/50 last:border-0 transition-colors",
                      isMe ? "bg-accent/10" : "hover:bg-accent/5",
                    )}
                  >
                    <td className="px-4 py-3">
                      <RankBadge rank={e.rank} />
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <Trader entry={e} />
                      {isMe && (
                        <span className="text-[10px] uppercase tracking-wider text-accent">
                          You
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono",
                        pnlClass(e.realized_pnl),
                      )}
                    >
                      {fmtSol(e.realized_pnl)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono",
                        pnlClass(e.roi),
                      )}
                    >
                      {fmtPercent(e.roi)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">
                      {e.win_rate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                      {e.total_closed_trades}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono hidden lg:table-cell",
                        pnlClass(e.best_trade),
                      )}
                    >
                      {fmtSol(e.best_trade)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
