import { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  Loader2,
  Sparkles,
  TrendingUp,
  Coins,
  Trophy,
  Zap,
  Activity,
  History,
  Medal,
  Dna,
  Brain,
  ChevronDown,
  PieChart,
  ArrowRight,
  Layers,
  ListChecks,
  Star,
  Target,
  Scale,
  Clock,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Ruler,
} from "lucide-react";
import { useAccount } from "@/hooks/use-account";
import { accountStatusFromGuest } from "@/lib/account-status";
import { useXAuth } from "@/hooks/use-x-auth";
import { UserIdentity } from "@/components/user-identity";
import { PageHeader } from "@/components/page-header";
import { api, type PortfolioStats, type FeatureFlags } from "@/lib/api";
import { OpenPositions } from "@/components/open-positions";
import { LeveragePortfolioSection } from "@/components/leverage-portfolio";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { AllOrders } from "@/components/position-orders";
import { Watchlist } from "@/components/watchlist";
import { TradeList } from "@/components/trade-list";
import { GuestCountdown } from "@/components/guest-countdown";
import { EmptyState } from "@/components/empty-state";
import { TierBadge } from "@/components/tier-badge";
import {
  ProfileIdentityMeta,
  ProfileSocialPills,
} from "@/components/profile-identity";
import { trackPortfolioView } from "@/lib/analytics";
import {
  fmtSol,
  fmtPercent,
  fmtDuration,
  pnlColor,
  xProfileUrl,
} from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
import { CurrencyAmount } from "@/components/currency-amount";
import { useSolUsd } from "@/hooks/use-sol-usd";
import { LIVE_MS } from "@/lib/live";
import { LiveIndicator } from "@/components/live-indicator";
import { RecoveryDiscoveryCard } from "@/components/recovery-discovery-card";
import { RealTradingAnalysisSection } from "@/components/real-trading-analysis";
import { type ChartRange } from "@/lib/chart-theme";
import { ChartRangeToggle } from "@/components/chart-range-toggle";
import {
  EquityLine,
  EquityEmptyState,
  useRangedEquity,
} from "@/components/equity-chart";
import {
  SectionHeader,
  PanelCard,
  MiniStat,
  InfoHint,
} from "@/components/profile-ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { UTILITIES, type UtilityMeta } from "@/lib/utilities-meta";
import { cn } from "@/lib/utils";
import {
  useGuestStore,
  useGuestValuedPositions,
  guestHistory,
  computeGuestStats,
} from "@/lib/guest-store";

/**
 * Best Trade tile is tri-state so it never shows a misleading 0.00:
 *  - a winning closed trade exists   → show the SOL amount (green)
 *  - closed trades exist but none won → "No wins yet"
 *  - no closed trades at all          → "No trades yet"
 */
function BestTradeTile({
  stats,
  solUsd,
}: {
  stats?: PortfolioStats;
  solUsd: number;
}) {
  if (stats?.bestTrade != null) {
    return (
      <MiniStat
        icon={Trophy}
        label="Best Trade"
        value={<PnlAmount sol={stats.bestTrade} solUsd={solUsd} unit={false} />}
        valueClass="text-success"
      />
    );
  }
  const hasClosed = (stats?.closedTrades ?? 0) > 0;
  return (
    <MiniStat
      icon={Trophy}
      label="Best Trade"
      value={
        <span className="text-sm font-normal text-muted-foreground">
          {hasClosed ? "No wins yet" : "No trades yet"}
        </span>
      }
    />
  );
}

/** The app-wide "no data yet" glyph, styled to read as absent (not zero). */
function Dash() {
  return <span className="text-sm font-normal text-muted-foreground">—</span>;
}

/** Premium quick-link into a wallet utility subpage (same tile language). */
function UtilityLinkTile({ meta }: { meta: UtilityMeta }) {
  const Icon = meta.icon;
  return (
    <Link
      href={meta.href}
      data-testid={meta.testId}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_1px_2px_rgba(0,0,0,0.35)] transition-colors hover:border-accent/50 hover:bg-surface-3"
    >
      <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-accent/5 text-accent ring-1 ring-accent/20 transition-colors group-hover:ring-accent/40">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {meta.title}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {meta.description}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
    </Link>
  );
}

