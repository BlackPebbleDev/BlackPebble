import { useState, useEffect, useMemo, useRef } from "react";
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
  ArrowRight,
  AlertTriangle,
  Info,
  RefreshCw,
  ChevronDown,
  Copy,
  Check,
  Globe,
  Megaphone,
  Lock,
  Send,
  X as CloseIcon,
  ScrollText,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  api,
  type TokenInfo,
  type LeveragePosition,
  type Trade,
  type TradeQuote,
  type OrderType,
  type Conviction,
  type Sentiment,
  CALLOUT_THESIS_MAX,
  THESIS_TITLE_MAX,
  THESIS_CONTENT_MAX,
} from "@/lib/api";
import { MoreMenu } from "@/components/more-menu";
import { ShareToken } from "@/components/share-token";
import { TradeList } from "@/components/trade-list";
import { OpenPositions } from "@/components/open-positions";
import { LeveragePanel } from "@/components/leverage-panel";
import { TokenLeverageActivity } from "@/components/leverage-portfolio";
import {
  MiniPlanner,
  PlannedTradeSummary,
  type PlannedTrade,
  type PlannedAttachments,
} from "@/components/trade-planner/mini-planner";
import { useAccount } from "@/hooks/use-account";
import { useTradeRate } from "@/hooks/use-sol-usd";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useXAuth } from "@/hooks/use-x-auth";
import { LIVE_MS } from "@/lib/live";
import { LiveIndicator } from "@/components/live-indicator";
import {
  useGuestStore,
  useGuestValuedPositions,
  useGuestValuedLeverage,
  guestBuy,
  guestSell,
  guestCloseLeverage,
  guestCreateOrder,
  guestCreateBuyLimitOrder,
  guestWatchAdd,
  guestWatchRemove,
  guestHistory,
  getGuestState,
} from "@/lib/guest-store";
import { usePaperTradingAccess } from "@/lib/paper-trading-access";
import {
  trackGuestFirstTrade,
  trackGuestSecondTrade,
  trackTokenView,
} from "@/lib/analytics";
import {
  fmtSol,
  fmtUsd,
  fmtMarketCap,
  fmtPercent,
  fmtPercentSafe,
  fmtPrice,
  fmtTokenAmount,
  pnlColor,
  pnlColorSafe,
  shortAddr,
  timeAgo,
} from "@/lib/format";
import { fmtUnitAmt } from "@/components/trade-planner/util";
import { parseAbbreviatedNumber } from "@/lib/trade-planner";
import type { Unit } from "@/lib/trade-planner";
import { impactColor as liquidityImpactColor, fmtImpact } from "@/lib/liquidity";
import {
  TradeWarningCard,
  getTradeWarnings,
} from "@/components/trade-warning-card";
import { cn } from "@/lib/utils";
import { AllOrders } from "@/components/position-orders";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenChartPanel } from "@/components/tv-chart";
import { TokenIntelligenceSection } from "@/components/token-intel";
import { TradingDeskOnboarding } from "@/components/trading-desk-onboarding";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  Tooltip as UITooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
);

/** Small inline help icon with a tap/hover tooltip (works on mobile). */
function HelpTip({ text, label }: { text: string; label: string }) {
  return (
    <UITooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label} help`}
          onClick={(e) => e.preventDefault()}
          className="inline-flex shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors align-middle"
        >
          <Info className="w-3 h-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] text-[11px] leading-relaxed">
        {text}
      </TooltipContent>
    </UITooltip>
  );
}

const BUY_PRESETS = [0.5, 1, 5, 10];
const USD_BUY_PRESETS = [25, 50, 100, 500];
const SELL_PRESETS = [25, 50, 75, 100];

function useTokenParam(): string | null {
  const search = useSearch();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("token");
  }, [search]);
}

/** Inline X (twitter) brand glyph - lucide has no brand mark for it. */
function XGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function TokenHeader({
  info,
  dataUpdatedAt,
}: {
  info: TokenInfo;
  dataUpdatedAt: number;
}) {
  const socialLinks = [
    info.websiteUrl
      ? { key: "website", href: info.websiteUrl, icon: <Globe className="w-3 h-3" />, label: "Website" }
      : null,
    info.twitterUrl
      ? { key: "twitter", href: info.twitterUrl, icon: <XGlyph className="w-3 h-3" />, label: "X" }
      : null,
    info.telegramUrl
      ? { key: "telegram", href: info.telegramUrl, icon: <Send className="w-3 h-3" />, label: "Telegram" }
      : null,
  ].filter(Boolean) as { key: string; href: string; icon: React.ReactNode; label: string }[];

  const hasBanner = !!info.bannerUrl;
  const [bannerExpanded, setBannerExpanded] = useState(false);
  const [logoExpanded, setLogoExpanded] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="space-y-3 lg:space-y-[26px]">
      {/*
       * ── BANNER CARD ──────────────────────────────────────────────────────────
       * Standalone rounded card - no UI overlay of any kind.
       * <img> with natural dimensions (w-full h-auto) shows the full artwork
       * at its correct aspect ratio on mobile; on desktop the height is capped
       * via aspect-ratio + object-cover so wide monitors don't get an
       * oversized hero. Click anywhere to expand fullscreen. GIFs/WebP still
       * animate; never canvas.
       */}
      {hasBanner && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setBannerExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setBannerExpanded(true);
          }}
          data-testid="button-expand-banner"
          aria-label="Expand banner image"
          className="group relative rounded-xl overflow-hidden bg-card shadow-card cursor-zoom-in lg:aspect-[17/5]"
        >
          <img
            src={info.bannerUrl!}
            alt={`${info.symbol ?? "Token"} banner`}
            loading="lazy"
            className="w-full h-auto lg:h-full lg:w-full lg:object-cover block select-none transition-transform duration-200 group-hover:scale-[1.015]"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
        </div>
      )}

      {/*
       * ── INFO + SOCIAL CARD ───────────────────────────────────────────────────
       * Information sits directly on the card surface - no nested containers,
       * no pill, no capsule. Two-column row (left: identity, right: price),
       * with more generous spacing/typography on desktop for better hierarchy.
       */}
      <div className="hairline-accent rounded-xl bg-card shadow-card px-3 py-2.5 lg:px-5 lg:py-[23px] space-y-2 lg:space-y-3">

        {/* ── Two-column info row ── */}
        <div className="flex items-center justify-between gap-3 lg:gap-6">

          {/* LEFT - logo + name + ticker + LIVE */}
          <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
            {info.logo && !logoFailed ? (
              <img
                src={info.logo}
                alt=""
                onClick={(e) => {
                  e.stopPropagation();
                  setLogoExpanded(true);
                }}
                data-testid="button-expand-logo"
                className="w-8 h-8 lg:w-11 lg:h-11 rounded-full object-cover shrink-0 cursor-zoom-in transition-transform duration-200 hover:scale-105"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="w-8 h-8 lg:w-11 lg:h-11 rounded-full bg-secondary flex items-center justify-center text-[10px] lg:text-xs shrink-0 text-muted-foreground">
                {info.symbol?.slice(0, 2) ?? "?"}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 leading-tight">
                <span className="text-[15px] lg:text-lg font-bold tracking-tight truncate">
                  {info.symbol ?? "Unknown"}
                </span>
                {!info.isMigrated && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-accent bg-accent/12 rounded-full px-1.5 py-px shrink-0">
                    Bonding
                  </span>
                )}
              </div>
              <div className="text-[11px] lg:text-xs text-muted-foreground leading-tight truncate">
                {info.name ?? shortAddr(info.mint)}
              </div>
              <LiveIndicator dataUpdatedAt={dataUpdatedAt} />
            </div>
          </div>

          {/* RIGHT - price + 24h, no container */}
          <div className="flex items-center gap-4 lg:gap-8 shrink-0 text-right">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
                Price
              </div>
              <div className="font-mono text-[13px] lg:text-base font-semibold leading-snug">
                {fmtPrice(info.priceUsd)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
                24h
              </div>
              <div className={cn("font-mono text-[13px] lg:text-base font-semibold leading-snug", pnlColorSafe(info.priceChange24h))}>
                {fmtPercentSafe(info.priceChange24h)}
              </div>
            </div>
          </div>
        </div>

        {/* ── Social links row ── */}
        {socialLinks.length > 0 && (
          <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap pt-2 lg:pt-3 border-t border-border/40">
            {socialLinks.map((l) => (
              <a
                key={l.key}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`link-token-${l.key}`}
                className="inline-flex items-center gap-1.5 px-2.5 lg:px-3 py-1 lg:py-1.5 rounded-full bg-secondary/60 border border-border text-xs lg:text-[13px] text-foreground/80 hover:border-accent/60 hover:text-accent transition-colors"
              >
                {l.icon}
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {hasBanner && (
        <ImageLightbox
          src={info.bannerUrl!}
          alt={`${info.symbol ?? "Token"} banner`}
          open={bannerExpanded}
          onClose={() => setBannerExpanded(false)}
        />
      )}
      {info.logo && (
        <ImageLightbox
          src={info.logo}
          alt={`${info.symbol ?? "Token"} logo`}
          open={logoExpanded}
          onClose={() => setLogoExpanded(false)}
        />
      )}
    </div>
  );
}

function PriceChart({ info }: { info: TokenInfo }) {
  const { data } = useQuery({
    queryKey: ["live-trades", info.mint],
    queryFn: () => api.liveTrades(info.mint),
    refetchInterval: LIVE_MS.trades,
    enabled: !info.isMigrated,
  });

  if (info.isMigrated && info.pairAddress) {
    return <TokenChartPanel info={info} />;
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
    <div className="rounded-xl bg-card shadow-card p-4 h-[420px]">
      <div className="text-xs text-muted-foreground mb-2">
        Bonding curve - recent trade prices (live)
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
  const [detailsOpen, setDetailsOpen] = useState(false);

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
    const reasons = quote.errors ?? (quote.error ? [quote.error] : []);
    return (
      <div
        className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
        data-testid="quote-error"
      >
        {reasons.length <= 1 ? (
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{reasons[0] ?? "Quote unavailable."}</span>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium mb-1">Trade blocked:</div>
              <ol className="space-y-0.5 list-none">
                {reasons.map((r, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="shrink-0 font-medium">{i + 1}.</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Slippage keeps the server's warning-level coloring; liquidity impact uses
  // the shared green/yellow/orange/red bands.
  const slippageColor =
    quote.warningLevel === "extreme"
      ? "text-danger"
      : quote.warningLevel === "high"
        ? "text-warning"
        : "text-foreground";
  const warnings = getTradeWarnings(quote);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-surface-1 text-xs"
      data-testid="trade-estimate"
    >
      {quote.lowData && (
        <div
          className="flex items-start gap-2 px-3 py-2 border-b border-warning/30 bg-warning/10 text-amber-300"
          data-testid="low-data-notice"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            This token has limited market data. Smaller simulated trades only.
          </span>
        </div>
      )}

      {/* Key execution-cost fields are always visible (no expand required). */}
      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Execution price</span>
          <span className="font-mono">{fmtPrice(quote.effectivePriceUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1 text-muted-foreground">
            Estimated slippage
            <HelpTip
              label="Slippage"
              text="The gap between the listed price and your actual fill price. Bigger orders move the price more, so they slip further."
            />
          </span>
          <span className={cn("font-mono", slippageColor)}>
            {quote.slippagePercent.toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1 text-muted-foreground">
            Liquidity impact
            <HelpTip
              label="Liquidity Impact"
              text="What share of the token's available liquidity this order consumes. Large shares lead to worse fills."
            />
          </span>
          <span
            className={cn("font-mono", liquidityImpactColor(quote.tradeImpactPercent))}
            data-testid="estimate-liquidity-impact"
          >
            {fmtImpact(quote.tradeImpactPercent)}
          </span>
        </div>
        <div className="flex justify-between pt-1.5 border-t border-border/60">
          <span className="text-muted-foreground">
            {side === "buy" ? "Receive" : "Estimated proceeds"}
          </span>
          <span className="font-mono text-foreground">
            {side === "buy"
              ? `${fmtTokenAmount(quote.estimatedTokens)} ${symbol ?? ""}`.trim()
              : `${fmtSol(quote.estimatedSol)} SOL`}
          </span>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1.5 border-t border-border/60 px-3 py-2.5">
          {warnings.map((w) => (
            <TradeWarningCard key={w.id} warning={w} />
          ))}
        </div>
      )}

      {/* Secondary detail stays collapsed to keep the panel compact. */}
      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        data-testid="button-trade-details-toggle"
        className="flex w-full items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-secondary/40"
      >
        <span>Trade Details</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            detailsOpen && "rotate-180",
          )}
        />
      </button>

      {detailsOpen && (
        <div className="space-y-1.5 border-t border-border/60 px-3 py-2.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Listed price</span>
            <span className="font-mono">{fmtPrice(quote.rawPriceUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Trade value</span>
            <span className="font-mono">{fmtUsd(quote.tradeUsdValue)}</span>
          </div>
        </div>
      )}
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

/** Format an amount for the buy input: up to 4 dp, no trailing zeros. Unit-agnostic. */
function formatAppliedAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Number(value.toFixed(4)));
}

/** Position value in the active unit. Falls back to SOL when the rate is missing. */
function fmtUnitValue(solValue: number, unit: Unit, solUsd: number | null): string {
  if (unit === "USD" && solUsd != null && solUsd > 0) {
    return fmtUnitAmt(solValue * solUsd, "USD");
  }
  return `${fmtSol(solValue)} SOL`;
}

/**
 * P&L in the active unit. Keeps the SOL-mode look (signed via the number) and
 * shows USD as "-$182.38" / "$182.38" - sign before the $, full precision.
 */
function fmtUnitPnl(solValue: number, unit: Unit, solUsd: number | null): string {
  if (unit === "USD" && solUsd != null && solUsd > 0) {
    const v = solValue * solUsd;
    const body = Math.abs(v).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${v < 0 ? "-" : ""}$${body}`;
  }
  return `${fmtSol(solValue)} SOL`;
}

