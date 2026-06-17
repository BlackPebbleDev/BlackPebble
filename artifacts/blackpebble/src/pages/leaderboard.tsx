import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2, Megaphone, Users } from "lucide-react";
import { useAccount } from "@/hooks/use-account";
import {
  api,
  type LeaderboardPeriod,
  type LeaderboardEntry,
  type CallerEntry,
  type MostFollowedEntry,
} from "@/lib/api";
import { UserIdentity, type IdentitySize } from "@/components/user-identity";
import { fmtPercent, fmtMultiple, shortAddr } from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
import { trackLeaderboardView } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Shared leaderboard card shell — every category (Top Traders / Top Callers /
 * Most Followed) uses the exact same base shade, radius, padding and shadow so
 * the tabs look identical. Only the rank accent differs.
 */
const LB_CARD = "rounded-xl bg-card shadow-card p-3.5 transition-colors";
const LB_CARD_CLICK =
  "cursor-pointer hover:bg-surface-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent";

/** Subtle rank accent ring: #1 gold, #2 silver, #3 bronze, #4+ none. */
function rankAccent(rank: number): string {
  if (rank === 1) return "ring-1 ring-amber-400/30";
  if (rank === 2) return "ring-1 ring-zinc-300/25";
  if (rank === 3) return "ring-1 ring-orange-400/25";
  return "";
}

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

function callerRowId(c: CallerEntry): string {
  const handle = c.x_username?.trim().replace(/^@+/, "") || "";
  return handle || String(c.user_id);
}

