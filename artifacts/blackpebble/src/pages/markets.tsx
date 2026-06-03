import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp } from "lucide-react";
import { api, type TokenInfo } from "@/lib/api";
import { fmtUsd, fmtPercent, fmtPrice, pnlColor, shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "trending" | "gainers" | "volume";

const tabs: { id: Tab; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "gainers", label: "Top Gainers" },
  { id: "volume", label: "Volume" },
];

export default function Markets() {
  const [tab, setTab] = useState<Tab>("trending");
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["markets", tab],
    queryFn: () =>
      tab === "trending"
        ? api.trending()
        : tab === "gainers"
          ? api.gainers()
          : api.volume(),
    refetchInterval: 30_000,
  });

  const tokens = data?.tokens ?? [];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold">Markets</h1>
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

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          No tokens available right now. Try again shortly.
        </div>
      ) : (
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="font-medium px-4 py-3">Token</th>
                <th className="font-medium px-4 py-3 text-right">Price</th>
                <th className="font-medium px-4 py-3 text-right">24h</th>
                <th className="font-medium px-4 py-3 text-right hidden sm:table-cell">
                  Volume 24h
                </th>
                <th className="font-medium px-4 py-3 text-right hidden md:table-cell">
                  Liquidity
                </th>
                <th className="font-medium px-4 py-3 text-right hidden lg:table-cell">
                  Market Cap
                </th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t: TokenInfo) => (
                <tr
                  key={t.mint}
                  onClick={() => navigate(`/?token=${t.mint}`)}
                  data-testid={`row-token-${t.mint}`}
                  className="border-b border-border/50 last:border-0 hover:bg-accent/5 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {t.logo ? (
                        <img
                          src={t.logo}
                          alt=""
                          className="w-8 h-8 object-cover flex-shrink-0"
                          onError={(e) =>
                            (e.currentTarget.style.visibility = "hidden")
                          }
                        />
                      ) : (
                        <div className="w-8 h-8 bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
                          {t.symbol?.slice(0, 2) ?? "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-foreground font-medium truncate">
                          {t.symbol ?? "Unknown"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.name ?? shortAddr(t.mint)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtUsd(t.priceUsd)}
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
                    {fmtUsd(t.volume24hUsd)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                    {fmtUsd(t.liquidityUsd)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono hidden lg:table-cell">
                    {fmtUsd(t.marketCapUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