// ── Token Meta Strip ──────────────────────────────────────────────────────────

/** Format an epoch-ms timestamp as a human age: "4m", "7h", "14d". */
function fmtAge(createdAtMs: number): string {
  const ageMs = Math.max(0, Date.now() - createdAtMs);
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Map a raw DexScreener dexId to a display-friendly platform name. */
function dexLabel(dexId: string): string {
  const map: Record<string, string> = {
    raydium: "Raydium",
    meteora: "Meteora",
    orca: "Orca",
    pumpfun: "Pump.fun",
    "pump-fun": "Pump.fun",
    pumpswap: "Pump.fun",
    phoenix: "Phoenix",
    lifinity: "Lifinity",
    aldrin: "Aldrin",
    crema: "Crema",
    cropper: "Cropper",
    fluxbeam: "FluxBeam",
    saber: "Saber",
    serum: "Serum",
    step: "Step",
    saros: "Saros",
  };
  return map[dexId.toLowerCase()] ?? dexId;
}

/**
 * True when a token actually originates on Pump.fun - either still on the
 * bonding curve (source is always "pumpportal", Pump.fun's live trade feed)
 * or migrated to a PumpSwap/Pump.fun pool post-graduation. Used to gate the
 * Pump.fun row in the More menu so it never shows for unrelated tokens.
 */
function isPumpFunToken(info: TokenInfo): boolean {
  if (!info.isMigrated) return true;
  const dex = info.dexId?.toLowerCase();
  return dex === "pumpfun" || dex === "pump-fun" || dex === "pumpswap";
}

/**
 * Lightweight metadata strip - shows identity metadata (age, platform, status)
 * that is NOT duplicated in the Token Intelligence section below the chart.
 * Styled as inline muted text with bullet separators, not a card/pill/box.
 */
function QuickStatsStrip({ info }: { info: TokenInfo }) {
  const items: string[] = [];

  if (info.pairCreatedAt != null && info.pairCreatedAt > 0)
    items.push(fmtAge(info.pairCreatedAt));

  // Platform label: prefer dexId from DexScreener; fall back to source hint
  if (info.dexId) {
    items.push(dexLabel(info.dexId));
  } else if (info.source === "pumpportal") {
    items.push("Pump.fun");
  }

  // Mint / migration status
  if (!info.isMigrated) {
    items.push("Bonding Curve");
  } else {
    items.push("Graduated");
  }

  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground/60 select-none px-0.5">
        {items.map((item, i) => (
          <span key={item} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground/30">•</span>}
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type QuickOrder = { enabled: boolean; mcValue: string; percent: number };
const QUICK_ORDER_DEFAULT: QuickOrder = { enabled: false, mcValue: "", percent: 100 };

/**
 * One rung of the multi-target take-profit ladder: an MC trigger + a sell % of
 * the *remaining* position at the time the rung fills (not % of the original
 * position). Rungs fire sequentially as the MC rises, so percentages compound
 * down the ladder and are NOT required to add up to 100%.
 */
type TpRung = { mcValue: string; percent: number };
const MAX_TP_RUNGS = 4;
const TP_LADDER_DEFAULT: TpRung[] = [{ mcValue: "", percent: 50 }];

/**
 * A single automated order row (Stop Loss). Take Profit now uses the dedicated
 * ladder below; this stays for the single-target Stop Loss (always sells 100%
 * per the trading spec - no percent selector).
 */
function QuickOrderToggle({
  label,
  tone,
  enabled,
  mcValue,
  onChange,
  helpText,
}: {
  label: string;
  tone: "profit" | "loss";
  enabled: boolean;
  mcValue: string;
  onChange: (v: QuickOrder) => void;
  helpText?: string;
}) {
  const labelColor = tone === "profit" ? "text-success" : "text-danger";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange({ enabled: e.target.checked, mcValue, percent: 100 })
          }
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-medium w-[74px] shrink-0",
            labelColor,
          )}
        >
          {label}
        </span>
        {helpText && <HelpTip label={label} text={helpText} />}
        <input
          type="text"
          value={mcValue}
          onChange={(e) =>
            onChange({ enabled, mcValue: e.target.value, percent: 100 })
          }
          placeholder={tone === "profit" ? "Take Profit MC" : "Stop Loss MC"}
          className="flex-1 h-7 rounded-md bg-background border border-border px-2 font-mono text-[11px] focus:outline-none focus:border-accent"
        />
      </div>
      {enabled && (
        <div className="flex items-center gap-1.5 pl-5 text-[11px] text-muted-foreground">
          Sells <span className="font-mono text-foreground">100%</span> of your
          remaining position when triggered.
        </div>
      )}
    </div>
  );
}

/**
 * Multi-target Take Profit ladder (spec #1). Up to four rungs, each an MC
 * trigger + a sell % of the *remaining* position at the moment that rung fills.
 * Rungs fire sequentially as the market cap rises, so each percent compounds on
 * what's left - totals are NOT capped at or required to reach 100%. Each enabled
 * rung becomes its own take_profit order (evaluated independently by the order
 * engine, which already sells a % of the live remaining balance).
 */
function TpLadder({
  enabled,
  rungs,
  onToggle,
  onChange,
  allowMultiTarget = true,
}: {
  enabled: boolean;
  rungs: TpRung[];
  onToggle: (v: boolean) => void;
  onChange: (rungs: TpRung[]) => void;
  /** When false, the multi-target ladder is disabled (single target only). */
  allowMultiTarget?: boolean;
}) {
  const patchRung = (i: number, patch: Partial<TpRung>) =>
    onChange(rungs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const setPercent = (i: number, raw: string) => {
    const n = Math.max(0, Math.min(100, Math.floor(Number(raw) || 0)));
    patchRung(i, { percent: n });
  };

  const addRung = () => {
    if (rungs.length >= MAX_TP_RUNGS) return;
    onChange([...rungs, { mcValue: "", percent: 50 }]);
  };
  const removeRung = (i: number) => {
    if (rungs.length <= 1) return;
    onChange(rungs.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          data-testid="checkbox-quick-take-profit"
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
        <span className="flex items-center gap-1 text-xs font-medium text-success">
          Take Profit
        </span>
        <HelpTip
          label="Take Profit"
          text="Set up to four targets that fill in order as the market cap rises. Each one sells a percentage of whatever is left of your position at that moment - they don't need to add up to 100%."
        />
      </div>

      {enabled && (
        <div className="space-y-2 pl-5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="w-[58px] shrink-0">Target</span>
            <span className="flex-1">Market cap ≥</span>
            <span className="w-[88px] shrink-0">Sell % of rem.</span>
            {rungs.length > 1 && <span className="w-7 shrink-0" />}
          </div>
          {rungs.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-[58px] shrink-0 text-[11px] text-muted-foreground">
                Target {i + 1}
              </span>
              <input
                type="text"
                value={r.mcValue}
                onChange={(e) => patchRung(i, { mcValue: e.target.value })}
                placeholder="MC ≥"
                data-testid={`input-tp-mc-${i}`}
                className="flex-1 h-7 rounded-md bg-background border border-border px-2 font-mono text-[11px] focus:outline-none focus:border-accent"
              />
              <div className="flex w-[88px] shrink-0 items-center">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={r.percent === 0 ? "" : r.percent}
                  onChange={(e) => setPercent(i, e.target.value)}
                  placeholder="%"
                  data-testid={`input-tp-pct-${i}`}
                  className="w-full h-7 rounded-md bg-background border border-border px-2 font-mono text-[11px] focus:outline-none focus:border-accent"
                />
                <span className="px-1 text-[11px] text-muted-foreground">%</span>
              </div>
              {rungs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRung(i)}
                  aria-label={`Remove target ${i + 1}`}
                  data-testid={`button-tp-remove-${i}`}
                  className="h-7 w-7 shrink-0 rounded-md border border-border text-muted-foreground hover:text-danger hover:border-danger/50 transition-colors"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {allowMultiTarget && rungs.length < MAX_TP_RUNGS && (
            <button
              type="button"
              onClick={addRung}
              data-testid="button-tp-add"
              className="h-7 px-2.5 rounded-md text-[11px] border border-border text-muted-foreground hover:text-accent hover:border-accent/50 transition-colors"
            >
              + Add Target
            </button>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Each target sells that % of your{" "}
            <span className="text-foreground">remaining</span> position as the
            market cap rises - they fill in order and don't need to total 100%.
          </p>
        </div>
      )}
    </div>
  );
}

type QuickBuyLimit = { enabled: boolean; mcValue: string };
const QUICK_BUY_LIMIT_DEFAULT: QuickBuyLimit = { enabled: false, mcValue: "" };

/**
 * Buy Limit row for the Automated Orders section. Unlike TP/SL (which attach
 * after the next buy), a buy limit is an entry order created immediately via the
 * page-level `createBuyLimitOrder` helper. The SOL it spends is the buy box's
 * current Amount. No order engine logic lives here - this only collects inputs.
 */
function BuyLimitRow({
  enabled,
  mcValue,
  solAmount,
  canCreate,
  onChange,
  onCreate,
}: {
  enabled: boolean;
  mcValue: string;
  /** SOL the order will spend (the buy box Amount, converted to SOL). */
  solAmount: number;
  canCreate: boolean;
  onChange: (v: QuickBuyLimit) => void;
  onCreate: () => void;
}) {
  const parsedMc = parseAbbreviatedNumber(mcValue);
  const validMc = parsedMc != null && parsedMc > 0;
  const validAmount = Number.isFinite(solAmount) && solAmount >= 0.1;
  const ready = enabled && validMc && validAmount && canCreate;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange({ enabled: e.target.checked, mcValue })}
          data-testid="checkbox-quick-buy-limit"
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
        <span className="flex items-center gap-1 text-xs font-medium w-[74px] shrink-0 text-accent">
          Buy Limit
        </span>
        <HelpTip
          label="Buy Limit"
          text="Automatically buys using your Amount above when the market cap drops to or below your target."
        />
        <input
          type="text"
          value={mcValue}
          onChange={(e) => onChange({ enabled, mcValue: e.target.value })}
          placeholder="Buy when MC ≤"
          data-testid="input-quick-buy-limit-mc"
          className="flex-1 h-7 rounded-md bg-background border border-border px-2 font-mono text-[11px] focus:outline-none focus:border-accent"
        />
      </div>
      {enabled && (
        <div className="flex items-center justify-between gap-2 pl-5">
          <span className="text-[11px] text-muted-foreground">
            {!validAmount
              ? "Enter an Amount above (≥ 0.1 SOL)"
              : !validMc
                ? "Enter a target market cap"
                : `Buy ${fmtSol(solAmount)} SOL @ ≤ ${fmtMarketCap(parsedMc)}`}
          </span>
          <button
            type="button"
            onClick={onCreate}
            disabled={!ready}
            data-testid="button-quick-buy-limit-set"
            className="h-6 px-2.5 rounded-md text-[11px] border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Set Buy Limit
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact leverage position summary shown under the buy/sell box (alongside the
 * spot summary). Read-only; the token-page Leverage box handles closing/toasts.
 *   current value = notional + unrealized P&L
 *   distance to liq% = ((currentMC − liqMC) / currentMC) × 100
 */
function LeverageSummary({
  p,
  unit,
  solUsd,
  onClose,
}: {
  p: LeveragePosition;
  unit: Unit;
  solUsd: number | null;
  /** When provided, renders a Close button (used for guest demo positions). */
  onClose?: (p: LeveragePosition) => void;
}) {
  const curVal =
    p.unrealizedPnlSol != null ? p.notional_sol + p.unrealizedPnlSol : null;
  const cur = p.currentMarketCapUsd;
  const liq = p.liq_market_cap;
  const dist =
    cur != null && liq != null && cur > 0 ? ((cur - liq) / cur) * 100 : null;
  const isShort = p.direction === "short";
  const directionLabel = isShort ? "Short" : "Long";
  const directionColor = isShort ? "text-danger" : "text-accent";
  const size = `${fmtTokenAmount(p.tokens)} ${p.token_symbol ?? ""}`.trim();
  return (
    <div className="space-y-1.5" data-testid="summary-leverage">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Perps Position
        </span>
        <span className={cn("text-[11px] font-semibold uppercase", directionColor)}>
          {p.leverage}x {directionLabel}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Direction</span>
        <span className={cn("font-mono font-semibold", directionColor)}>
          {directionLabel}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Size</span>
        <span className="font-mono text-foreground">{size}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Notional</span>
        <span className="font-mono">
          {fmtUnitValue(p.notional_sol, unit, solUsd)}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Margin</span>
        <span className="font-mono">{fmtUnitValue(p.margin_sol, unit, solUsd)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Leverage</span>
        <span className="font-mono">{p.leverage}x</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Current value</span>
        <span className="font-mono">
          {curVal != null ? fmtUnitValue(curVal, unit, solUsd) : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Liq</span>
        <span className="font-mono text-danger">
          {p.liq_market_cap != null ? `${fmtMarketCap(p.liq_market_cap)} MC` : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Distance to Liq</span>
        <span
          className={cn(
            "font-mono",
            dist != null && dist < 10 ? "text-danger" : "text-foreground",
          )}
        >
          {dist != null ? `${dist.toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Unrealized P&L</span>
        <span className={cn("font-mono", pnlColor(p.unrealizedPnlSol ?? 0))}>
          {p.unrealizedPnlSol != null
            ? `${fmtUnitPnl(p.unrealizedPnlSol, unit, solUsd)}${
                p.roiOnMargin != null
                  ? ` (${fmtPercent(p.roiOnMargin * 100)})`
                  : ""
              }`
            : "—"}
        </span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={() => onClose(p)}
          data-testid="button-guest-leverage-close"
          className="mt-1 flex h-9 w-full items-center justify-center rounded-xl border border-danger/40 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
        >
          Close position
        </button>
      )}
    </div>
  );
}

function TradePanel({
  info,
  appliedAmount,
  planned,
  onClearPlanned,
  attachments,
  onAttachmentsConsumed,
  unit,
  onUnitChange,
  onCreateBuyLimit,
}: {
  info: TokenInfo;
  appliedAmount?: { amount: string; nonce: number } | null;
  planned?: PlannedTrade | null;
  onClearPlanned?: () => void;
  /** Exit orders (TP/SL) to create after the next successful buy. */
  attachments?: PlannedAttachments | null;
  onAttachmentsConsumed?: () => void;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  /** Create a buy-limit entry order immediately (reuses the page helper). */
  onCreateBuyLimit?: (p: { triggerMc: number; solAmount: number }) => void;
}) {
  const { wallet, account, isGuest, loading: accountLoading, refresh } =
    useAccount();
  const { toast } = useToast();
  const qc = useQueryClient();
  const flags = useFeatureFlags();
  const { login } = useXAuth();
  const { showXAuthNudge, isGuestDemo } = usePaperTradingAccess();
  const [tradeMode, setTradeMode] = useState<"spot" | "leverage">("spot");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [solAmount, setSolAmount] = useState("");

  // Funnel: a guest viewing a token's trading panel is the discovery → intent
  // step. First-touch per device (the beacon dedupes). Guest-scoped so the
  // funnel measures the guest journey, not registered-user activity.
  useEffect(() => {
    if (isGuest && info?.mint) trackTokenView(getGuestState().anon_id);
  }, [isGuest, info?.mint]);

  // Authoritative SOL/USD rate. `solUsd` is the best-effort display value;
  // `rate` is the trusted value used to size/validate orders; `rateReady` gates
  // submission so a USD order is never sized against a stale per-token quote that
  // has collapsed toward ~1 (the cash-balance desync bug). The Amount field holds
  // a raw value interpreted in `unit`; everything that talks to the trade API is
  // converted to SOL via `toSol` so the existing SOL execution contract is intact.
  const { solUsd, rate, rateReady } = useTradeRate(info);
  const usdUnavailable = unit === "USD" && !rateReady;
  const toSol = (raw: string | number): number => {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    if (unit === "SOL") return n;
    return rate != null && rate > 0 ? n / rate : NaN;
  };

  // Keep the cash balance fresh whenever the trader opens a new token or toggles
  // between spot and leverage - both are moments where a stale balance would
  // mislead the pre-trade UI (the desync bug surfaced exactly here).
  useEffect(() => {
    if (!isGuest) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.mint, tradeMode, isGuest]);

  // When the Mini Planner applies a plan, switch to Buy and pre-fill the amount.
  // Keyed on `nonce` so re-applying the same value still re-fills the field.
  const appliedNonce = appliedAmount?.nonce;
  useEffect(() => {
    if (appliedAmount && appliedAmount.amount) {
      setSide("buy");
      setSolAmount(appliedAmount.amount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedNonce]);
  const [sellPercent, setSellPercent] = useState(100);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savePromptOpen, setSavePromptOpen] = useState(false);

  // Automated orders set directly in the buy box without the planner:
  // a buy-limit entry plus a TP ladder + single SL exit.
  const [quickBl, setQuickBl] = useState<QuickBuyLimit>(QUICK_BUY_LIMIT_DEFAULT);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpRungs, setTpRungs] = useState<TpRung[]>(TP_LADDER_DEFAULT);
  const [quickSl, setQuickSl] = useState<QuickOrder>(QUICK_ORDER_DEFAULT);
  const [exitOrdersOpen, setExitOrdersOpen] = useState(false);
  // Paper-trading rules collapsed into an info panel (UX pass item 7).
  const [rulesOpen, setRulesOpen] = useState(false);

  const resetQuickExits = () => {
    setTpEnabled(false);
    setTpRungs(TP_LADDER_DEFAULT);
    setQuickSl(QUICK_ORDER_DEFAULT);
  };

  // Reset automated orders whenever the token changes.
  useEffect(() => {
    setQuickBl(QUICK_BUY_LIMIT_DEFAULT);
    setTpEnabled(false);
    setTpRungs(TP_LADDER_DEFAULT);
    setQuickSl(QUICK_ORDER_DEFAULT);
    setExitOrdersOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.mint]);

  // If the leverage feature flag is off (or turned off), never leave the panel
  // stuck in leverage mode - fall back to the spot experience.
  useEffect(() => {
    if (!flags.leverage && !isGuestDemo && tradeMode === "leverage")
      setTradeMode("spot");
  }, [flags.leverage, isGuestDemo, tradeMode]);

  // Create a buy-limit entry order immediately from the Automated Orders
  // section. Spends the current buy-box Amount (converted to SOL) and delegates
  // creation to the existing page-level helper - no new order logic here.
  function handleSetBuyLimit() {
    const mc = parseAbbreviatedNumber(quickBl.mcValue);
    const spend = toSol(solAmount);
    if (
      !flags.buy_limits ||
      !onCreateBuyLimit ||
      mc == null ||
      mc <= 0 ||
      !(Number.isFinite(spend) && spend >= 0.1)
    ) {
      return;
    }
    onCreateBuyLimit({ triggerMc: mc, solAmount: spend });
    setQuickBl(QUICK_BUY_LIMIT_DEFAULT);
  }

  const guestState = useGuestStore();
  const guestValued = useGuestValuedPositions();

  const { data: posData } = useQuery({
    queryKey: ["positions", wallet],
    queryFn: () => api.positions(wallet!),
    enabled: !!wallet,
    refetchInterval: LIVE_MS.positions,
  });
  const position = isGuest
    ? guestValued.positions.find((p) => p.token_mint === info.mint)
    : posData?.positions.find((p) => p.token_mint === info.mint);

  // Leverage position for this token. Signed-in positions come from the server
  // (read-only here - the token-page Leverage box owns liquidation/TP/SL
  // toasts). Guest demo positions (public paper trading) come from the local
  // guest engine so a reviewer can open, watch and close a perps position
  // without an X sign-in.
  const { data: levData } = useQuery({
    queryKey: ["leverage-positions", wallet],
    queryFn: () => api.leverage.positions(wallet!),
    enabled: !!wallet && !isGuest && flags.leverage,
    refetchInterval: LIVE_MS.leverage,
  });
  const guestLev = useGuestValuedLeverage();
  const levPosition = isGuestDemo
    ? guestLev.positions.find((p) => p.token_mint === info.mint)
    : levData?.positions.find((p) => p.token_mint === info.mint);

  function closeGuestLeverage(p: LeveragePosition) {
    const res = guestCloseLeverage(
      p.id,
      p.currentPriceSol,
      p.currentMarketCapUsd,
    );
    if (!res.ok) {
      toast({
        title: "Close failed",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Position closed",
      description:
        res.realizedPnlSol != null
          ? `P&L ${fmtUnitPnl(res.realizedPnlSol, unit, solUsd)}`
          : undefined,
    });
  }

  const cashBalance = isGuest ? guestState.balance : account?.paper_balance;

  // Pre-trade quote: simulated slippage / impact / execution price, debounced.
  const debouncedSol = useDebounced(solAmount, 350);
  const debouncedPct = useDebounced(sellPercent, 350);
  // Quote/validation always run on the SOL-converted amount, never the raw
  // (possibly USD) field value.
  const debouncedSolValue = toSol(debouncedSol);
  const buyValid =
    side === "buy" && Number.isFinite(debouncedSolValue) && debouncedSolValue >= 0.1;
  const sellValid = side === "sell" && !!position;
  const quoteEnabled = buyValid || sellValid;

  // Guests have no server position, so a sell quote must be priced by an
  // explicit token amount (derived from the local position) rather than a
  // percent the server would resolve against the database.
  const sellTokenAmount =
    position != null ? position.total_tokens * (debouncedPct / 100) : 0;

  const { data: quote, isFetching: quoteFetching } = useQuery<TradeQuote>({
    queryKey: [
      "quote",
      info.mint,
      side,
      side === "buy" ? debouncedSolValue : debouncedPct,
      wallet,
      isGuest ? sellTokenAmount : null,
    ],
    queryFn: () =>
      api.quote(
        side === "buy"
          ? { wallet, mint: info.mint, side: "buy", solAmount: debouncedSolValue }
          : isGuest
            ? { mint: info.mint, side: "sell", tokenAmount: sellTokenAmount }
            : { wallet, mint: info.mint, side: "sell", percent: debouncedPct },
      ),
    enabled: quoteEnabled,
    refetchInterval: LIVE_MS.quote,
  });

  // Reset any pending confirmation whenever the order parameters change.
  useEffect(() => {
    setConfirmOpen(false);
  }, [side, solAmount, sellPercent, unit, info.mint]);

  // Create a batch of automated orders (TP rungs / SL) against this token. Each
  // spec targets a market-cap trigger; failures are surfaced but never block the
  // surrounding flow (a buy, or an immediate "create exits" on the Sell tab).
  async function placeOrderSpecs(
    specs: { orderType: OrderType; triggerValue: number; percent: number }[],
  ) {
    if (specs.length === 0) return;

    let created = 0;
    const failures: string[] = [];
    for (const s of specs) {
      try {
        if (isGuest) {
          const r = guestCreateOrder({
            mint: info.mint,
            symbol: info.symbol,
            name: info.name,
            orderType: s.orderType,
            triggerType: "market_cap",
            triggerValue: s.triggerValue,
            amountPercent: s.percent,
          });
          if (r.ok) created++;
          else if (r.error) failures.push(r.error);
        } else {
          const r = await api.createOrder({
            wallet: wallet!,
            mint: info.mint,
            symbol: info.symbol,
            name: info.name,
            orderType: s.orderType,
            triggerType: "market_cap",
            triggerValue: s.triggerValue,
            amountPercent: s.percent,
          });
          if (r.ok) created++;
          else if (r.error) failures.push(r.error);
        }
      } catch (e) {
        failures.push(e instanceof Error ? e.message : "Failed to create order");
      }
    }

    if (created > 0) {
      toast({
        title: `${created} exit order${created > 1 ? "s" : ""} attached`,
        description: "Take Profit / Stop Loss will fill automatically.",
      });
      if (!isGuest) qc.invalidateQueries({ queryKey: ["orders"] });
    }
    if (failures.length > 0) {
      toast({
        title: "Some exit orders weren't created",
        description: failures[0],
        variant: "destructive",
      });
    }
  }

  // Build the TP-ladder + SL specs currently set in the Automated Orders panel.
  function buildQuickExitSpecs() {
    const specs: {
      orderType: OrderType;
      triggerValue: number;
      percent: number;
    }[] = [];
    if (tpEnabled && flags.tp_sl) {
      const rungs = flags.multi_target_tp ? tpRungs : tpRungs.slice(0, 1);
      for (const r of rungs) {
        const mc = parseAbbreviatedNumber(r.mcValue);
        if (mc != null && mc > 0 && r.percent > 0) {
          specs.push({ orderType: "take_profit", triggerValue: mc, percent: r.percent });
        }
      }
    }
    if (quickSl.enabled && flags.tp_sl) {
      const mc = parseAbbreviatedNumber(quickSl.mcValue);
      if (mc != null && mc > 0) {
        specs.push({ orderType: "stop_loss", triggerValue: mc, percent: 100 });
      }
    }
    return specs;
  }

  const quickExitSpecs = buildQuickExitSpecs();

  // Sell tab: create the configured exit orders immediately against the held
  // position (spec #4 - automated orders are available after you already own a
  // position, not only when buying).
  async function handleCreateExitsNow() {
    if (!position) return;
    const specs = buildQuickExitSpecs();
    if (specs.length === 0) return;
    await placeOrderSpecs(specs);
    resetQuickExits();
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // Convert the (possibly USD) field value to the SOL amount the trade API
      // expects. The button is disabled when this is invalid, but guard anyway.
      const execSol = toSol(solAmount);
      if (side === "buy" && !(Number.isFinite(execSol) && execSol > 0)) {
        return { ok: false, error: "Enter a valid amount." };
      }
      if (isGuest) {
        // Whether this is the guest's first-ever trade, captured before the
        // bookkeeping call sets first_trade_at, so we can fire the funnel beacon.
        const before = getGuestState();
        const wasFirstTrade = before.first_trade_at == null;
        const anonId = before.anon_id;
        // Re-quote fresh at execution time (mirrors the server recomputing the
        // fill at execute), then apply local bookkeeping.
        if (side === "buy") {
          const q = await api.quote({
            mint: info.mint,
            side: "buy",
            solAmount: execSol,
          });
          const result = guestBuy({
            mint: info.mint,
            name: info.name,
            symbol: info.symbol,
            logo: info.logo,
            solAmount: execSol,
            quote: q,
            marketCapUsd: info.marketCapUsd,
          });
          if (result.ok) {
            if (wasFirstTrade) trackGuestFirstTrade(anonId);
            else trackGuestSecondTrade(anonId);
          }
          return result;
        }
        const pos = guestValued.positions.find(
          (p) => p.token_mint === info.mint,
        );
        if (!pos) return { ok: false, error: "No open position for this token" };
        const tokenAmount = pos.total_tokens * (sellPercent / 100);
        const q = await api.quote({
          mint: info.mint,
          side: "sell",
          tokenAmount,
        });
        const result = guestSell({ mint: info.mint, tokenAmount, quote: q });
        if (result.ok) {
          if (wasFirstTrade) trackGuestFirstTrade(anonId);
          else trackGuestSecondTrade(anonId);
        }
        return result;
      }
      // Refetch the balance immediately before submitting so the pre-submit UI
      // reflects the freshest cash balance. The server re-reads paper_balance FOR
      // UPDATE and re-derives the SOL amount from usdAmount, so this is UI-only.
      await refresh();
      return api.execute(
        side === "buy"
          ? {
              wallet,
              mint: info.mint,
              side: "buy",
              solAmount: execSol,
              // In USD mode, send the raw USD so the server sizes the buy from its
              // own authoritative SOL price (client rate is never trusted).
              usdAmount: unit === "USD" ? Number(solAmount) : undefined,
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
      );
    },
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
      // Create exit orders after a successful buy. Combines planner attachments
      // with any quick exit orders set directly in the buy box. For each order
      // type the planner takes priority when enabled; otherwise the quick TP
      // ladder / SL is used.
      if (t.side === "buy") {
        const specs: {
          orderType: OrderType;
          triggerValue: number;
          percent: number;
        }[] = [];

        if (flags.tp_sl && attachments?.tp.enabled && attachments.tp.triggerMc != null) {
          specs.push({
            orderType: "take_profit",
            triggerValue: attachments.tp.triggerMc,
            percent: attachments.tp.percent,
          });
        } else if (flags.tp_sl && tpEnabled) {
          const rungs = flags.multi_target_tp ? tpRungs : tpRungs.slice(0, 1);
          for (const r of rungs) {
            const mc = parseAbbreviatedNumber(r.mcValue);
            if (mc != null && mc > 0 && r.percent > 0) {
              specs.push({
                orderType: "take_profit",
                triggerValue: mc,
                percent: r.percent,
              });
            }
          }
        }

        if (flags.tp_sl && attachments?.sl.enabled && attachments.sl.triggerMc != null) {
          specs.push({
            orderType: "stop_loss",
            triggerValue: attachments.sl.triggerMc,
            percent: attachments.sl.percent,
          });
        } else if (flags.tp_sl && quickSl.enabled) {
          const mc = parseAbbreviatedNumber(quickSl.mcValue);
          if (mc != null && mc > 0) {
            specs.push({
              orderType: "stop_loss",
              triggerValue: mc,
              percent: 100,
            });
          }
        }

        if (specs.length > 0) void placeOrderSpecs(specs);
        if (attachments) onAttachmentsConsumed?.();
        resetQuickExits();
      }
      if (isGuest) {
        setSavePromptOpen(true);
      } else {
        qc.invalidateQueries({ queryKey: ["positions"] });
        qc.invalidateQueries({ queryKey: ["pf"] });
        qc.invalidateQueries({ queryKey: ["pf-stats"] });
        qc.invalidateQueries({ queryKey: ["account"] });
        qc.invalidateQueries({ queryKey: ["history"] });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Trade failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="rounded-xl bg-card shadow-card overflow-hidden">
      {showXAuthNudge && (
        <div
          data-testid="banner-guest-trade"
          className="border-b border-accent/30 bg-accent/10 px-4 py-3"
        >
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">
            <Info className="w-3.5 h-3.5" />
            Connect X
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Connect X to save your trades, build a public track record, and
            compete on the leaderboards.
          </p>
        </div>
      )}

      {showXAuthNudge && savePromptOpen && (
        <div
          data-testid="prompt-save-guest"
          className="border-b border-accent/30 bg-accent/10 px-4 py-3"
        >
          <p className="text-xs text-foreground mb-2.5">
            Want to save this portfolio? Connect X to keep your trades, build
            your profile, and compete on the leaderboard.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="button-prompt-connect"
              onClick={() => {
                setSavePromptOpen(false);
                login();
              }}
              className="flex-1 h-9 rounded-full bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/90 transition-colors"
            >
              Connect X
            </button>
            <button
              type="button"
              data-testid="button-prompt-keep-testing"
              onClick={() => setSavePromptOpen(false)}
              className="flex-1 h-9 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              Keep Testing
            </button>
          </div>
        </div>
      )}

      {(flags.leverage || isGuestDemo) && (
        <div className="p-3 pb-0">
          <div
            role="tablist"
            aria-label="Trade mode"
            className="flex border border-border rounded-md p-0.5"
          >
            {(["spot", "leverage"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={tradeMode === m}
                onClick={() => setTradeMode(m)}
                data-testid={`button-mode-${m}`}
                className={cn(
                  "flex-1 py-2 rounded-md text-xs font-medium uppercase tracking-wider transition-colors",
                  tradeMode === m
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "spot" ? "Spot" : "Perps"}
              </button>
            ))}
          </div>
        </div>
      )}

      {tradeMode === "leverage" ? (
        <>
          <LeveragePanel info={info} />
          {isGuestDemo && levPosition && (
            <div className="px-4 pb-4 text-xs">
              <LeverageSummary
                p={levPosition}
                unit={unit}
                solUsd={solUsd}
                onClose={closeGuestLeverage}
              />
            </div>
          )}
        </>
      ) : (
        <>
      <div className="px-4 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          <button
            onClick={() => setSide("buy")}
            data-testid="button-side-buy"
            className={cn(
              "rounded-lg py-2.5 text-sm font-semibold transition-all",
              side === "buy"
                ? "bg-success/15 text-success shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Buy
          </button>
          <button
            onClick={() => setSide("sell")}
            data-testid="button-side-sell"
            className={cn(
              "rounded-lg py-2.5 text-sm font-semibold transition-all",
              side === "sell"
                ? "bg-danger/15 text-danger shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Sell
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Cash balance</span>
          <span className="font-mono text-foreground">
            {fmtUnitValue(cashBalance ?? 0, unit, solUsd)}
          </span>
        </div>
        {unit === "USD" && (solUsd == null || solUsd <= 0) && (
          <p className="text-[11px] text-muted-foreground">
            USD value unavailable until SOL price loads.
          </p>
        )}

        {planned && onClearPlanned && (
          <PlannedTradeSummary planned={planned} onClear={onClearPlanned} />
        )}

        {side === "buy" ? (
          <>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground">
                  Amount ({unit})
                </label>
                <div
                  role="tablist"
                  aria-label="Amount unit"
                  className="inline-flex border border-border rounded-md p-0.5"
                >
                  {(["SOL", "USD"] as Unit[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      role="tab"
                      aria-selected={unit === u}
                      onClick={() => onUnitChange(u)}
                      data-testid={`toggle-amount-${u}`}
                      className={cn(
                        "px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors",
                        unit === u
                          ? "bg-accent/15 text-accent"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                placeholder={unit === "SOL" ? "0.0" : "0"}
                min={unit === "SOL" ? 0.1 : 1}
                step={unit === "SOL" ? 0.1 : 1}
                data-testid="input-buy-amount"
                className="w-full h-11 rounded-2xl bg-background border border-border px-3 font-mono text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(unit === "SOL" ? BUY_PRESETS : USD_BUY_PRESETS).map((p) => (
                <button
                  key={p}
                  onClick={() => setSolAmount(String(p))}
                  data-testid={`preset-buy-${p}`}
                  className="rounded-xl py-2 text-xs border border-border hover:border-accent hover:text-accent transition-colors font-mono"
                >
                  {unit === "USD" ? `$${p}` : p}
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
                  className="rounded-xl py-2 text-xs border border-border hover:border-accent hover:text-accent transition-colors font-mono"
                >
                  {p}%
                </button>
              ))}
            </div>
          </>
        )}

        {/* Automated orders - available on both Buy and Sell tabs. On Buy they
            attach after the next fill; on Sell they're created immediately
            against the held position. Buy Limit is buy-only. */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setExitOrdersOpen((o) => !o)}
            data-testid="button-quick-exit-orders-toggle"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5">
              Automated Orders
              {(quickBl.enabled || tpEnabled || quickSl.enabled) && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                exitOrdersOpen && "rotate-180",
              )}
            />
          </button>
          {exitOrdersOpen && (
            <div className="border-t border-border/60 px-3 py-2.5 space-y-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Orders that run automatically when the market cap hits your
                level.{" "}
                {side === "buy" && (
                  <>
                    <span className="text-accent">Buy Limit</span> enters a
                    position,{" "}
                  </>
                )}
                <span className="text-success">Take Profit</span> locks in
                gains, and{" "}
                <span className="text-danger">Stop Loss</span> limits losses.
              </p>
              {side === "buy" && flags.buy_limits && (
                <BuyLimitRow
                  enabled={quickBl.enabled}
                  mcValue={quickBl.mcValue}
                  solAmount={toSol(solAmount)}
                  canCreate={onCreateBuyLimit != null}
                  onChange={setQuickBl}
                  onCreate={handleSetBuyLimit}
                />
              )}
              {flags.tp_sl && (
                <>
                  <TpLadder
                    enabled={tpEnabled}
                    rungs={tpRungs}
                    onToggle={setTpEnabled}
                    onChange={setTpRungs}
                    allowMultiTarget={flags.multi_target_tp}
                  />
                  <QuickOrderToggle
                    label="Stop Loss"
                    tone="loss"
                    helpText="Sells your whole position when the market cap falls to or below your level, capping losses."
                    enabled={quickSl.enabled}
                    mcValue={quickSl.mcValue}
                    onChange={setQuickSl}
                  />
                </>
              )}
              {side === "buy" ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Take Profit / Stop Loss are created automatically after your
                    next Buy fills.
                  </p>
                  {position && (
                    <>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Already holding {info.symbol ?? "this token"}? Apply these
                        to your open position now - no new buy needed.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleCreateExitsNow()}
                        disabled={quickExitSpecs.length === 0}
                        data-testid="button-create-exits-now-buy"
                        className="h-9 w-full rounded-xl bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Create Orders Now
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {position
                      ? "Create these orders now against your open position."
                      : "Open a position in this token to create exit orders."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCreateExitsNow()}
                    disabled={!position || quickExitSpecs.length === 0}
                    data-testid="button-create-exits-now"
                    className="h-9 w-full rounded-xl bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Create Orders
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <TradeEstimate
          quote={quote}
          loading={quoteFetching && quoteEnabled}
          show={quoteEnabled}
          side={side}
          symbol={info.symbol}
        />

        {side === "buy" && toSol(solAmount) > 0 && (() => {
          const tpTargets = tpEnabled && flags.tp_sl
            ? (flags.multi_target_tp ? tpRungs : tpRungs.slice(0, 1))
                .map((r) => ({
                  mc: parseAbbreviatedNumber(r.mcValue),
                  percent: r.percent,
                }))
                .filter((t) => t.mc != null && t.mc > 0 && t.percent > 0)
            : [];
          const slMc = quickSl.enabled && flags.tp_sl
            ? parseAbbreviatedNumber(quickSl.mcValue)
            : null;
          return (
            <div
              data-testid="trade-summary"
              className="rounded-xl border border-border bg-background/40 p-3 space-y-1.5 text-xs"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Trade Summary
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Buy</span>
                <span className="font-mono text-foreground">
                  {unit === "USD" ? `$${solAmount}` : `${solAmount} SOL`}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Receive</span>
                <span className="font-mono text-foreground">
                  {quote?.ok
                    ? `${fmtTokenAmount(quote.estimatedTokens)} ${info.symbol ?? ""}`.trim()
                    : "—"}
                </span>
              </div>
              {tpTargets.map((t, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    Take Profit {tpTargets.length > 1 ? i + 1 : ""}
                  </span>
                  <span className="font-mono text-success">
                    Sell {t.percent}% of remaining @ MC {fmtMarketCap(t.mc!)}
                  </span>
                </div>
              ))}
              {slMc != null && slMc > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Stop Loss</span>
                  <span className="font-mono text-danger">
                    Sell 100% of remaining @ MC {fmtMarketCap(slMc)}
                  </span>
                </div>
              )}
              {planned?.riskReward != null && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Risk / Reward</span>
                  <span className="font-mono text-foreground">
                    1 : {planned.riskReward.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          );
        })()}

        {confirmOpen && quote?.ok ? (
          <div
            className={cn(
              "rounded-xl border p-3 space-y-3",
              quote.warningLevel === "extreme"
                ? "border-red-500/50 bg-danger/10"
                : "border-amber-500/50 bg-warning/10",
            )}
            data-testid="trade-confirm"
          >
            <div className="flex items-start gap-2 text-xs">
              <AlertTriangle
                className={cn(
                  "w-4 h-4 shrink-0 mt-0.5",
                  quote.warningLevel === "extreme" ? "text-danger" : "text-warning",
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
                  ? "That's a very large fill - expect a poor execution price."
                  : "Consider a smaller size for a better fill."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                data-testid="button-cancel-trade"
                className="h-10 rounded-xl text-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                data-testid="button-confirm-trade"
                className={cn(
                  "h-10 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-40",
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
              (side === "buy" && usdUnavailable) ||
              (side === "buy" && !(toSol(solAmount) >= 0.1)) ||
              (!isGuest && (accountLoading || !account)) ||
              (side === "sell" && !position) ||
              (quoteEnabled && quote?.ok === false)
            }
            data-testid="button-execute-trade"
            className={cn(
              "w-full h-12 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-card disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none",
              side === "buy"
                ? "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[.99]"
                : "bg-red-500 text-white hover:bg-red-400 active:scale-[.99]",
            )}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {quote?.blocked
              ? "Trade too large"
              : `${side === "buy" ? "Buy" : "Sell"} ${info.symbol ?? "Token"}`}
          </button>
        )}

        {side === "buy" && usdUnavailable && (
          <p
            data-testid="usd-unavailable-note"
            className="flex items-start gap-1.5 text-[11px] leading-relaxed text-danger"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            USD mode unavailable until SOL price loads.
          </p>
        )}

        <div className="rounded-xl border border-border/60 bg-background/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setRulesOpen((o) => !o)}
            aria-expanded={rulesOpen}
            data-testid="button-paper-rules-toggle"
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary/40"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Paper Trading Rules
            </span>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0",
                rulesOpen && "rotate-180",
              )}
            />
          </button>
          {rulesOpen && (
            <p
              data-testid="paper-rules-body"
              className="border-t border-border/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
            >
              BlackPebble simulates slippage from each token's available
              liquidity, so larger orders fill at a worse price - just like a
              real swap. Trades above 20% of liquidity, or that would leave you
              holding more than 4% of a token's supply, are blocked.
            </p>
          )}
        </div>

        {(position || levPosition) && (
          <div className="pt-3 border-t border-border text-xs space-y-3">
            {position && (
              <div className="space-y-1.5" data-testid="summary-spot">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Spot Position
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Holdings</span>
                  <span className="font-mono text-foreground">
                    {`${fmtTokenAmount(position.total_tokens)} ${info.symbol ?? ""}`.trim()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Position value</span>
                  <span className="font-mono">
                    {fmtUnitValue(position.currentValueSol, unit, solUsd)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unrealized P&L</span>
                  <span
                    className={cn("font-mono", pnlColor(position.unrealizedPnlSol))}
                  >
                    {fmtUnitPnl(position.unrealizedPnlSol, unit, solUsd)} (
                    {fmtPercent(position.unrealizedPnlPercent)})
                  </span>
                </div>
              </div>
            )}
            {levPosition && (
              <LeverageSummary
                p={levPosition}
                unit={unit}
                solUsd={solUsd}
                onClose={isGuestDemo ? closeGuestLeverage : undefined}
              />
            )}
            {unit === "USD" && (solUsd == null || solUsd <= 0) && (
              <p className="text-[11px] text-muted-foreground">
                USD display requires SOL price.
              </p>
            )}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

function WatchButton({ info }: { info: TokenInfo }) {
  const { wallet, isGuest } = useAccount();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["watchlist", wallet],
    queryFn: () => api.watchlist(wallet!),
    enabled: !!wallet,
  });
  const guest = useGuestStore();
  const watched = isGuest
    ? guest.watchlist.some((w) => w.mint === info.mint)
    : data?.watchlist.some((w) => w.mint === info.mint);

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

  const toggle = () => {
    if (isGuest) {
      if (watched) guestWatchRemove(info.mint);
      else
        guestWatchAdd({
          mint: info.mint,
          name: info.name,
          symbol: info.symbol,
          logo: info.logo,
        });
      return;
    }
    mutation.mutate();
  };

  return (
    <button
      onClick={toggle}
      data-testid="button-watchlist-toggle"
      className={cn(
        "flex items-center gap-2 px-4 h-10 rounded-full text-xs font-medium transition-all",
        watched
          ? "bg-accent/15 text-accent"
          : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary",
      )}
    >
      <Star className={cn("w-4 h-4", watched && "fill-accent")} />
      {watched ? "Watching" : "Watch"}
    </button>
  );
}

/**
 * "Call Token" action - lets an X-authenticated trader put a token call on the
 * record. Price and market cap are snapshotted server-side at creation time; the
 * trader only supplies an optional thesis + conviction. Guests are prompted to
 * connect X. Calls are immutable (no edit/delete) by design.
 */
function CallTokenButton({ info }: { info: TokenInfo }) {
  const { loggedIn, login, user: xUser } = useXAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [thesis, setThesis] = useState("");
  const [conviction, setConviction] = useState<Conviction | "">("");

  const { data: myCallouts } = useQuery({
    queryKey: ["myCallouts", xUser?.x_username],
    queryFn: () => api.callouts.list(xUser!.x_username),
    enabled: loggedIn && !!xUser?.x_username,
  });
  const hasCalled = myCallouts?.callouts.some(
    (c) => c.token_mint === info.mint,
  ) ?? false;

  const mutation = useMutation({
    mutationFn: () =>
      api.callouts.create({
        tokenMint: info.mint,
        thesis: thesis.trim(),
        conviction: conviction || null,
      }),
    onSuccess: () => {
      setOpen(false);
      setThesis("");
      setConviction("");
      qc.invalidateQueries({ queryKey: ["callouts"] });
      qc.invalidateQueries({ queryKey: ["myCallouts"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["leaderboard", "callers"] });
      toast({
        title: "Call recorded",
        description: "It's now on the record - permanent and immutable.",
      });
    },
    onError: (e) =>
      toast({
        title: "Couldn't record call",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const handleClick = () => {
    if (!loggedIn) {
      login();
      return;
    }
    setOpen(true);
  };

  const canSubmit = !mutation.isPending;

  return (
    <>
      <button
        onClick={handleClick}
        data-testid="button-call-token"
        className={cn(
          "flex items-center gap-2 px-4 h-10 rounded-full text-xs font-medium transition-all",
          hasCalled
            ? "bg-accent/15 text-accent hover:bg-accent/25"
            : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary",
        )}
      >
        <Megaphone className={cn("w-4 h-4", hasCalled && "text-accent")} />
        {hasCalled ? "Called" : "Call"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
          data-testid="modal-call-token"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card shadow-card p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-accent" />
                <span className="font-semibold text-foreground">
                  Call {info.symbol ?? "token"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-call-token"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-secondary/30 border border-border px-3 py-2.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Called at</span>
              <span className="font-mono text-foreground">
                {fmtMarketCap(info.marketCapUsd)} MC ·{" "}
                {fmtPrice(info.priceUsd)}
              </span>
            </div>

            <textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              maxLength={CALLOUT_THESIS_MAX}
              rows={3}
              placeholder="Your thesis - why this call? (optional)"
              data-testid="input-call-token-thesis"
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors resize-none"
            />

            <div className="flex items-center justify-between gap-2">
              <select
                value={conviction}
                onChange={(e) =>
                  setConviction(e.target.value as Conviction | "")
                }
                data-testid="select-call-token-conviction"
                className="h-9 bg-secondary/40 border border-border rounded-lg px-2 text-sm text-foreground focus:outline-none focus:border-accent"
              >
                <option value="">Conviction…</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <span className="text-[11px] text-muted-foreground font-mono">
                {thesis.length}/{CALLOUT_THESIS_MAX}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Lock className="w-3 h-3 flex-shrink-0" />
              Calls are permanent - no edits or deletes once recorded.
            </div>

            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!canSubmit}
              data-testid="button-publish-call"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Megaphone className="w-4 h-4" />
              )}
              Publish Call
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const SENTIMENT_OPTIONS: {
  value: Sentiment;
  label: string;
  icon: typeof TrendingUp;
  active: string;
}[] = [
  {
    value: "bullish",
    label: "Bullish",
    icon: TrendingUp,
    active: "bg-success/15 text-success border-success/40",
  },
  {
    value: "bearish",
    label: "Bearish",
    icon: TrendingDown,
    active: "bg-destructive/15 text-destructive border-destructive/40",
  },
  {
    value: "neutral",
    label: "Neutral",
    icon: Minus,
    active: "bg-muted/40 text-foreground border-border",
  },
];

/**
 * "Thesis" action - publishes a standalone piece of token research. A thesis is
 * NOT a price call: it is never graded and has no effect on caller ranking,
 * multiples, hit rate, or call history. Unlike calls, theses are editable and
 * deletable by their author. Requires title, sentiment and content; conviction
 * is optional. X-auth required (guests are prompted to connect).
 */
function ThesisButton({ info }: { info: TokenInfo }) {
  const { loggedIn, login } = useXAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sentiment, setSentiment] = useState<Sentiment | "">("");
  const [conviction, setConviction] = useState<Conviction | "">("");

  const mutation = useMutation({
    mutationFn: () =>
      api.theses.create({
        tokenMint: info.mint,
        title: title.trim(),
        content: content.trim(),
        sentiment: sentiment as Sentiment,
        conviction: conviction || null,
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setContent("");
      setSentiment("");
      setConviction("");
      qc.invalidateQueries({ queryKey: ["theses"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["tokenIntel"] });
      toast({
        title: "Thesis published",
        description: "Shared as research - it won't affect your caller stats.",
      });
    },
    onError: (e) =>
      toast({
        title: "Couldn't publish thesis",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const handleClick = () => {
    if (!loggedIn) {
      login();
      return;
    }
    setOpen(true);
  };

  const canSubmit =
    !!title.trim() && !!content.trim() && !!sentiment && !mutation.isPending;

  return (
    <>
      <button
        onClick={handleClick}
        data-testid="button-thesis"
        className="flex items-center gap-2 px-4 h-10 rounded-full text-xs font-medium bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
      >
        <ScrollText className="w-4 h-4" />
        Thesis
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
          data-testid="modal-thesis"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card shadow-card p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-accent" />
                <span className="font-semibold text-foreground">
                  Thesis on {info.symbol ?? "token"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-thesis"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              A thesis is research, not a price call. It's never graded and won't
              affect your caller ranking, multiples or hit rate.
            </p>

            <div className="space-y-1">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={THESIS_TITLE_MAX}
                placeholder="Title - the headline of your thesis"
                data-testid="input-thesis-title"
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
              />
              <div className="text-right text-[11px] text-muted-foreground font-mono">
                {title.length}/{THESIS_TITLE_MAX}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {SENTIMENT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = sentiment === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSentiment(opt.value)}
                    data-testid={`button-sentiment-${opt.value}`}
                    className={cn(
                      "flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-medium transition-all",
                      isActive
                        ? opt.active
                        : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={THESIS_CONTENT_MAX}
                rows={5}
                placeholder="Your thesis - the full reasoning, catalysts, risks…"
                data-testid="input-thesis-content"
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors resize-none"
              />
              <div className="flex items-center justify-between">
                <select
                  value={conviction}
                  onChange={(e) =>
                    setConviction(e.target.value as Conviction | "")
                  }
                  data-testid="select-thesis-conviction"
                  className="h-9 bg-secondary/40 border border-border rounded-lg px-2 text-sm text-foreground focus:outline-none focus:border-accent"
                >
                  <option value="">Conviction…</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {content.length}/{THESIS_CONTENT_MAX}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!canSubmit}
              data-testid="button-publish-thesis"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ScrollText className="w-4 h-4" />
              )}
              Publish Thesis
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Copy-to-clipboard chip for the token contract address. Gives the address an
 * intentional, premium presentation in the action row (UX polish) - purely a
 * convenience control, no trading behaviour.
 */
function CopyContract({ mint }: { mint: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    try {
      void navigator.clipboard?.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      data-testid="button-copy-contract"
      title="Copy contract address"
      className="flex items-center gap-2 px-4 h-10 rounded-full bg-secondary/60 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
    >
      {copied ? (
        <Check className="w-4 h-4 text-accent" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
      {copied ? "Copied" : shortAddr(mint, 4)}
    </button>
  );
}

function ActivityTabs() {
  const { wallet, isGuest } = useAccount();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"positions" | "history">("positions");

  const { data: posData } = useQuery({
    queryKey: ["positions", wallet],
    queryFn: () => api.positions(wallet!),
    enabled: !!wallet,
    refetchInterval: LIVE_MS.positions,
  });
  const { data: histData } = useQuery({
    queryKey: ["history", wallet],
    queryFn: () => api.history(wallet!),
    enabled: !!wallet && tab === "history",
  });

  const guestValued = useGuestValuedPositions();
  const guestState = useGuestStore();

  const positions = isGuest ? guestValued.positions : posData?.positions ?? [];
  const solUsd = isGuest ? guestValued.solUsd : posData?.solUsd ?? 0;
  const trades = isGuest ? guestHistory(guestState) : histData?.trades ?? [];

  const tabs = [
    { id: "positions" as const, label: "Positions" },
    { id: "history" as const, label: "History" },
  ];

  return (
    <div className="rounded-xl bg-card shadow-card overflow-hidden">
      <div className="p-3 pb-0">
        <div
          role="tablist"
          aria-label="Activity"
          className="flex border border-border rounded-md p-0.5"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-activity-${t.id}`}
              className={cn(
                "flex-1 py-2 rounded-md text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(tab === "positions" && "p-3 md:p-0")}>
        {tab === "positions" && (
          <OpenPositions
            positions={positions}
            solUsd={solUsd}
            empty="No open positions."
            onNavigate={(mint) => navigate(`/?token=${mint}`)}
          />
        )}
        {tab === "history" && (
          <TradeList
            trades={trades}
            empty="No trade history yet."
            onNavigate={(mint) => navigate(`/?token=${mint}`)}
          />
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
  const { wallet, isGuest } = useAccount();
  const flags = useFeatureFlags();
  const { toast } = useToast();
  const qc = useQueryClient();

  /**
   * Create a buy-limit order immediately from the Trade Planner. Handles both
   * signed-in (server) and guest (localStorage) paths. Fires-and-forgets so the
   * planner Apply button doesn't block on the network; toasts on success/failure.
   */
  async function createBuyLimitOrder(params: {
    mint: string;
    symbol: string | null;
    name: string | null;
    triggerMc: number;
    solAmount: number;
    isGuest: boolean;
    wallet: string | null;
  }) {
    try {
      if (params.isGuest) {
        const r = guestCreateBuyLimitOrder({
          mint: params.mint,
          symbol: params.symbol,
          name: params.name,
          triggerMc: params.triggerMc,
          solAmount: params.solAmount,
        });
        if (r.ok) {
          toast({
            title: "Buy limit set",
            description: `Will auto-buy ${params.solAmount.toFixed(2)} SOL when MC drops to target.`,
          });
        } else {
          toast({ title: "Buy limit failed", description: r.error, variant: "destructive" });
        }
      } else {
        if (!params.wallet) return;
        const r = await api.createBuyLimit({
          wallet: params.wallet,
          mint: params.mint,
          symbol: params.symbol,
          name: params.name,
          triggerMc: params.triggerMc,
          solAmount: params.solAmount,
        });
        if (r.ok) {
          toast({
            title: "Buy limit set",
            description: `Will auto-buy ${params.solAmount.toFixed(2)} SOL when MC drops to target.`,
          });
          qc.invalidateQueries({ queryKey: ["orders"] });
        } else {
          toast({ title: "Buy limit failed", description: r.error, variant: "destructive" });
        }
      }
    } catch (e) {
      toast({
        title: "Buy limit failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  const {
    data: info,
    isLoading,
    isError,
    refetch,
    dataUpdatedAt: tokenUpdatedAt,
  } = useQuery({
    queryKey: ["token", mint, wallet],
    queryFn: () => api.getToken(mint!, wallet ?? undefined),
    enabled: !!mint,
    refetchInterval: LIVE_MS.activeToken,
  });

  const navigate = useNavigate();

  // Shared SOL/USD unit between the Buy/Sell panel and the Mini Planner so the
  // two stay in sync. Persisted for the session.
  const [unit, setUnit] = useState<Unit>(() => {
    // USD is the default trade-size unit app-wide; only an explicit prior SOL
    // choice (this session) overrides it.
    try {
      return sessionStorage.getItem("bp:trade-unit") === "SOL" ? "SOL" : "USD";
    } catch {
      return "USD";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("bp:trade-unit", unit);
    } catch {
      /* ignore (private mode / disabled storage) */
    }
  }, [unit]);

  // Shared bridge between the Mini Planner and the Buy/Sell panel. The planner
  // never executes - it only pushes the amount (bumping `nonce` so repeated
  // applies re-fire) in the active unit and saves the planned target/stop for
  // display.
  const [appliedAmount, setAppliedAmount] = useState<{
    amount: string;
    nonce: number;
  } | null>(null);
  const [planned, setPlanned] = useState<PlannedTrade | null>(null);
  // Exit orders staged by the planner, created after the next successful buy.
  const [pendingAttachments, setPendingAttachments] =
    useState<PlannedAttachments | null>(null);

  // Drop a previously applied plan when switching tokens so a stale target/stop
  // from another market never lingers on the Buy/Sell panel.
  useEffect(() => {
    setPlanned(null);
    setPendingAttachments(null);
  }, [mint]);

  if (!mint) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <LineChart className="w-7 h-7 text-accent" />
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Trading Desk</h1>
        </div>
        <TradingDeskOnboarding />
        <div className="rounded-2xl bg-card shadow-card p-8 text-center">
          <p className="text-muted-foreground mb-4">
            Search for a token above, or browse Markets to find something to
            paper trade.
          </p>
          <button
            onClick={() => navigate("/markets")}
            data-testid="button-browse-markets"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-semibold border border-accent/50 text-accent hover:bg-accent/10 transition-colors"
          >
            Browse Markets
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-7 w-28 ml-auto rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <Skeleton className="h-[360px] w-full rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!info) {
    // Distinguish a transient load failure (offer a retry) from a token that
    // genuinely can't be resolved, so a reviewer never sees a dead-end screen
    // on a flaky network.
    return (
      <div className="flex-1 flex items-center justify-center py-20 px-6">
        <div className="w-full max-w-sm rounded-2xl bg-card shadow-card px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            {isError ? "Couldn't load this token" : "Token not found"}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {isError
              ? "We hit a snag fetching this token's data. Check your connection and try again."
              : "This token isn't available on BlackPebble right now."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {isError && (
              <button
                type="button"
                onClick={() => void refetch()}
                data-testid="button-token-retry"
                className="inline-flex h-9 items-center justify-center rounded-full bg-accent px-4 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90"
              >
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-2"
            >
              Back to Trading Desk
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <TokenHeader info={info} dataUpdatedAt={tokenUpdatedAt} />
        </div>
      </div>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
        {/* Primary actions - flex so buttons size to content, never stretched.
            On desktop this group moves to the RIGHT (lg:order-2); mobile keeps
            its natural DOM order (this group stays first/top on mobile). */}
        <div className="flex flex-wrap items-center gap-2 lg:order-2">
          <WatchButton info={info} />
          <CallTokenButton info={info} />
          <ThesisButton info={info} />
        </div>
        {/* Utility row - more / share / contract address. On desktop this
            group moves to the LEFT (lg:order-1) so More's dropdown opens
            into open space instead of over the trade panel; mobile visual
            order is unaffected by this reorder (this group stays
            second/bottom on mobile, same as before).
            Within the group, desktop-only order is reversed (Copy Contract |
            Share | More) so the More dropdown expands toward the page
            center instead of under the sidebar; mobile DOM order (More,
            Share, Copy Contract) is untouched. */}
        <div className="flex items-center gap-2 flex-wrap lg:order-1">
          <div className="lg:order-3">
            <MoreMenu
              mint={info.mint}
              pairAddress={info.pairAddress}
              isPumpFun={isPumpFunToken(info)}
              symbol={info.symbol}
            />
          </div>
          <div className="lg:order-2">
            <ShareToken info={info} />
          </div>
          <div className="lg:order-1">
            <CopyContract mint={info.mint} />
          </div>
        </div>
      </div>

      {/* Quick Stats strip - sits between action buttons and chart; only shows real data */}
      <QuickStatsStrip info={info} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 space-y-4">
          <PriceChart key={info.mint} info={info} />
        </div>
        <div className="space-y-4">
          <TradePanel
            info={info}
            appliedAmount={appliedAmount}
            planned={planned}
            onClearPlanned={() => setPlanned(null)}
            attachments={pendingAttachments}
            onAttachmentsConsumed={() => setPendingAttachments(null)}
            unit={unit}
            onUnitChange={setUnit}
            onCreateBuyLimit={({ triggerMc, solAmount }) =>
              void createBuyLimitOrder({
                mint: info.mint,
                symbol: info.symbol,
                name: info.name,
                triggerMc,
                solAmount,
                isGuest,
                wallet,
              })
            }
          />
          <MiniPlanner
            info={info}
            unit={unit}
            onUnitChange={setUnit}
            onApply={({ amount, planned: p, attachments }) => {
              setAppliedAmount({
                amount: formatAppliedAmount(amount),
                nonce: Date.now(),
              });
              setPlanned(p);
              setPendingAttachments(
                attachments.tp.enabled || attachments.sl.enabled
                  ? attachments
                  : null,
              );
              // Buy limit: create the order immediately (no Buy click required).
              const bl = attachments.buyLimit;
              if (
                bl.enabled &&
                bl.triggerMc != null &&
                bl.triggerMc > 0 &&
                bl.solAmount != null &&
                bl.solAmount >= 0.1
              ) {
                void createBuyLimitOrder({
                  mint: info.mint,
                  symbol: info.symbol,
                  name: info.name,
                  triggerMc: bl.triggerMc,
                  solAmount: bl.solAmount,
                  isGuest: isGuest,
                  wallet: wallet,
                });
              }
            }}
          />
        </div>
      </div>

      <TokenIntelligenceSection info={info} />

      <AllOrders onNavigate={(m) => navigate(`/?token=${m}`)} />

      <ActivityTabs />

      {wallet && !isGuest && flags.leverage && (
        <TokenLeverageActivity
          wallet={wallet}
          mint={mint}
          onNavigate={(m) => navigate(`/?token=${m}`)}
        />
      )}
    </div>
    </TooltipProvider>
  );
}
