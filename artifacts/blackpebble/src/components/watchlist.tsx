import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import {
  fmtPrice,
  fmtMarketCap,
  fmtPercent,
  pnlColor,
  shortAddr,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Shared watchlist used on both the Trading desk (account-context tabs) and the
 * Portfolio page. Each row shows symbol/name, price, market cap and 24h change,
 * has a remove control, and navigates to the Trading desk for that exact mint
 * when tapped — the remove button stops propagation so it never triggers a
 * navigation.
 */
export function Watchlist({
  onNavigate,
}: {
  onNavigate: (mint: string) => void;
}) {
  const { wallet } = useAccount();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["watchlist", wallet],
    queryFn: () => api.watchlist(wallet!),
    enabled: !!wallet,
    refetchInterval: 30_000,
  });

  const remove = useMutation({
    mutationFn: (mint: string) => api.watchlistRemove(wallet!, mint),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const items = data?.watchlist ?? [];

  if (items.length === 0) {
    return (
      <div className="border border-border bg-card text-center py-10 px-4 text-muted-foreground text-sm">
        Your watchlist is empty. Tap the star on any token to add it here.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards (no horizontal scroll) */}
      <div className="md:hidden space-y-2">
        {items.map((w) => (
          <div
            key={w.mint}
            onClick={() => onNavigate(w.mint)}
            data-testid={`watch-card-${w.mint}`}
            className="border border-border bg-card p-3 flex items-center gap-3 cursor-pointer active:bg-accent/5 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground truncate">
                {w.symbol ?? shortAddr(w.mint)}
              </div>
              {w.name && (
                <div className="text-xs text-muted-foreground truncate">
                  {w.name}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-sm text-foreground">
                {fmtPrice(w.priceUsd)}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {fmtMarketCap(w.marketCapUsd)} MC
              </div>
            </div>
            <div
              className={cn(
                "font-mono text-xs w-16 text-right shrink-0",
                pnlColor(w.priceChange24h),
              )}
            >
              {fmtPercent(w.priceChange24h)}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove.mutate(w.mint);
              }}
              data-testid={`watch-remove-${w.mint}`}
              aria-label={`Remove ${w.symbol ?? "token"} from watchlist`}
              className="shrink-0 p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="font-medium px-4 py-2.5">Token</th>
              <th className="font-medium px-4 py-2.5 text-right">Price</th>
              <th className="font-medium px-4 py-2.5 text-right">Market Cap</th>
              <th className="font-medium px-4 py-2.5 text-right">24h</th>
              <th className="font-medium px-2 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr
                key={w.mint}
                onClick={() => onNavigate(w.mint)}
                data-testid={`watch-row-${w.mint}`}
                className="border-b border-border/50 last:border-0 hover:bg-accent/5 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium text-foreground">
                    {w.symbol ?? shortAddr(w.mint)}
                  </div>
                  {w.name && (
                    <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {w.name}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono">
                  {fmtPrice(w.priceUsd)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono">
                  {fmtMarketCap(w.marketCapUsd)}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-mono",
                    pnlColor(w.priceChange24h),
                  )}
                >
                  {fmtPercent(w.priceChange24h)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove.mutate(w.mint);
                    }}
                    data-testid={`watch-remove-${w.mint}`}
                    aria-label={`Remove ${w.symbol ?? "token"} from watchlist`}
                    className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
