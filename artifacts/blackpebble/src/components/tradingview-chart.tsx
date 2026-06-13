import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";

/**
 * Chart display mode. GeckoTerminal's embed accepts these exact values for its
 * `chart_type` URL parameter (`market_cap` renders the MCAP chart, `price` the
 * standard price chart). MCAP is our default on every token page.
 */
type ChartMode = "market_cap" | "price";

const CHART_MODE_KEY = "bp_chart_mode";

/** Read the remembered mode, defaulting to MCAP. */
function loadChartMode(): ChartMode {
  if (typeof window === "undefined") return "market_cap";
  try {
    return window.localStorage.getItem(CHART_MODE_KEY) === "price"
      ? "price"
      : "market_cap";
  } catch {
    return "market_cap";
  }
}

/**
 * TradingView-style price chart for migrated tokens.
 *
 * A native TradingView widget can't be used for arbitrary SPL tokens (TradingView
 * has no symbol for most Solana memecoins), so we embed GeckoTerminal's pool
 * chart — which renders the TradingView charting library under the hood with
 * full candlesticks, timeframes and indicators. This gives the page a genuine
 * pro-grade chart while still working for any token that has a DEX pool.
 *
 * The iframe lifecycle is hardened the same way as the old DexScreener embed:
 *  - Full remount on every pool change / manual reload via a changing `key`, so
 *    mobile webviews tear down the old embed instead of reusing it.
 *  - Blank the iframe (`about:blank`) on unmount to release webview memory.
 *  - Spinner until `onLoad`; a "Reload Chart" fallback if it stalls.
 * No polling — this never spams the network.
 */
export function TradingViewChart({ pairAddress }: { pairAddress: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [nonce, setNonce] = useState(0);
  const [mode, setMode] = useState<ChartMode>(loadChartMode);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Switch the chart mode: remember the choice across token pages and remount
  // the iframe (the chart_type can only be set at load time).
  function changeMode(next: ChartMode) {
    if (next === mode) return;
    setMode(next);
    try {
      window.localStorage.setItem(CHART_MODE_KEY, next);
    } catch {
      /* private mode / storage disabled — non-fatal */
    }
    setStatus("loading");
    setNonce((n) => n + 1);
  }

  useEffect(() => {
    setStatus("loading");
    const iframe = iframeRef.current;
    const timer = setTimeout(() => {
      setStatus((s) => (s === "loaded" ? s : "error"));
    }, 20_000);
    return () => {
      clearTimeout(timer);
      if (iframe) {
        try {
          iframe.src = "about:blank";
        } catch {
          /* cross-origin teardown — safe to ignore */
        }
      }
    };
  }, [pairAddress, nonce]);

  const src =
    `https://www.geckoterminal.com/solana/pools/${pairAddress}` +
    `?embed=1&info=0&swaps=0&grayscale=0&light_chart=0&chart_type=${mode}&resolution=15m`;

  return (
    <div className="relative flex flex-col rounded-2xl bg-card shadow-card overflow-hidden h-[440px] md:h-[560px] border border-border/60">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Chart
        </span>
        <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-secondary/40 p-0.5">
          {(
            [
              ["market_cap", "MCAP"],
              ["price", "Price"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => changeMode(value)}
              data-testid={`button-chart-mode-${value}`}
              aria-pressed={mode === value}
              className={
                "px-2.5 h-6 rounded-full text-[11px] font-medium transition-colors " +
                (mode === value
                  ? "bg-accent/20 text-accent"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative flex-1">
        <iframe
          key={`${pairAddress}-${nonce}`}
          ref={iframeRef}
          title="TradingView chart"
          src={src}
          className="w-full h-full"
          allow="clipboard-write"
          onLoad={() => setStatus("loaded")}
        />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/80 pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-4 text-center">
          <p className="text-sm text-muted-foreground">
            The chart took too long to load.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setStatus("loading");
                setNonce((n) => n + 1);
              }}
              data-testid="button-reload-chart"
              className="flex items-center gap-2 px-3 h-9 rounded-full border border-border text-xs text-foreground hover:border-accent/50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Chart
            </button>
            <a
              href={`https://dexscreener.com/solana/${pairAddress}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 h-9 rounded-full border border-border text-xs text-foreground hover:border-accent/50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              DexScreener
            </a>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
