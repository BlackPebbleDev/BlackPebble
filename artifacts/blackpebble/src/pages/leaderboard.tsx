import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2, ExternalLink } from "lucide-react";
import { useAccount } from "@/hooks/use-account";
import { api, type LeaderboardPeriod, type LeaderboardEntry } from "@/lib/api";
import { fmtPercent, shortAddr, xProfileUrl } from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
import { trackLeaderboardView } from "@/lib/analytics";
import { TierBadge } from "@/components/tier-badge";
import { cn } from "@/lib/utils";

const tabs: { id: LeaderboardPeriod; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "all", label: "All Time" },
];

// Leaderboard categories. Only "top_traders" has real ranking logic today; the
// rest are forward-looking placeholders until their engines exist.
type LbCategory =
  | "top_traders"
  | "top_callers"
  | "most_followed"
  | "highest_trust";

const categoryTabs: { id: LbCategory; label: string }[] = [
  { id: "top_traders", label: "Top Traders" },
  { id: "top_callers", label: "Top Callers" },
  { id: "most_followed", label: "Most Followed" },
  { id: "highest_trust", label: "Highest Trust Score" },
];

const comingSoonCopy: Record<
  Exclude<LbCategory, "top_traders">,
  { title: string; body: string }
> = {
  top_callers: {
    title: "Top Callers coming soon",
    body: "Once on-the-record callouts launch, traders will be ranked here by call accuracy and realized multiples.",
  },
  most_followed: {
    title: "Most Followed coming soon",
    body: "A ranking of the community's most-followed traders will appear here as the social graph grows.",
  },
  highest_trust: {
    title: "Highest Trust Score coming soon",
    body: "Traders will be ranked by a reputation score blending call accuracy, trading performance, and X reputation.",
  },
};

function LeaderboardComingSoon({
  category,
}: {
  category: Exclude<LbCategory, "top_traders">;
}) {
  const copy = comingSoonCopy[category];
  return (
    <div
      data-testid={`leaderboard-coming-soon-${category}`}
      className="rounded-2xl border border-dashed border-border bg-card/40 text-center py-16 px-6"
    >
      <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
      <p className="text-foreground font-medium mb-1">{copy.title}</p>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">
        {copy.body}
      </p>
    </div>
  );
}

function pnlClass(v: number): string {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-muted-foreground";
}

// Only X-authenticated traders have public profiles, so the profile route is
// keyed on the X handle. Wallet-only rows aren't linkable (no social profile).
function profileId(entry: LeaderboardEntry): string | null {
  const handle = entry.x_username?.trim().replace(/^@+/, "");
  return handle || null;
}