function TopCallers({
  goToProfile,
  onRowKeyDown,
}: {
  goToProfile: (pid: string) => void;
  onRowKeyDown: (e: React.KeyboardEvent, pid: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", "callers"],
    queryFn: () => api.leaderboardCallers(),
    refetchInterval: 60_000,
  });

  const entries = data?.entries ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        data-testid="leaderboard-callers-empty"
        className="rounded-2xl border border-dashed border-border bg-card/40 text-center py-16 px-6"
      >
        <Megaphone className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
        <p className="text-foreground font-medium mb-1">No callers ranked yet</p>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Make a call from any token page to put your name on the record. Callers
          are ranked here by accuracy and realized multiples.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-6">
        Ranked by a weighted caller score blending hit rate, average and best
        multiple, and call volume. A call “hits” at 2× or more.
      </p>

      {/* Mobile: card list — matches Top Trader card style */}
      <div className="space-y-2 md:hidden" data-testid="list-callers-mobile">
        {entries.map((c) => {
          const pid = callerRowId(c);
          return (
            <div
              key={c.user_id}
              role="button"
              tabIndex={0}
              onClick={() => goToProfile(pid)}
              onKeyDown={(e) => onRowKeyDown(e, pid)}
              data-testid={`caller-row-${c.rank}`}
              className={cn(LB_CARD, LB_CARD_CLICK, rankAccent(c.rank))}
            >
              {/* Header row: rank + identity + score */}
              <div className="flex items-center gap-3 mb-3">
                <RankBadge rank={c.rank} />
                <UserIdentity
                  className="flex-1"
                  avatarUrl={c.x_avatar_url}
                  displayName={c.x_display_name}
                  handle={c.x_username}
                  officialBadges={c.officialBadges}
                  tier={c.graduation_tier}
                  fallbackName={`User ${c.user_id}`}
                />
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-sm text-accent">
                    {c.callerScore.toFixed(1)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Score
                  </div>
                </div>
              </div>
              {/* Stats grid — same LbField pattern as Top Trader */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <LbField
                  label="Calls"
                  value={String(c.callsMade)}
                />
                <LbField
                  label="Hit Rate"
                  value={fmtPercent(c.hitRate * 100, 0)}
                  cls={c.hitRate >= 0.6 ? "text-emerald-400" : undefined}
                />
                <LbField
                  label="Avg Multiple"
                  value={c.avgMultiple == null ? "—" : fmtMultiple(c.avgMultiple)}
                />
                <LbField
                  label="Best"
                  value={c.bestMultiple == null ? "—" : fmtMultiple(c.bestMultiple)}
                  cls="text-emerald-400"
                />
                <LbField
                  label="Graded"
                  value={String(c.gradedCalls)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: full table */}
      <div className="hidden md:block rounded-2xl bg-card shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left border-b border-border">
            <tr>
              <th className="font-medium px-4 py-3 w-12">#</th>
              <th className="font-medium px-4 py-3">Caller</th>
              <th className="font-medium px-4 py-3 text-right">Calls</th>
              <th className="font-medium px-4 py-3 text-right">Avg Multiple</th>
              <th className="font-medium px-4 py-3 text-right">Best Call</th>
              <th className="font-medium px-4 py-3 text-right hidden lg:table-cell">
                Hit Rate
              </th>
              <th className="font-medium px-4 py-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((c) => {
              const pid = callerRowId(c);
              return (
                <tr
                  key={c.user_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => goToProfile(pid)}
                  onKeyDown={(e) => onRowKeyDown(e, pid)}
                  data-testid={`caller-row-${c.rank}`}
                  className="border-b border-border/60 last:border-0 hover:bg-surface-3 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    {c.rank}
                  </td>
                  <td className="px-4 py-3">
                    <UserIdentity
                      size="sm"
                      avatarUrl={c.x_avatar_url}
                      displayName={c.x_display_name}
                      handle={c.x_username}
                      officialBadges={c.officialBadges}
                      tier={c.graduation_tier}
                      fallbackName={`User ${c.user_id}`}
                      subline={
                        c.bestCall ? (
                          <div className="truncate text-[11px] text-muted-foreground">
                            Best:{" "}
                            {c.bestCall.token_symbol ||
                              shortAddr(c.bestCall.token_mint, 4)}{" "}
                            {fmtMultiple(c.bestCall.multiple)}
                          </div>
                        ) : undefined
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {c.callsMade}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {c.avgMultiple == null ? "—" : fmtMultiple(c.avgMultiple)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400">
                    {c.bestMultiple == null ? "—" : fmtMultiple(c.bestMultiple)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono hidden lg:table-cell">
                    {fmtPercent(c.hitRate * 100, 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-accent">
                    {c.callerScore.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MostFollowed({
  goToProfile,
  onRowKeyDown,
}: {
  goToProfile: (pid: string) => void;
  onRowKeyDown: (e: React.KeyboardEvent, pid: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", "most-followed"],
    queryFn: () => api.leaderboardMostFollowed(),
    refetchInterval: 60_000,
  });

  const entries = data?.entries ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        data-testid="leaderboard-most-followed-empty"
        className="rounded-2xl border border-dashed border-border bg-card/40 text-center py-16 px-6"
      >
        <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
        <p className="text-foreground font-medium mb-1">No followed traders yet</p>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Follow traders to start building the social graph. The most-followed
          traders will be ranked here.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-6">
        Ranked by BlackPebble follower count — traders others find worth following.
      </p>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden" data-testid="list-most-followed-mobile">
        {entries.map((e: MostFollowedEntry) => {
          const pid = e.x_username.trim().replace(/^@+/, "");
          return (
            <div
              key={e.user_id}
              role="button"
              tabIndex={0}
              onClick={() => goToProfile(pid)}
              onKeyDown={(ev) => onRowKeyDown(ev, pid)}
              data-testid={`followed-row-${e.rank}`}
              className={cn(LB_CARD, LB_CARD_CLICK, rankAccent(e.rank))}
            >
              <div className="flex items-center gap-3">
                <RankBadge rank={e.rank} />
                <UserIdentity
                  className="flex-1"
                  avatarUrl={e.x_avatar_url}
                  displayName={e.x_display_name}
                  handle={e.x_username}
                  officialBadges={e.officialBadges}
                  tier={e.graduation_tier}
                />
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-sm text-foreground">
                    {e.follower_count}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Followers
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-2xl bg-card shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left border-b border-border">
            <tr>
              <th className="font-medium px-4 py-3 w-12">#</th>
              <th className="font-medium px-4 py-3">Trader</th>
              <th className="font-medium px-4 py-3 text-right">Followers</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e: MostFollowedEntry) => {
              const pid = e.x_username.trim().replace(/^@+/, "");
              return (
                <tr
                  key={e.user_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => goToProfile(pid)}
                  onKeyDown={(ev) => onRowKeyDown(ev, pid)}
                  data-testid={`followed-row-${e.rank}`}
                  className="border-b border-border/60 last:border-0 hover:bg-surface-3 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <RankBadge rank={e.rank} />
                  </td>
                  <td className="px-4 py-3">
                    <UserIdentity
                      size="sm"
                      avatarUrl={e.x_avatar_url}
                      displayName={e.x_display_name}
                      handle={e.x_username}
                      officialBadges={e.officialBadges}
                      tier={e.graduation_tier}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {e.follower_count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
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

function Trader({
  entry,
  size = "sm",
}: {
  entry: LeaderboardEntry;
  size?: IdentitySize;
}) {
  const handle = entry.x_username?.trim().replace(/^@+/, "") || null;
  // Synthetic internal keys ("x:<id>") must never surface in the public UI.
  const isSynthetic = entry.wallet.startsWith("x:");
  const fallback = isSynthetic ? "Anonymous trader" : shortAddr(entry.wallet, 4);

  return (
    <UserIdentity
      size={size}
      avatarUrl={entry.x_avatar_url}
      displayName={entry.x_display_name}
      handle={handle}
      officialBadges={entry.officialBadges}
      tier={entry.graduation_tier}
      fallbackName={fallback}
    />
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

      {/* Category nav — wrapping pills (Markets-style), no horizontal scroll. */}
      <div
        role="tablist"
        aria-label="Leaderboard category"
        className="flex flex-wrap gap-2 mb-5"
      >
        {categoryTabs.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            onClick={() => setCategory(c.id)}
            data-testid={`category-${c.id}`}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-full border transition-colors whitespace-nowrap",
              category === c.id
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-muted-foreground hover:text-foreground hover:border-accent/40",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {category === "top_callers" ? (
        <TopCallers goToProfile={goToProfile} onRowKeyDown={onRowKeyDown} />
      ) : category === "most_followed" ? (
        <MostFollowed goToProfile={goToProfile} onRowKeyDown={onRowKeyDown} />
      ) : category !== "top_traders" ? (
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

          <div className="flex flex-wrap gap-2 mb-5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPeriod(t.id)}
                data-testid={`tab-${t.id}`}
                className={cn(
                  "px-3.5 py-1.5 text-sm font-medium rounded-full border transition-colors",
                  period === t.id
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-accent/40",
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
                    LB_CARD,
                    pid && LB_CARD_CLICK,
                    isMe
                      ? "ring-1 ring-accent/50 bg-accent/10"
                      : rankAccent(e.rank),
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <RankBadge rank={e.rank} />
                    <div className="min-w-0 flex-1">
                      <Trader entry={e} size="md" />
                    </div>
                    {isMe && (
                      <span className="text-[10px] uppercase tracking-wider text-accent shrink-0">
                        You
                      </span>
                    )}
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
