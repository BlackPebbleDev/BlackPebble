import { useState, useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  LineChart,
  Loader2,
  Star,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  AlertTriangle,
  Info,
} from "lucide-react";
import { api, type TokenInfo, type Trade, type TradeQuote } from "@/lib/api";
import { LiveIndicator } from "@/components/live-indicator";
import { TradeList } from "@/components/trade-list";
import { OpenPositions } from "@/components/open-positions";
import { Watchlist } from "@/components/watchlist";
import { useAccount } from "@/hooks/use-account";
import { useToast } from "@/hooks/use-toast";
import {
  fmtSol,
  fmtUsd,
  fmtMarketCap,
  fmtPercent,
  fmtPrice,
  fmtTokenAmount,
  pnlColor,
  shortAddr,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
);

const BUY_PRESETS = [0.5, 1, 5, 10];
const SELL_PRESETS = [25, 50, 75, 100];

function useTokenParam(): string | null {
  const search = useSearch();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("token");
  }, [search]);
}

function TokenHeader({ info }: { info: TokenInfo }) {
  return (
    <div className="border border-border bg-card p-4 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        {info.logo ? (
          <img
            src={info.logo}
            alt=""
            className="w-10 h-10 object-cover"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          />
        ) : (
          <div className="w-10 h-10 bg-secondary flex items-center justify-center text-xs text-muted-foreground">
            {info.symbol?.slice(0, 2) ?? "?"}
          </div>
        )}
        <div>
          <div className="font-semibold flex items-center gap-2">
            {info.symbol ?? "Unknown"}
            {!info.isMigrated && (
              <span className="text-[10px] uppercase tracking-wider text-accent border border-accent/40 px-1.5 py-0.5">
                Bonding
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {info.name ?? shortAddr(info.mint)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 ml-auto text-right">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Price
          </div>
          <div className="font-mono text-sm">{fmtPrice(info.priceUsd)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            24h
          </div>
          <div className={cn("font-mono text-sm", pnlColor(info.priceChange24h))}>
            {fmtPercent(info.priceChange24h)}
          </div>
        </div>
        <div className="hidden sm:block">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Volume 24h
          </div>
          <div className="font-mono text-sm">{fmtUsd(info.volume24hUsd)}</div>
        </div>
        <div className="hidden md:block">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Liquidity
          </div>
          <div className="font-mono text-sm">{fmtUsd(info.liquidityUsd)}</div>
        </div>
        <div className="hidden lg:block">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Market Cap
          </div>
          <div className="font-mono text-sm">{fmtUsd(info.marketCapUsd)}</div>
        </div>
      </div>
    </div>
  );
}

function PriceChart({ info }: { info: TokenInfo }) {
  const { data } = useQuery({
    queryKey: ["live-trades", info.mint],
    queryFn: () => api.liveTrades(info.mint),
    refetchInterval: 5_000,
    enabled: !info.isMigrated,
  });

  if (info.isMigrated && info.pairAddress) {
    return (
      <div className="border border-border bg-card h-[420px]">
        <iframe
          title="chart"
          src={`https://dexscreener.com/solana/${info.pairAddress}?embed=1&theme=dark&trades=0&info=0`}
          className="w-full h-full"
        />
      </div>
    );
  }

  const trades = (data?.trades ?? [])
    .slice()
    .reverse()
    .filter((t) => t.tokenAmount > 0);
  const chartData = {
    labels: trades.map((_, i) => String(i)),
    datasets: [
      {
        label: "Price (SOL)",
        data: trades.map((t) => t.solAmount / t.tokenAmount),
        borderColor: "#c9a96e",
        backgroundColor: "rgba(201,169,110,0.08)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="border border-border bg-card p-4 h-[420px]">
      <div className="text-xs text-muted-foreground mb-2">
        Bonding curve — recent trade prices (live)
      </div>
      {trades.length === 0 ? (
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          Waiting for live trades…
        </div>
      ) : (
        <div className="h-[360px]">
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { display: false },
                y: {
                  grid: { color: "rgba(255,255,255,0.04)" },
                  ticks: { color: "#a0a0a0" },
                },
              },
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Pre-trade estimate panel: shows the simulated execution price, slippage,
 * liquidity impact and the estimated amount the user will receive. The numbers
 * come from the server quote, which uses the same model as actual execution.
 */
function TradeEstimate({
  quote,
  loading,
  show,
  side,
  symbol,
}: {
  quote: TradeQuote | undefined;
  loading: boolean;
  show: boolean;
  side: "buy" | "sell";
  symbol: string | null;
}) {
  if (!show) return null;

  if (loading && !quote) {
    return (
      <div className="border border-border bg-background p-3 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Estimating slippage…
      </div>
    );
  }
  if (!quote) return null;

  if (!quote.ok) {
    return (
      <div
        className="border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2"
        data-testid="quote-error"
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{quote.error ?? "Quote unavailable."}</span>
      </div>
    );
  }

  const impactColor =
    quote.warningLevel === "extreme"
      ? "text-red-400"
      : quote.warningLevel === "high"
        ? "text-amber-400"
        : "text-foreground";

  return (
    <div
      className="border border-border bg-background p-3 text-xs space-y-1.5"
      data-testid="trade-estimate"
    >
      <div className="flex justify-between">
        <span className="text-muted-foreground">Execution price</span>
        <span className="font-mono">{fmtPrice(quote.effectivePriceUsd)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Estimated slippage</span>
        <span className={cn("font-mono", impactColor)}>
          {quote.slippagePercent.toFixed(2)}%
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Trade impact (of liquidity)</span>
        <span className={cn("font-mono", impactColor)}>
          {quote.tradeImpactPercent < 0.01
            ? "<0.01%"
            : `${quote.tradeImpactPercent.toFixed(2)}%`}
        </span>
      </div>
      <div className="flex justify-between pt-1.5 border-t border-border/60">
        <span className="text-muted-foreground">
          {side === "buy" ? "Estimated receive" : "Estimated proceeds"}
        </span>
        <span className="font-mono text-foreground">
          {side === "buy"
            ? `${fmtTokenAmount(quote.estimatedTokens)} ${symbol ?? ""}`.trim()
            : `${fmtSol(quote.estimatedSol)} SOL`}
        </span>
      </div>
    </div>
  );
}

/** Small debounce hook so we don't fire a quote request on every keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function TradePanel({ info }: { info: TokenInfo }) {
  const { wallet, account } = useAccount();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [solAmount, setSolAmount] = useState("");
  const [sellPercent, setSellPercent] = useState(100);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: posData } = useQuery({
    queryKey: ["positions", wallet],
    queryFn: () => api.positions(wallet!),
    enabled: !!wallet,
    refetchInterval: 15_000,
  });
  const position = posData?.positions.find((p) => p.token_mint === info.mint);

  // Pre-trade quote: simulated slippage / impact / execution price, debounced.
  const debouncedSol = useDebounced(solAmount, 350);
  const debouncedPct = useDebounced(sellPercent, 350);
  const buyValid = side === "buy" && Number(debouncedSol) >= 0.1;
  const sellValid = side === "sell" && !!position;
  const quoteEnabled = !!wallet && (buyValid || sellValid);

  const { data: quote, isFetching: quoteFetching } = useQuery<TradeQuote>({
    queryKey: [
      "quote",
      info.mint,
      side,
      side === "buy" ? debouncedSol : debouncedPct,
      wallet,
    ],
    queryFn: () =>
      api.quote(
        side === "buy"
          ? { wallet, mint: info.mint, side: "buy", solAmount: Number(debouncedSol) }
          : { wallet, mint: info.mint, side: "sell", percent: debouncedPct },
      ),
    enabled: quoteEnabled,
    refetchInterval: 20_000,
  });

  // Reset any pending confirmation whenever the order parameters change.
  useEffect(() => {
    setConfirmOpen(false);
  }, [side, solAmount, sellPercent, info.mint]);

  const mutation = useMutation({
    mutationFn: () =>
      api.execute(
        side === "buy"
          ? {
              wallet,
              mint: info.mint,
              side: "buy",
              solAmount: Number(solAmount),
              name: info.name,
              symbol: info.symbol,
              logo: info.logo,
            }
          : {
              wallet,
              mint: info.mint,
              side: "sell",
              percent: sellPercent,
            },
      ),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({ title: "Trade failed", description: res.error, variant: "destructive" });
        return;
      }
      const t = res.trade!;
      toast({
        title: `${t.side === "buy" ? "Bought" : "Sold"} ${info.symbol ?? "token"}`,
        description:
          t.side === "buy"
            ? `${fmtSol(t.solAmount)} SOL → ${fmtTokenAmount(t.tokenAmount)} tokens`
            : `${fmtTokenAmount(t.tokenAmount)} tokens → ${fmtSol(t.solAmount)} SOL${
                t.pnl != null ? ` (P&L ${fmtSol(t.pnl)} SOL)` : ""
              }`,
      });
      setSolAmount("");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["pf"] });
      qc.invalidateQueries({ queryKey: ["pf-stats"] });
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (e: Error) => {
      toast({ title: "Trade failed", description: e.message, variant: "destructive" });
    },
  });

  if (!wallet) {
    return (
      <div className="border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Connect your wallet to start paper trading.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card">
      <div className="grid grid-cols-2">
        <button
          onClick={() => setSide("buy")}
          data-testid="button-side-buy"
          className={cn(
            "py-3 text-sm font-medium transition-colors",
            side === "buy"
              ? "bg-emerald-500/15 text-emerald-400 border-b-2 border-emerald-400"
              : "text-muted-foreground border-b-2 border-transparent hover:text-foreground",
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          data-testid="button-side-sell"
          className={cn(
            "py-3 text-sm font-medium transition-colors",
            side === "sell"
              ? "bg-red-500/15 text-red-400 border-b-2 border-red-400"
              : "text-muted-foreground border-b-2 border-transparent hover:text-foreground",
          )}
        >
          Sell
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Cash balance</span>
          <span className="font-mono text-foreground">
            {fmtSol(account?.paper_balance)} SOL
          </span>
        </div>

        {side === "buy" ? (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Amount (SOL)
              </label>
              <input
                type="number"
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                placeholder="0.0"
                min={0.1}
                step={0.1}
                data-testid="input-buy-amount"
                className="w-full h-11 bg-background border border-border px-3 font-mono text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {BUY_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setSolAmount(String(p))}
                  data-testid={`preset-buy-${p}`}
                  className="py-2 text-xs border border-border hover:border-accent hover:text-accent transition-colors font-mono"
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Position</span>
              <span className="font-mono text-foreground">
                {position
                  ? `${fmtTokenAmount(position.total_tokens)} ${info.symbol ?? ""}`
                  : "None"}
              </span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Sell {sellPercent}%
              </label>
              <input
                type="range"
                min={1}
                max={100}
                value={sellPercent}
                onChange={(e) => setSellPercent(Number(e.target.value))}
                data-testid="input-sell-percent"
                className="w-full accent-accent"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {SELL_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setSellPercent(p)}
                  data-testid={`preset-sell-${p}`}
                  className="py-2 text-xs border border-border hover:border-accent hover:text-accent transition-colors font-mono"
                >
                  {p}%
                </button>
              ))}
            </div>
          </>
        )}

        <TradeEstimate
          quote={quote}
          loading={quoteFetching && quoteEnabled}
          show={quoteEnabled}
          side={side}
          symbol={info.symbol}
        />

        {confirmOpen && quote?.ok ? (
          <div
            className={cn(
              "border p-3 space-y-3",
              quote.warningLevel === "extreme"
                ? "border-red-500/50 bg-red-500/10"
                : "border-amber-500/50 bg-amber-500/10",
            )}
            data-testid="trade-confirm"
          >
            <div className="flex items-start gap-2 text-xs">
              <AlertTriangle
                className={cn(
                  "w-4 h-4 shrink-0 mt-0.5",
                  quote.warningLevel === "extreme" ? "text-red-400" : "text-amber-400",
                )}
              />
              <p className="text-foreground/90">
                This order is{" "}
                <span className="font-mono font-medium">
                  {fmtPercent(quote.tradeImpactPercent)}
                </span>{" "}
                of available liquidity and will move the price against you for an
                estimated{" "}
                <span className="font-mono font-medium">
                  {quote.slippagePercent.toFixed(2)}%
                </span>{" "}
                slippage.{" "}
                {quote.warningLevel === "extreme"
                  ? "That's a very large fill — expect a poor execution price."
                  : "Consider a smaller size for a better fill."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                data-testid="button-cancel-trade"
                className="h-10 text-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                data-testid="button-confirm-trade"
                className={cn(
                  "h-10 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-40",
                  side === "buy"
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "bg-red-500 text-white hover:bg-red-400",
                )}
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm anyway
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              if (
                quote?.ok &&
                (quote.warningLevel === "high" || quote.warningLevel === "extreme")
              ) {
                setConfirmOpen(true);
                return;
              }
              mutation.mutate();
            }}
            disabled={
              mutation.isPending ||
              (side === "buy" && (!solAmount || Number(solAmount) < 0.1)) ||
              (side === "sell" && !position) ||
              (quoteEnabled && quote?.ok === false)
            }
            data-testid="button-execute-trade"
            className={cn(
              "w-full h-11 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed",
              side === "buy"
                ? "bg-emerald-500 text-black hover:bg-emerald-400"
                : "bg-red-500 text-white hover:bg-red-400",
            )}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {quote?.blocked
              ? "Trade too large"
              : `${side === "buy" ? "Buy" : "Sell"} ${info.symbol ?? "Token"}`}
          </button>
        )}

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          BlackPebble simulates slippage from each token's available liquidity, so
          larger orders fill at a worse price — just like a real swap. Trades above
          20% of liquidity are blocked.
        </p>

        {position && (
          <div className="pt-3 border-t border-border text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Position value</span>
              <span className="font-mono">{fmtSol(position.currentValueSol)} SOL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unrealized P&L</span>
              <span className={cn("font-mono", pnlColor(position.unrealizedPnlSol))}>
                {fmtSol(position.unrealizedPnlSol)} SOL ({fmtPercent(position.unrealizedPnlPercent)})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WatchButton({ info }: { info: TokenInfo }) {
  const { wallet } = useAccount();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["watchlist", wallet],
    queryFn: () => api.watchlist(wallet!),
    enabled: !!wallet,
  });
  const watched = data?.watchlist.some((w) => w.mint === info.mint);

  const mutation = useMutation({
    mutationFn: () =>
      watched
        ? api.watchlistRemove(wallet!, info.mint)
        : api.watchlistAdd({
            wallet,
            mint: info.mint,
            name: info.name,
            symbol: info.symbol,
            logo: info.logo,
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  if (!wallet) return null;

  return (
    <button
      onClick={() => mutation.mutate()}
      data-testid="button-watchlist-toggle"
      className={cn(
        "flex items-center gap-2 px-3 h-9 border text-xs transition-colors",
        watched
          ? "border-accent text-accent"
          : "border-border text-muted-foreground hover:text-foreground hover:border-accent/50",
      )}
    >
      <Star className={cn("w-4 h-4", watched && "fill-accent")} />
      {watched ? "Watching" : "Watch"}
    </button>
  );
}

function ActivityTabs() {
  const { wallet } = useAccount();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"positions" | "history" | "watchlist">(
    "positions",
  );

  const { data: posData } = useQuery({
    queryKey: ["positions", wallet],
    queryFn: () => api.positions(wallet!),
    enabled: !!wallet,
    refetchInterval: 15_000,
  });
  const { data: histData } = useQuery({
    queryKey: ["history", wallet],
    queryFn: () => api.history(wallet!),
    enabled: !!wallet && tab === "history",
  });

  if (!wallet) return null;

  const tabs = [
    { id: "positions" as const, label: "Positions" },
    { id: "history" as const, label: "History" },
    { id: "watchlist" as const, label: "Watchlist" },
  ];

  return (
    <div className="border border-border bg-card">
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-activity-${t.id}`}
            className={cn(
              "px-4 py-3 text-sm transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={cn(tab === "positions" && "p-3 md:p-0")}>
        {tab === "positions" && (
          <OpenPositions
            positions={posData?.positions ?? []}
            solUsd={posData?.solUsd ?? 0}
            empty="No open positions."
            onNavigate={(mint) => navigate(`/?token=${mint}`)}
          />
        )}
        {tab === "history" && (
          <TradeList
            trades={histData?.trades ?? []}
            empty="No trade history yet."
            onNavigate={(mint) => navigate(`/?token=${mint}`)}
          />
        )}
        {tab === "watchlist" && (
          <Watchlist onNavigate={(mint) => navigate(`/?token=${mint}`)} />
        )}
      </div>
    </div>
  );
}

function useNavigate() {
  const search = useSearch();
  void search;
  // wouter's navigate via window history fallback
  return (to: string) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.history.pushState(null, "", base + to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
}

export default function TradingDesk() {
  const mint = useTokenParam();
  const { wallet } = useAccount();

  const { data: info, isLoading } = useQuery({
    queryKey: ["token", mint, wallet],
    queryFn: () => api.getToken(mint!, wallet ?? undefined),
    enabled: !!mint,
    refetchInterval: 15_000,
  });

  const { data: trending, dataUpdatedAt: trendingUpdatedAt } = useQuery({
    queryKey: ["trending-quick"],
    queryFn: () => api.trending(),
    enabled: !mint,
    refetchInterval: 30_000,
  });

  const navigate = useNavigate();

  if (!mint) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <LineChart className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold">Trading Desk</h1>
          <LiveIndicator dataUpdatedAt={trendingUpdatedAt} />
        </div>
        <div className="border border-border bg-card p-8 text-center mb-8">
          <p className="text-muted-foreground">
            Search for a token above or pick a trending market below to start
            paper trading.
          </p>
        </div>
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
          Trending
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(trending?.tokens ?? []).slice(0, 12).map((t) => (
            <button
              key={t.mint}
              onClick={() => navigate(`/?token=${t.mint}`)}
              data-testid={`trending-${t.mint}`}
              className="border border-border bg-card p-4 flex items-center gap-3 hover:border-accent/50 transition-colors text-left"
            >
              {t.logo ? (
                <img src={t.logo} alt="" className="w-9 h-9 object-cover" />
              ) : (
                <div className="w-9 h-9 bg-secondary flex items-center justify-center text-xs text-muted-foreground">
                  {t.symbol?.slice(0, 2) ?? "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{t.symbol ?? "Unknown"}</div>
                <div className="text-xs text-muted-foreground truncate font-mono">
                  {t.marketCapUsd != null
                    ? `${fmtMarketCap(t.marketCapUsd).replace("$", "")} MC`
                    : fmtPrice(t.priceUsd)}
                </div>
              </div>
              <div className={cn("text-xs font-mono", pnlColor(t.priceChange24h))}>
                {fmtPercent(t.priceChange24h)}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 px-6">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">Token not found.</p>
          <button
            onClick={() => navigate("/")}
            className="text-accent text-sm hover:underline"
          >
            Back to Trading Desk
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <TokenHeader info={info} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <WatchButton info={info} />
        <a
          href={`https://dexscreener.com/solana/${info.pairAddress ?? info.mint}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-3 h-9 border border-border text-xs text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          DexScreener
        </a>
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {shortAddr(info.mint, 6)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <PriceChart info={info} />
        </div>
        <div className="space-y-4">
          <TradePanel info={info} />
        </div>
      </div>

      <ActivityTabs />
    </div>
  );
}