function Trader({ entry }: { entry: LeaderboardEntry }) {
  const handle = entry.x_username?.trim().replace(/^@+/, "") || null;
  const displayName = entry.x_display_name?.trim() || null;
  // Synthetic internal keys ("x:<id>") must never surface in the public UI.
  const isSynthetic = entry.wallet.startsWith("x:");
  const fallback = isSynthetic ? "Anonymous trader" : shortAddr(entry.wallet, 4);
  const profileUrl = xProfileUrl(handle);
  const initialSource =
    displayName || handle || (isSynthetic ? "" : entry.wallet);
  const initial =
    initialSource.replace(/^@+/, "").slice(0, 2).toUpperCase() || "?";

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
          {initial}
        </div>
      )}
      <div className="min-w-0">
        {profileUrl ? (
          <>
            {displayName && (
              <div className="text-foreground font-medium truncate">
                {displayName}
              </div>
            )}
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-x-${handle}`}
              className={cn(
                "flex items-center gap-1 truncate hover:text-accent transition-colors",
                displayName
                  ? "text-[11px] text-muted-foreground"
                  : "text-foreground font-medium",
              )}
            >
              <span className="truncate">@{handle}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
            </a>
          </>
        ) : (
          <div className="text-foreground font-medium truncate">{fallback}</div>
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
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<LbCategory>("top_traders");
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");

  useEffect(() => {
    trackLeaderboardView();
  }, []);

  function goToProfile(pid: string) {
    navigate(`/u/${encodeURIComponent(pid)}`);
  }
  function onRowKeyDown(e: React.KeyboardEvent, pid: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToProfile(pid);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => api.leaderboard(period),
    refetchInterval: 30_000,
  });

  const entries = data?.entries ?? [];
  const minTrades = data?.minTrades ?? 5;
  const solUsd = data?.solUsd ?? 0;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-1">
        <Trophy className="w-7 h-7 text-accent" />
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Leaderboard</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        How the BlackPebble community stacks up across trading and reputation.
      </p>

      {/* Category tabs (only Top Traders is ranked today) */}
      <div className="flex items-center gap-1 mb-5 border-b border-border overflow-x-auto">
        {categoryTabs.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            data-testid={`category-${c.id}`}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              category === c.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {category !== "top_traders" ? (
        <LeaderboardComingSoon category={category} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-6">
            Ranked by realized P&L from closed trades only. A minimum of{" "}
            {minTrades} closed trades is required to appear.
          </p>

          {isGuest && (
            <div
              data-testid="banner-leaderboard-guest"
              className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 mb-6 text-sm text-foreground"
            >
              Connect X to claim your rank, build a public track record, and
              follow other traders. Trades made before you connect stay on this
              device and aren't ranked.
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
        <div className="rounded-2xl bg-card shadow-card text-center py-16 px-6">
          <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-1">No ranked traders yet</p>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Close at least {minTrades} trades on the Trading Desk to qualify for
            this leaderboard.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards (no horizontal scroll, all metrics shown) */}
          <div className="md:hidden space-y-2">
            {entries.map((e) => {
              const isMe = wallet && e.wallet === wallet;
              const pid = profileId(e);
              return (
                <div
                  key={e.wallet}
                  data-testid={`card-rank-${e.rank}`}
                  onClick={pid ? () => goToProfile(pid) : undefined}
                  onKeyDown={pid ? (ev) => onRowKeyDown(ev, pid) : undefined}
                  role={pid ? "link" : undefined}
                  tabIndex={pid ? 0 : undefined}
                  className={cn(
                    "rounded-xl bg-card shadow-card p-3.5 transition-colors",
                    isMe && "ring-1 ring-accent/50 bg-accent/10",
                    pid &&
                      "cursor-pointer hover:bg-surface-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <RankBadge rank={e.rank} />
                    <div className="min-w-0 flex-1">
                      <Trader entry={e} />
                    </div>
                    {isMe && (
                      <span className="text-[10px] uppercase tracking-wider text-accent shrink-0">
                        You
                      </span>
                    )}
                    <TierBadge tier={e.graduation_tier} size="sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <LbField
                      label="P&L"
                      value={
                        <PnlAmount
                          sol={e.realized_pnl}
                          solUsd={solUsd}
                          unit={false}
                        />
                      }
                      cls={pnlClass(e.realized_pnl)}
                    />
                    <LbField
                      label="ROI"
                      value={fmtPercent(e.roi)}
                      cls={pnlClass(e.roi)}
                    />
                    <LbField
                      label="Win Rate"
                      value={`${e.win_rate.toFixed(1)}%`}
                    />
                    <LbField
                      label="Trades"
                      value={String(e.total_closed_trades)}
                    />
                    <LbField
                      label="Best Trade"
                      value={
                        <PnlAmount
                          sol={e.best_trade}
                          solUsd={solUsd}
                          unit={false}
                        />
                      }
                      cls={pnlClass(e.best_trade)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: full table */}
          <div className="hidden md:block rounded-2xl bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="font-medium px-4 py-3 w-16">Rank</th>
                <th className="font-medium px-4 py-3">Trader</th>
                <th className="font-medium px-4 py-3 hidden sm:table-cell">Tier</th>
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
                const pid = profileId(e);
                return (
                  <tr
                    key={e.wallet}
                    data-testid={`row-rank-${e.rank}`}
                    onClick={pid ? () => goToProfile(pid) : undefined}
                    onKeyDown={pid ? (ev) => onRowKeyDown(ev, pid) : undefined}
                    role={pid ? "link" : undefined}
                    tabIndex={pid ? 0 : undefined}
                    className={cn(
                      "border-b border-border/50 last:border-0 transition-colors",
                      isMe ? "bg-accent/10" : "hover:bg-accent/5",
                      pid &&
                        "cursor-pointer focus:outline-none focus-visible:bg-accent/10",
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
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <TierBadge tier={e.graduation_tier} size="sm" />
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono",
                        pnlClass(e.realized_pnl),
                      )}
                    >
                      <PnlAmount
                        sol={e.realized_pnl}
                        solUsd={solUsd}
                        unit={false}
                      />
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
                      <PnlAmount
                        sol={e.best_trade}
                        solUsd={solUsd}
                        unit={false}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
          )}
        </>
      )}
    </div>
  );
}

function LbField({
  label,
  value,
  cls,
}: {
  label: string;
  value: React.ReactNode;
  cls?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-foreground", cls)}>{value}</span>
    </div>
  );
}
