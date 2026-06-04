import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, Zap } from "lucide-react";
import { LiveIndicator } from "@/components/live-indicator";
import { api, type TokenInfo, type NewToken } from "@/lib/api";
import {
  fmtMarketCap,
  fmtVolume,
  fmtPrice,
  fmtPercent,
  pnlColor,
  shortAddr,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "trending" | "gainers" | "volume" | "new";

const tabs: { id: Tab; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "gainers", label: "Top Gainers" },
  { id: "volume", label: "Volume" },
  { id: "new", label: "New Launches" },
];

function TokenLogo({ token }: { token: Pick<TokenInfo, "logo" | "symbol"> }) {
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

function MarketTable({ tokens, navigate }: { tokens: TokenInfo[]; navigate: (p: string) => void }) {
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
            className="w-full border border-border bg-card p-3 flex items-center gap-3 text-left active:bg-accent/5 transition-colors"
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
            <div className="text-right flex-shrink-0">
              <div className="font-mono text-sm text-foreground">
                {fmtMarketCap(t.marketCapUsd)}
                <span className="text-[10px] text-muted-foreground ml-1">MC</span>
              </div>
              <div className={cn("font-mono text-xs", pnlColor(t.priceChange24h))}>
                {fmtPercent(t.priceChange24h)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden md:block border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="font-medium px-4 py-3 w-8 text-center">#</th>
            <th className="font-medium px-4 py-3">Token</th>
            <th className="font-medium px-4 py-3 text-right">Market Cap</th>
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
              <td
                className={cn(
                  "px-4 py-3 text-right font-mono",
                  pnlColor(t.priceChange24h),
                )}
              >
                {fmtPercent(t.priceChange24h)}
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

function NewTokenRow({ t, navigate }: { t: NewToken; navigate: (p: string) => void }) {
  return (
    <tr
      key={t.mint}
      onClick={() => navigate(`/?token=${t.mint}`)}
      data-testid={`row-new-${t.mint}`}
      className="border-b border-border/50 last:border-0 hover:bg-accent/5 cursor-pointer transition-colors"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0 font-mono">
            {(t.symbol ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-foreground font-medium truncate">
              {t.symbol ?? shortAddr(t.mint)}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {t.name ?? shortAddr(t.mint)}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right font-mono text-muted-foreground text-xs">
        {shortAddr(t.mint)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
        {t.marketCapSol != null ? `${t.marketCapSol.toFixed(0)} SOL` : "—"}
      </td>
      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
        {timeAgo(t.timestamp)}
      </td>
    </tr>
  );
}

function NewLaunchesTab({ navigate }: { navigate: (p: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["markets", "new"],
    queryFn: () => api.newTokens(),
    refetchInterval: 5_000,
  });

  const tokens: NewToken[] = data?.tokens ?? [];
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
        {connected ? "Live — new tokens appear as they launch" : "Connecting to live feed…"}
      </div>

      {tokens.length === 0 ? (
        <div className="border border-border bg-card">
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Zap className="w-8 h-8 opacity-30" />
            <p className="text-sm">Waiting for new token launches…</p>
            <p className="text-xs opacity-60">Tokens appear here in real time as they are created on Pump.fun</p>
          </div>
        </div>
      ) : (
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="font-medium px-4 py-3">Token</th>
                <th className="font-medium px-4 py-3 text-right hidden sm:table-cell">Address</th>
                <th className="font-medium px-4 py-3 text-right">Market Cap</th>
                <th className="font-medium px-4 py-3 text-right">Launched</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <NewTokenRow key={t.mint} t={t} navigate={navigate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Markets() {
  const [tab, setTab] = useState<Tab>("trending");
  const [, navigate] = useLocation();

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
    enabled: tab !== "new",
    refetchInterval: 30_000,
  });

  const tokens: TokenInfo[] = (data as { tokens: TokenInfo[] } | null)?.tokens ?? [];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold">Markets</h1>
        {tab !== "new" && dataUpdatedAt > 0 && (
          <LiveIndicator dataUpdatedAt={dataUpdatedAt} />
        )}
      </div>

      <div className="flex gap-1 mb-4 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-market-${t.id}`}
            className={cn(
              "px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "new" ? (
        <NewLaunchesTab navigate={navigate} />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <MarketTable tokens={tokens} navigate={navigate} />
      )}
    </div>
  );
}