export default function Portfolio() {
  const { wallet, isGuest } = useAccount();
  const flags = useFeatureFlags();
  const [, navigate] = useLocation();
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>("all");

  useEffect(() => {
    trackPortfolioView();
  }, []);

  const {
    data: serverStats,
    isLoading: serverStatsLoading,
    dataUpdatedAt: statsUpdatedAt,
  } = useQuery({
    queryKey: ["pf-stats", wallet],
    queryFn: () => api.portfolioStats(wallet!),
    enabled: !!wallet,
    refetchInterval: LIVE_MS.portfolio,
  });

  const { data: portfolio } = useQuery({
    queryKey: ["pf", wallet],
    queryFn: () => api.portfolio(wallet!),
    enabled: !!wallet,
    refetchInterval: LIVE_MS.portfolio,
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

  // Identity for the signed-in trader's summary header. The X session carries
  // avatar/name; the profile fetch adds official badges so the portfolio shows
  // the same shared identity cluster (avatar + name + badges + tier + @handle)
  // used everywhere else. Read-only; absent for guests.
  const { user: xUser } = useXAuth();
  const selfHandle = xUser?.x_username ?? null;
  const { data: selfProfile } = useQuery({
    queryKey: ["profile", selfHandle],
    queryFn: () => api.profiles.get(selfHandle!),
    enabled: !isGuest && !!selfHandle,
    staleTime: 60_000,
  });

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

  // Range-filtered equity points (shared logic with the profile chart). Falls
  // back to the full series when the selected window is too sparse to draw.
  const { points: rangedPoints, sparse: chartRangeSparse } = useRangedEquity(
    chart?.points ?? [],
    chartRange,
  );
  const hasChart = (chart?.points?.length ?? 0) > 1;

  // Today's P&L: change in equity over the last 24h, using the most recent
  // snapshot at or before the cutoff as the baseline. Null until we have enough
  // history to be meaningful (never fabricated).
  const todayPnl = useMemo(() => {
    const pts = chart?.points ?? [];
    if (pts.length < 2) return null;
    const cutoff = Date.now() - 86_400_000;
    let baseline = pts[0]!;
    for (const p of pts) {
      if (p.t <= cutoff) baseline = p;
      else break;
    }
    const last = pts[pts.length - 1]!;
    return last.equity - baseline.equity;
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
  const positionsSolUsd = derivedSolUsd > 0 ? derivedSolUsd : fallbackSolUsd;

  const rankValue = isGuest
    ? "Guest"
    : leaderboard == null
      ? "—"
      : rank != null
        ? `#${rank}`
        : "Unranked";

  // Utility quick-links (excluding the ones already surfaced above: SOL recovery
  // has its own discovery card, and Trading Analysis is the Trading Intelligence
  // section). Honors feature flags so nothing dead-ends.
  const utilityLinks = UTILITIES.filter(
    (u) =>
      u.key !== "trading_analysis" &&
      u.key !== "wallet_cleanup" &&
      (!u.flag || flags[u.flag as keyof FeatureFlags]),
  );

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-5">
      <PageHeader
        icon={Wallet}
        title="Portfolio"
        actions={
          isGuest ? (
            <span
              data-testid="badge-portfolio-guest"
              className="text-[11px] font-semibold uppercase tracking-wider text-accent border border-accent/30 bg-accent/10 px-2.5 py-1 rounded-full"
            >
              Connect X to rank
            </span>
          ) : undefined
        }
      />

      {!isGuest && selfHandle && (
        <div
          data-testid="portfolio-user-summary"
          className="hairline-accent overflow-hidden rounded-2xl bg-card shadow-card p-5 md:p-6 mb-4"
        >
          {/* Identity cluster: avatar + name/badges + compact @handle · tier ·
              #rank, mirroring the approved public profile hero. */}
          <UserIdentity
            size="lg"
            align="start"
            avatarUrl={selfProfile?.x_avatar_url ?? xUser?.x_avatar_url}
            avatarExpandable
            displayName={selfProfile?.x_display_name ?? xUser?.x_display_name}
            handle={selfHandle}
            officialBadges={selfProfile?.officialBadges}
            accountStatus={accountStatusFromGuest(isGuest)}
            tier={stats?.graduationTier ?? selfProfile?.graduationTier}
            tierPosition="none"
            badgePosition="row"
            badgeSize="sm"
            showHandle={false}
          >
            <ProfileIdentityMeta
              handle={selfHandle}
              profileUrl={xProfileUrl(selfHandle)}
              tier={stats?.graduationTier ?? selfProfile?.graduationTier}
              rank={rank}
            />
          </UserIdentity>

          {/* Full-width detail block (compact bio, links, followers) so the
              card reads balanced and never stretches on a long saved bio. */}
          {selfProfile?.bio && (
            <p
              data-testid="text-portfolio-bio"
              className="mt-3 min-w-0 max-w-full text-sm text-foreground/90 break-words [overflow-wrap:anywhere] line-clamp-2"
            >
              {selfProfile.bio}
            </p>
          )}

          {selfProfile?.socials && (
            <ProfileSocialPills socials={selfProfile.socials} />
          )}

          <div className="mt-3 flex items-center gap-4 text-sm">
            <span data-testid="text-portfolio-following-count">
              <span className="font-semibold text-foreground">
                {selfProfile?.following ?? 0}
              </span>{" "}
              <span className="text-muted-foreground">Following</span>
            </span>
            <span data-testid="text-portfolio-followers-count">
              <span className="font-semibold text-foreground">
                {selfProfile?.followers ?? 0}
              </span>{" "}
              <span className="text-muted-foreground">Followers</span>
            </span>
          </div>

          <Link
            href={`/u/${encodeURIComponent(selfHandle)}`}
            data-testid="link-view-public-profile"
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 h-9 px-4 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-secondary hover:border-accent/50 transition-colors sm:w-auto"
          >
            View Public Profile
          </Link>
        </div>
      )}

      {isGuest && (
        <div
          data-testid="banner-portfolio-guest"
          className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 mb-4"
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
          {/* ── Equity hero: the visual centerpiece. Big headline, the chart as
              the star, then the snapshot tiles. Layered gradient + inset
              highlight give calm glass depth (Robinhood, not dashboard). ── */}
          <div
            data-testid="equity-card"
            className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-accent/[0.10] via-card to-card p-5 md:p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_60px_-30px_rgba(0,0,0,0.75)] mb-5"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent/10 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
            />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <TrendingUp className="h-3 w-3 flex-shrink-0 text-accent" />
                  <span>Total Equity</span>
                  <InfoHint
                    title="Total Equity"
                    text="Cash plus the live value of all open spot and perps positions."
                  />
                </div>
                <div
                  data-testid="equity-value"
                  className="mt-2.5 font-mono text-4xl font-bold leading-none tracking-tight text-foreground md:text-5xl"
                >
                  <CurrencyAmount
                    sol={stats?.equitySol}
                    solUsd={positionsSolUsd}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <LiveIndicator dataUpdatedAt={statsUpdatedAt} />
                {hasChart && (
                  <ChartRangeToggle
                    value={chartRange}
                    onChange={setChartRange}
                    className="shrink-0"
                  />
                )}
              </div>
            </div>

            {/* Equity curve - the star of the card */}
            <div className="relative mt-6">
              {hasChart ? (
                <>
                  {chartRangeSparse && (
                    <p className="mb-2 text-[11px] text-warning/80">
                      Not enough history in this window - showing full history.
                    </p>
                  )}
                  <EquityLine points={rangedPoints} className="h-56 md:h-72" />
                </>
              ) : (
                <EquityEmptyState className="h-56 md:h-72" />
              )}
            </div>

            {/* Snapshot metrics row */}
            <div className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat
                icon={Coins}
                label="Total P&L"
                value={
                  <PnlAmount
                    sol={stats?.totalPnlSol}
                    solUsd={positionsSolUsd}
                    unit={false}
                  />
                }
                valueClass={pnlColor(stats?.totalPnlSol)}
              />
              <MiniStat
                icon={Activity}
                label="Today's P&L"
                value={
                  todayPnl == null ? (
                    <Dash />
                  ) : (
                    <PnlAmount
                      sol={todayPnl}
                      solUsd={positionsSolUsd}
                      unit={false}
                    />
                  )
                }
                valueClass={todayPnl != null ? pnlColor(todayPnl) : undefined}
                hint={{
                  title: "Today's P&L",
                  text: "Change in your total equity over the last 24 hours.",
                }}
              />
              <MiniStat
                icon={TrendingUp}
                label="ROI"
                value={fmtPercent(stats?.roiPercent)}
                valueClass={pnlColor(stats?.roiPercent)}
              />
              <MiniStat
                icon={Wallet}
                label="Cash Balance"
                value={
                  <CurrencyAmount
                    sol={stats?.balance}
                    solUsd={positionsSolUsd}
                  />
                }
              />
            </div>
          </div>

          {/* ── Trader DNA: private performance in the public-profile language.
              A balanced 12-tile grid (2 / 3 / 4 columns) of real behavioural
              metrics - the deeper set the public profile doesn't expose. ── */}
          <SectionHeader icon={Dna} title="Trader DNA" className="mt-8" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <MiniStat
              icon={Target}
              label="Win Rate"
              value={`${(stats?.winRate ?? 0).toFixed(1)}%`}
              sub={
                (stats?.closedTrades ?? 0) > 0
                  ? `${stats?.winningTrades ?? 0} of ${stats?.closedTrades} won`
                  : undefined
              }
            />
            <MiniStat
              icon={Scale}
              label="Profit Factor"
              value={
                stats?.profitFactor != null ? (
                  stats.profitFactor.toFixed(2)
                ) : (stats?.closedTrades ?? 0) > 0 &&
                  (stats?.winningTrades ?? 0) > 0 ? (
                  "∞"
                ) : (
                  <Dash />
                )
              }
              valueClass={
                stats?.profitFactor != null
                  ? stats.profitFactor >= 1
                    ? "text-success"
                    : "text-danger"
                  : undefined
              }
              hint={{
                title: "Profit Factor",
                text: "Gross profit divided by gross loss. Above 1.0 means your winners outweigh your losers.",
              }}
            />
            <BestTradeTile stats={stats} solUsd={positionsSolUsd} />
            <MiniStat
              icon={Flame}
              label="Win Streak"
              value={String(stats?.currentStreak ?? 0)}
              hint={{
                title: "Win Streak",
                text: "Consecutive winning closed trades, counting back from your latest.",
              }}
            />
            <MiniStat
              icon={ArrowUpRight}
              label="Avg Winner"
              value={
                stats?.avgWinSol != null ? (
                  <PnlAmount
                    sol={stats.avgWinSol}
                    solUsd={positionsSolUsd}
                    unit={false}
                  />
                ) : (
                  <Dash />
                )
              }
              valueClass={stats?.avgWinSol != null ? "text-success" : undefined}
            />
            <MiniStat
              icon={ArrowDownRight}
              label="Avg Loser"
              value={
                stats?.avgLossSol != null ? (
                  <PnlAmount
                    sol={stats.avgLossSol}
                    solUsd={positionsSolUsd}
                    unit={false}
                  />
                ) : (
                  <Dash />
                )
              }
              valueClass={stats?.avgLossSol != null ? "text-danger" : undefined}
            />
            <MiniStat
              icon={Clock}
              label="Avg Hold"
              value={
                stats?.avgHoldSec != null ? (
                  fmtDuration(stats.avgHoldSec)
                ) : (
                  <Dash />
                )
              }
              hint={{
                title: "Avg Hold Time",
                text: "Amount-weighted average time you hold a position from buy to sell.",
              }}
            />
            <MiniStat
              icon={Ruler}
              label="Avg Size"
              value={
                stats?.avgTradeSizeSol != null ? (
                  <CurrencyAmount
                    sol={stats.avgTradeSizeSol}
                    solUsd={positionsSolUsd}
                  />
                ) : (
                  <Dash />
                )
              }
              hint={{
                title: "Avg Position Size",
                text: "Average SOL committed per buy.",
              }}
            />
            <MiniStat
              icon={History}
              label="Closed Trades"
              value={String(stats?.closedTrades ?? 0)}
            />
            <MiniStat
              icon={Zap}
              label="Executions"
              value={String(stats?.totalExecutions ?? 0)}
            />
            <MiniStat
              icon={Medal}
              label="Rank"
              value={rankValue}
              valueClass={rank != null ? "text-accent" : "text-muted-foreground"}
            />
            <MiniStat
              icon={Star}
              label="Tier"
              value={<TierBadge tier={stats?.graduationTier} />}
            />
          </div>

          {/* ── Portfolio Allocation: one premium expandable card ─────────── */}
          {stats != null && (
            <PortfolioAllocation
              stats={stats}
              showLeverage={!isGuest && flags.leverage}
            />
          )}

          {/* ── Trading Intelligence: flagship read-only coaching ─────────── */}
          {flags.real_trading_analysis && (
            <>
              <SectionHeader
                icon={Brain}
                title="Trading Intelligence"
                className="mt-8"
                action={
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
                    <Sparkles className="h-2.5 w-2.5" />
                    AI Coach
                  </span>
                }
              />
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                Read-only intelligence from your real on-chain history - your
                trading DNA, live signals, and milestones.
              </p>
              <RealTradingAnalysisSection />
            </>
          )}

          {/* ── Wallet Utilities: grouped premium dashboard section ───────── */}
          <SectionHeader
            icon={Sparkles}
            title="Wallet Utilities"
            className="mt-8"
          />
          <div className="space-y-3">
            <RecoveryDiscoveryCard />
            {utilityLinks.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {utilityLinks.map((u) => (
                  <UtilityLinkTile key={u.key} meta={u} />
                ))}
              </div>
            )}
          </div>

          {/* ── Open Positions ────────────────────────────────────────────── */}
          <SectionHeader
            icon={Layers}
            title={`Open Positions (${positions.length})`}
            className="mt-8"
          />
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

          {/* ── Watchlist: secondary lane ("what might I trade?") - deliberately
              lighter than the performance sections above. ─────────────────── */}
          <SectionHeader
            icon={Star}
            title="Watchlist"
            tone="muted"
            className="mt-8"
          />
          <Watchlist onNavigate={(mint) => navigate(`/?token=${mint}`)} />

          {/* ── Trade History: premium receipts ───────────────────────────── */}
          <SectionHeader
            icon={ListChecks}
            title="Trade History"
            className="mt-8"
            action={
              (() => {
                const total = history?.trades?.length ?? 0;
                if (total === 0) return null;
                const label = historyExpanded
                  ? `${total} shown`
                  : `${Math.min(5, total)} of ${total}`;
                return (
                  <span className="text-xs font-medium text-muted-foreground">
                    {label}
                  </span>
                );
              })()
            }
          />
          {(history?.trades?.length ?? 0) === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No trades yet"
              body="Your buys and sells will appear here, newest first, once you start trading."
            />
          ) : (
            <div className="rounded-2xl bg-card shadow-card overflow-hidden">
              <TradeList
                trades={history?.trades ?? []}
                empty=""
                onNavigate={(mint) => navigate(`/?token=${mint}`)}
                limit={5}
                showExpand
                expanded={historyExpanded}
                onExpandChange={setHistoryExpanded}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Portfolio Allocation - the old debug-style "Equity Breakdown" reimagined as
 * one premium expandable card that reuses the Trader DNA tile language. Collapsed
 * it shows just the headline (total equity); expanded it breaks equity into cash,
 * spot, perps and P&L.
 */
function PortfolioAllocation({
  stats,
  showLeverage,
}: {
  stats: PortfolioStats;
  showLeverage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const spotValue =
    stats.equitySol - stats.balance - stats.openLeverageEquitySol;
  const realized = stats.realizedPnlSol + stats.leverageRealizedPnlSol;
  const unrealized = stats.unrealizedPnlSol + stats.leverageUnrealizedPnlSol;

  return (
    <>
      <SectionHeader icon={PieChart} title="Portfolio Breakdown" className="mt-8" />
      <PanelCard testId="pnl-breakdown" className="p-0 md:p-0">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 md:p-5">
            <div className="flex items-center gap-2 text-left">
              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
                <PieChart className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Total Equity
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Tap to see the full breakdown
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                {fmtSol(stats.equitySol)} SOL
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-3 md:px-5 md:pb-5">
              <MiniStat
                icon={Wallet}
                label="Cash"
                value={`${fmtSol(stats.balance)} SOL`}
              />
              <MiniStat
                icon={Coins}
                label="Spot Holdings"
                value={`${fmtSol(spotValue)} SOL`}
              />
              {showLeverage ? (
                <MiniStat
                  icon={Zap}
                  label="Perps Equity"
                  value={`${fmtSol(stats.openLeverageEquitySol)} SOL`}
                />
              ) : (
                <MiniStat
                  icon={Layers}
                  label="Open Positions"
                  value={String(stats.openPositions)}
                />
              )}
              <MiniStat
                icon={TrendingUp}
                label="Realized P&L"
                value={`${fmtSol(realized)} SOL`}
                valueClass={pnlColor(realized)}
              />
              <MiniStat
                icon={Activity}
                label="Unrealized P&L"
                value={`${fmtSol(unrealized)} SOL`}
                valueClass={pnlColor(unrealized)}
              />
              <MiniStat
                icon={PieChart}
                label="Total Equity"
                value={`${fmtSol(stats.equitySol)} SOL`}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </PanelCard>
    </>
  );
}
