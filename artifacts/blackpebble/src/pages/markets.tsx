import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { Loader2, TrendingUp, Sparkles, RefreshCw } from "lucide-react";
import { LiveIndicator } from "@/components/live-indicator";
import { Watchlist } from "@/components/watchlist";
import { FilterPills } from "@/components/filter-pills";
import { Sparkline } from "@/components/sparkline";
import { useSparklines } from "@/hooks/use-sparklines";
import { api, type TokenInfo, type MigratedToken } from "@/lib/api";
import {
  fmtMarketCap,
  fmtVolume,
  fmtPrice,
  fmtPercentSafe,
  pnlColorSafe,
  shortAddr,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "trending" | "gainers" | "volume" | "migrated" | "watchlist";

const tabs: { id: Tab; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "gainers", label: "Top Gainers" },
  { id: "volume", label: "Highest Volume" },
  { id: "migrated", label: "Just Migrated" },
  { id: "watchlist", label: "Watchlist" },
];

/** How many rows to reveal per "Load More" click. */
const PAGE_SIZE = 30;

function TokenLogo({ token }: { token: { logo?: string | null; symbol?: string | null } }) {
  return token.logo ? (
    <img
      src={token.logo}
      alt=""
      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
      onError={(e) => (e.currentTarget.style.visibility = "hidden")}
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0 font-mono">
      {(token.symbol ?? "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function LoadMore({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center pt-4">
      <button
        type="button"
        onClick={onClick}
        data-testid="button-load-more"
        className="px-5 py-2 text-sm border border-border text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
      >
        Load More
      </button>
    </div>
  );
}

function MarketTable({ tokens, navigate }: { tokens: TokenInfo[]; navigate: (p: string) => void }) {
  // One batched sparkline request for every visible row (server caches per mint).
  const spark = useSparklines(tokens.map((t) => t.mint));

  if (tokens.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground text-sm">
        No tokens available right now. Try again shortly.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card layout (no horizontal scroll under 768px) */}
      <div className="md:hidden flex flex-col gap-2">
        {tokens.map((t: TokenInfo, idx: number) => (
          <button
            key={t.mint}
            type="button"
            onClick={() => navigate(`/?token=${t.mint}`)}
            data-testid={`card-token-${t.mint}`}
            className="w-full rounded-xl bg-card shadow-card p-3.5 flex items-center gap-3 text-left transition-colors hover:bg-surface-3 active:bg-accent/5"
          >
            <span className="text-xs text-muted-foreground tabular-nums w-5 text-center flex-shrink-0">
              {idx + 1}
            </span>
            <TokenLogo token={t} />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground truncate">
                {t.symbol ?? "Unknown"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {t.name ?? shortAddr(t.mint)}
              </div>
              {t.priceUsd != null && (
                <div className="text-xs text-muted-foreground/70 font-mono truncate">
                  {fmtPrice(t.priceUsd)}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
              <div className="font-mono text-sm text-foreground">
                {fmtMarketCap(t.marketCapUsd)}
                <span className="text-[10px] text-muted-foreground ml-1">MC</span>
              </div>
              <Sparkline
                series={spark[t.mint]}
                seed={t.mint}
                width={60}
                height={18}
              />
              <div className={cn("font-mono text-xs", pnlColorSafe(t.priceChange24h))}>
                {fmtPercentSafe(t.priceChange24h)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden md:block rounded-2xl bg-card shadow-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="font-medium px-4 py-3 w-8 text-center">#</th>
            <th className="font-medium px-4 py-3">Token</th>
            <th className="font-medium px-4 py-3 text-right">Market Cap</th>
            <th className="font-medium px-4 py-3 text-center w-20">Last 24h</th>
            <th className="font-medium px-4 py-3 text-right">24h</th>
            <th className="font-medium px-4 py-3 text-right hidden sm:table-cell">
              Volume 24h
            </th>
            <th className="font-medium px-4 py-3 text-right hidden md:table-cell">
              Liquidity
            </th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t: TokenInfo, idx: number) => (
            <tr
              key={t.mint}
              onClick={() => navigate(`/?token=${t.mint}`)}
              data-testid={`row-token-${t.mint}`}
              className="border-b border-border/50 last:border-0 hover:bg-accent/5 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 text-center text-xs text-muted-foreground tabular-nums">
                {idx + 1}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <TokenLogo token={t} />
                  <div className="min-w-0">
                    <div className="text-foreground font-medium truncate">
                      {t.symbol ?? "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                      <span>{t.name ?? shortAddr(t.mint)}</span>
                      {t.priceUsd != null && (
                        <span className="font-mono text-muted-foreground/70">
                          {fmtPrice(t.priceUsd)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {fmtMarketCap(t.marketCapUsd)}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-center">
                  <Sparkline
                    series={spark[t.mint]}
                    seed={t.mint}
                    width={72}
                    height={24}
                  />
                </div>
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right font-mono",
                  pnlColorSafe(t.priceChange24h),
                )}
              >
                {fmtPercentSafe(t.priceChange24h)}
              </td>
              <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">
                {fmtVolume(t.volume24hUsd)}
              </td>
              <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                {fmtMarketCap(t.liquidityUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

/** Just Migrated: tokens that recently graduated from the bonding curve. */
function MigratedTable({
  tokens,
  navigate,
}: {
  tokens: MigratedToken[];
  navigate: (p: string) => void;
}) {
  if (tokens.length === 0) {
    return (
      <div className="rounded-2xl bg-card shadow-card">
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Sparkles className="w-8 h-8 opacity-30" />
          <p className="text-sm">No recent migrations yet.</p>
          <p className="text-xs opacity-60 text-center max-w-xs">
            Tokens appear here as they graduate from the bonding curve and become
            actively tradable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card layout */}
      <div className="md:hidden flex flex-col gap-2">
        {tokens.map((t) => (
          <button
            key={t.mint}
            type="button"
            onClick={() => navigate(`/?token=${t.mint}`)}
            data-testid={`card-migrated-${t.mint}`}
            className="w-full rounded-xl bg-card shadow-card p-3.5 flex items-center gap-3 text-left transition-colors hover:bg-surface-3 active:bg-accent/5"
          >
            <TokenLogo token={t} />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground truncate">
                {t.symbol ?? "Unknown"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {t.name ?? shortAddr(t.mint)}
              </div>
              <div className="text-[11px] text-accent">
                {timeAgo(t.migratedAt)}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-mono text-sm text-foreground">
                {fmtMarketCap(t.marketCapUsd)}
                <span className="text-[10px] text-muted-foreground ml-1">MC</span>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                Vol {fmtVolume(t.volume24hUsd)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden md:block rounded-2xl bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="font-medium px-4 py-3">Token</th>
              <th className="font-medium px-4 py-3 text-right">Market Cap</th>
              <th className="font-medium px-4 py-3 text-right hidden md:table-cell">
                Liquidity
              </th>
              <th className="font-medium px-4 py-3 text-right hidden sm:table-cell">
                Volume 24h
              </th>
              <th className="font-medium px-4 py-3 text-right">Migrated</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr
                key={t.mint}
                onClick={() => navigate(`/?token=${t.mint}`)}
                data-testid={`row-migrated-${t.mint}`}
                className="border-b border-border/50 last:border-0 hover:bg-accent/5 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <TokenLogo token={t} />
                    <div className="min-w-0">
                      <div className="text-foreground font-medium truncate">
                        {t.symbol ?? "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                        <span>{t.name ?? shortAddr(t.mint)}</span>
                        {t.priceUsd != null && (
                          <span className="font-mono text-muted-foreground/70">
                            {fmtPrice(t.priceUsd)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {fmtMarketCap(t.marketCapUsd)}
                </td>
                <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                  {fmtMarketCap(t.liquidityUsd)}
                </td>
                <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">
                  {fmtVolume(t.volume24hUsd)}
                </td>
                <td className="px-4 py-3 text-right text-xs text-accent whitespace-nowrap">
                  {timeAgo(t.migratedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MigratedTab({ navigate }: { navigate: (p: string) => void }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const { data, isLoading } = useQuery({
    queryKey: ["markets", "migrated"],
    queryFn: () => api.migrated(),
    placeholderData: keepPreviousData,
  });

  const tokens: MigratedToken[] = data?.tokens ?? [];
  const connected = data?.connected ?? false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40",
          )}
        />
        {connected
          ? "Live - recently graduated tokens, newest first"
          : "Connecting to live feed…"}
      </div>
      <MigratedTable tokens={tokens.slice(0, visible)} navigate={navigate} />
      {tokens.length > visible && (
        <LoadMore onClick={() => setVisible((v) => v + PAGE_SIZE)} />
      )}
    </div>
  );
}

export default function Markets() {
  const [tab, setTab] = useState<Tab>("trending");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Reset the reveal count whenever the list feed changes so a new tab starts
  // at the first page rather than inheriting the previous tab's expansion.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [tab]);

  const isListFeed = tab === "trending" || tab === "gainers" || tab === "volume";

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["markets", tab],
    queryFn: () =>
      tab === "trending"
        ? api.trending()
        : tab === "gainers"
          ? api.gainers()
          : tab === "volume"
            ? api.volume()
            : null,
    enabled: isListFeed,
    // No background polling - feeds refresh only on page open / tab switch or
    // when the user clicks Refresh (the server cache turns over every 30s).
    // Keep the previous tab's rows on screen while the next feed loads so
    // switching tabs / background refreshes never blank the list or jump scroll.
    placeholderData: keepPreviousData,
  });

  const feed = data as
    | { tokens: TokenInfo[]; lastUpdated?: number | null }
    | null;
  const tokens: TokenInfo[] = feed?.tokens ?? [];
  const lastUpdated = feed?.lastUpdated ?? null;

  // Manual refresh: force the server to bypass its feed caches, then refetch
  // every Markets query so the active tab (and the others) pull fresh data.
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await api.refreshMarkets();
      await queryClient.invalidateQueries({ queryKey: ["markets"] });
    } catch {
      // Surface nothing intrusive - the existing list stays on screen and the
      // user can retry. (Network errors already log to the console.)
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-2">
        <TrendingUp className="w-7 h-7 text-accent" />
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Markets</h1>
        {isListFeed && dataUpdatedAt > 0 && (
          <LiveIndicator dataUpdatedAt={dataUpdatedAt} />
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          data-testid="button-refresh-markets"
          title="Refresh market data"
          className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")}
          />
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-1">
        Discover opportunities - tap any token to open it on the Trading desk.
      </p>
      <p
        className="text-xs text-muted-foreground/70 mb-6"
        data-testid="text-last-updated"
      >
        {lastUpdated
          ? `Last updated ${timeAgo(lastUpdated)}`
          : "Awaiting first update…"}
      </p>

      <FilterPills
        options={tabs}
        value={tab}
        onChange={(id) => setTab(id)}
        ariaLabel="Market category"
        testIdPrefix="tab-market"
        className="mb-5"
      />

      {tab === "migrated" ? (
        <MigratedTab navigate={navigate} />
      ) : tab === "watchlist" ? (
        <Watchlist onNavigate={(mint) => navigate(`/?token=${mint}`)} />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <MarketTable tokens={tokens.slice(0, visible)} navigate={navigate} />
          {tokens.length > visible && (
            <LoadMore onClick={() => setVisible((v) => v + PAGE_SIZE)} />
          )}
        </>
      )}
    </div>
  );
}
