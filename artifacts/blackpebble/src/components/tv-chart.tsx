import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TokenInfo } from "@/lib/api";
import { TokenChart } from "@/components/token-chart";
import { createDatafeed, encodeTicker, type TvResolution } from "@/lib/tv-datafeed";
import {
  loadTradingView,
  tvChartsEnabled,
  CHARTING_LIBRARY_PATH,
  type TvWidgetApi,
} from "@/lib/tv-loader";
import { cn } from "@/lib/utils";

type ChartMode = "price" | "market_cap";

/** Default timeframe the widget opens on. */
const DEFAULT_INTERVAL: TvResolution = "15";

/**
 * BlackPebble dark/gold theme applied to the TradingView widget so it matches
 * the rest of the app. Kept in one place for easy tuning during review.
 */
const ACCENT = "#c9a96e"; // BlackPebble gold
const BG = "#0e0e0e"; // card background
const UP = "#3fb950";
const DOWN = "#f85149";

const BP_OVERRIDES: Record<string, string | number | boolean> = {
  // Surface
  "paneProperties.background": BG,
  "paneProperties.backgroundType": "solid",
  "paneProperties.vertGridProperties.color": "rgba(255,255,255,0.04)",
  "paneProperties.horzGridProperties.color": "rgba(255,255,255,0.04)",
  // Gold crosshair (replaces GeckoTerminal's purple)
  "paneProperties.crossHairProperties.color": ACCENT,
  "paneProperties.crossHairProperties.width": 1,
  "paneProperties.crossHairProperties.style": 2,
  // Kill the giant faint symbol watermark for a clean, sharp look
  "symbolWatermarkProperties.transparency": 100,
  "symbolWatermarkProperties.color": "rgba(0,0,0,0)",
  // Axes
  "scalesProperties.textColor": "#a0a0a0",
  "scalesProperties.lineColor": "rgba(255,255,255,0.06)",
  "scalesProperties.fontSize": 11,
  // Candles
  "mainSeriesProperties.candleStyle.upColor": UP,
  "mainSeriesProperties.candleStyle.downColor": DOWN,
  "mainSeriesProperties.candleStyle.wickUpColor": UP,
  "mainSeriesProperties.candleStyle.wickDownColor": DOWN,
  "mainSeriesProperties.candleStyle.borderUpColor": UP,
  "mainSeriesProperties.candleStyle.borderDownColor": DOWN,
  "mainSeriesProperties.candleStyle.drawWick": true,
  "mainSeriesProperties.candleStyle.drawBorder": false,
};

// Volume study styling (kept subtle so candles lead the composition).
const BP_STUDIES_OVERRIDES: Record<string, string | number | boolean> = {
  "volume.volume.color.0": DOWN,
  "volume.volume.color.1": UP,
  "volume.volume.transparency": 72,
};

// Keep the premium terminal chrome (compact top toolbar, timeframes, indicators,
// fullscreen, screenshot) but trim single-symbol clutter and the billboard.
// `move_logo_to_main_pane` keeps the required TradingView attribution small in a
// chart corner (no billboard). The left drawing toolbar starts collapsed for a
// clean look but stays one click away — matching the screenshot's structure.
const DISABLED_FEATURES = [
  "header_symbol_search",
  "symbol_search_hot_key",
  "header_compare",
  "display_market_status",
  "popup_hints",
  "symbol_info",
];
const ENABLED_FEATURES = [
  "move_logo_to_main_pane",
  "hide_left_toolbar_by_default",
];

/**
 * The premium token chart. When TradingView Advanced Charts is enabled AND the
 * (self-hosted) library is installed, it renders the real terminal. Otherwise
 * it falls back to the interim chart so the page always works — this is the
 * seam we flip once access is approved and the library ships to staging.
 */
export function TokenChartPanel({ info }: { info: TokenInfo }) {
  const enabled = tvChartsEnabled();

  // "unknown" until we've probed for the library; then "ready" | "absent".
  const [libState, setLibState] = useState<"unknown" | "ready" | "absent">(
    enabled ? "unknown" : "absent",
  );

  if (!enabled || libState === "absent") {
    return <TokenChart info={info} />;
  }
  return (
    <TradingViewChart
      info={info}
      onReady={() => setLibState("ready")}
      onAbsent={() => setLibState("absent")}
      loading={libState === "unknown"}
    />
  );
}

function TradingViewChart({
  info,
  onReady,
  onAbsent,
  loading,
}: {
  info: TokenInfo;
  onReady: () => void;
  onAbsent: () => void;
  loading: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<TvWidgetApi | null>(null);
  const [mode, setMode] = useState<ChartMode>("price");
  const mcAvailable = info.marketCapUsd != null && info.marketCapUsd > 0;

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void loadTradingView().then((Widget) => {
      if (cancelled) return;
      if (!Widget) {
        onAbsent();
        return;
      }
      const datafeed = createDatafeed(info.mint, {
        displaySymbol: info.symbol || info.name || "TOKEN",
        sampleValue: info.priceUsd ?? undefined,
      });
      const widget = new Widget({
        container: host,
        datafeed,
        library_path: CHARTING_LIBRARY_PATH,
        symbol: encodeTicker(info.mint, false),
        interval: DEFAULT_INTERVAL,
        locale: "en",
        theme: "dark",
        autosize: true,
        timezone: "Etc/UTC",
        toolbar_bg: "#0e0e0e",
        loading_screen: { backgroundColor: "#0e0e0e", foregroundColor: "#c9a96e" },
        disabled_features: DISABLED_FEATURES,
        enabled_features: ENABLED_FEATURES,
        overrides: BP_OVERRIDES,
        studies_overrides: BP_STUDIES_OVERRIDES,
      });
      widgetRef.current = widget;
      widget.onChartReady(() => {
        if (!cancelled) onReady();
      });
    });

    return () => {
      cancelled = true;
      try {
        widgetRef.current?.remove();
      } catch {
        // widget may not have finished initializing; ignore teardown errors.
      }
      widgetRef.current = null;
    };
    // Re-create only when the token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.mint]);

  function selectMode(next: ChartMode) {
    if (next === mode) return;
    setMode(next);
    const widget = widgetRef.current;
    if (!widget) return;
    widget
      .activeChart()
      .setSymbol(encodeTicker(info.mint, next === "market_cap"), DEFAULT_INTERVAL);
  }

  return (
    <div
      className="relative flex flex-col rounded-2xl bg-card shadow-card overflow-hidden border border-border/60"
      data-testid="tv-chart"
    >
      <div className="flex items-center justify-end gap-2 px-3 pt-2.5 pb-1.5">
        <div className="flex items-center border border-border rounded-full p-0.5">
          {(
            [
              { key: "price", label: "Price" },
              { key: "market_cap", label: "MC" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => selectMode(m.key)}
              disabled={m.key === "market_cap" && !mcAvailable}
              data-testid={`tv-mode-${m.key}`}
              className={cn(
                "px-2.5 h-6 rounded-full text-[11px] font-medium transition-colors",
                mode === m.key
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground",
                m.key === "market_cap" &&
                  !mcAvailable &&
                  "opacity-40 cursor-not-allowed",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[400px] md:h-[520px]">
        <div ref={hostRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
