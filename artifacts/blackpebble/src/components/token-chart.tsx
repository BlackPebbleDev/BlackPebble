import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  api,
  type Candle,
  type CandleResolution,
  type TokenInfo,
  type PaperOrder,
  type Trade,
} from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { autoResolution, snapToCandle, UI_RESOLUTIONS } from "@/lib/chart-candles";
import {
  fmtMarketCap,
  fmtPrice,
  fmtSol,
  fmtPercent,
  fmtTokenAmount,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { LIVE_MS } from "@/lib/live";

/**
 * Native BlackPebble token chart (Chart Intelligence Phase 1).
 *
 * Replaces the GeckoTerminal iframe with a Lightweight Charts candlestick
 * chart fed by our own /markets/:mint/candles endpoint, so the chart is a
 * first-class BlackPebble surface: dark terminal theme, gold crosshair, the
 * small standard TradingView corner attribution (Apache 2.0 requirement) and
 * nothing else, Price/MC modes, smart auto-timeframe from token age, and a
 * trader-intent overlay layer - Avg Entry / Targets / Risk / Order lines plus
 * the viewer's own buy/sell markers with hover cards.
 *
 * Interaction model ("scroll-safe"): the chart mounts PASSIVE - a transparent
 * gate sits over it so wheel/touch scrolling always scrolls the page and can
 * never pan or zoom the chart. One intentional tap/click on the chart removes
 * the gate and enables full interactions; scrolling the page again (or
 * clicking/tapping outside) restores the passive gate. No mode UI, no hint
 * text - the gate is invisible by design.
 */

// ── Theme (mirrors chart-theme.ts / index.css tokens) ───────────────────────
const ACCENT = "#c9a96e";
const SUCCESS = "#47c295"; // hsl(158 50% 52%)
const DANGER = "#d86464"; // hsl(0 60% 62%)
const GRID = "rgba(255,255,255,0.04)";
const TICK = "#a0a0a0";

type ChartMode = "market_cap" | "price";
const CHART_MODE_KEY = "bp_chart_mode";

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

function saveChartMode(mode: ChartMode): void {
  try {
    window.localStorage.setItem(CHART_MODE_KEY, mode);
  } catch {
    /* private mode */
  }
}

/** Poll cadence per resolution - fast candles refresh faster. */
const REFETCH_MS: Record<CandleResolution, number> = {
  "15s": 10_000,
  "30s": 12_000,
  "1m": 15_000,
  "5m": 30_000,
  "15m": 45_000,
  "1h": 120_000,
  "4h": 300_000,
  "1d": 600_000,
};

const RESOLUTION_SECONDS: Record<CandleResolution, number> = {
  "15s": 15,
  "30s": 30,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14_400,
  "1d": 86_400,
};

// ── Time helpers ─────────────────────────────────────────────────────────────

/**
 * Lightweight Charts renders timestamps as UTC; shifting by the local offset
 * makes the axis and crosshair show the user's local time (standard practice
 * for intraday charts without a timezone picker).
 */
function toChartTime(unixSeconds: number): UTCTimestamp {
  return (unixSeconds -
    new Date(unixSeconds * 1000).getTimezoneOffset() * 60) as UTCTimestamp;
}

// ── Overlay line specs ───────────────────────────────────────────────────────

interface HoverRow {
  label: string;
  value: string;
  tone?: "success" | "danger" | "accent";
}

interface LineSpec {
  id: string;
  /** MC-denominated level (preferred - most BlackPebble triggers are MC). */
  mc: number | null;
  /** Direct USD-price level (orders with trigger_type "price"). */
  priceUsd: number | null;
  title: string;
  color: string;
  style: LineStyle;
  hover: HoverRow[];
}

/** Resolve a line's y-value for the current axis mode; null = not renderable. */
function lineValue(
  spec: LineSpec,
  mode: ChartMode,
  supply: number | null,
): number | null {
  if (mode === "market_cap") {
    if (spec.mc != null) return spec.mc;
    if (spec.priceUsd != null && supply) return spec.priceUsd * supply;
    return null;
  }
  if (spec.priceUsd != null) return spec.priceUsd;
  if (spec.mc != null && supply) return spec.mc / supply;
  return null;
}

// ── Tooltip state ────────────────────────────────────────────────────────────

interface HoverCard {
  x: number;
  y: number;
  title: string;
  tone?: "success" | "danger" | "accent";
  rows: HoverRow[];
}

// ── Component ────────────────────────────────────────────────────────────────

export function TokenChart({ info }: { info: TokenInfo }) {
  const { wallet, isGuest } = useAccount();
  const flags = useFeatureFlags();
  const mint = info.mint;

  const [mode, setMode] = useState<ChartMode>(loadChartMode);
  const [userResolution, setUserResolution] =
    useState<CandleResolution | null>(null);
  const [hover, setHover] = useState<HoverCard | null>(null);

  const resolution = userResolution ?? autoResolution(info.pairCreatedAt);

  // ── Data ──────────────────────────────────────────────────────────────────
  const candlesQuery = useQuery({
    queryKey: ["candles", mint, resolution],
    queryFn: () => api.candles(mint, resolution),
    refetchInterval: REFETCH_MS[resolution],
    retry: 1,
    staleTime: 5_000,
    // Keep the current candles on screen while a new timeframe (or a background
    // refresh) loads, so switching resolution never blanks the chart to a
    // spinner - the old bars stay put and swap in place the moment data lands.
    placeholderData: keepPreviousData,
  });

  const rawCandles: Candle[] = candlesQuery.data?.candles ?? [];
  const supply = candlesQuery.data?.supply ?? null;
  const isStale = candlesQuery.data?.stale ?? false;
  const noData =
    candlesQuery.isError || (candlesQuery.isSuccess && rawCandles.length === 0);

  // Live-anchor the forming bar: pull the most recent candle's close toward the
  // live header price (same source the page header shows) so the newest chart
  // value agrees with the header MC/price instead of lagging the candle feed.
  const candles: Candle[] = useMemo(() => {
    if (rawCandles.length === 0) return rawCandles;
    const live = info.priceUsd;
    if (live == null || !Number.isFinite(live) || live <= 0) return rawCandles;
    const last = rawCandles[rawCandles.length - 1];
    if (last.c === live) return rawCandles;
    const anchored: Candle = {
      ...last,
      c: live,
      h: Math.max(last.h, live),
      l: Math.min(last.l, live),
    };
    return [...rawCandles.slice(0, -1), anchored];
  }, [rawCandles, info.priceUsd]);

  // Shares query keys (and therefore cache) with the rest of the token page -
  // these add no extra network traffic when the trade panel is mounted.
  const { data: posData } = useQuery({
    queryKey: ["positions", wallet],
    queryFn: () => api.positions(wallet!),
    enabled: !!wallet,
    refetchInterval: LIVE_MS.positions,
  });
  const { data: ordersData } = useQuery({
    queryKey: ["orders", wallet, mint],
    queryFn: () => api.orders(wallet!, mint),
    enabled: !!wallet && !isGuest,
    refetchInterval: 15_000,
  });
  const { data: levData } = useQuery({
    queryKey: ["leverage-positions", wallet],
    queryFn: () => api.leverage.positions(wallet!),
    enabled: !!wallet && !isGuest && flags.leverage,
    refetchInterval: LIVE_MS.leverage,
  });
  const { data: histData } = useQuery({
    queryKey: ["history", wallet, mint],
    queryFn: () => api.history(wallet!, mint),
    enabled: !!wallet && !isGuest,
    refetchInterval: 30_000,
  });

  const position = posData?.positions.find((p) => p.token_mint === mint);
  const levPositions = (levData?.positions ?? []).filter(
    (p) => p.token_mint === mint && p.status === "open",
  );
  const orders = ordersData?.orders ?? [];
  const myTrades = useMemo(
    () => (histData?.trades ?? []).filter((t) => t.token_mint === mint),
    [histData, mint],
  );

  // ── Line specs (recomputed on data change, rendered in an effect) ─────────
  const lineSpecs = useMemo<LineSpec[]>(() => {
    const specs: LineSpec[] = [];

    if (position && position.entry_market_cap != null) {
      specs.push({
        id: `pos-${position.id}`,
        mc: position.entry_market_cap,
        priceUsd: null,
        title: "Avg Entry",
        color: ACCENT,
        style: LineStyle.Solid,
        hover: [
          {
            label: "Your average entry",
            value: `${fmtMarketCap(position.entry_market_cap)} MC`,
          },
          { label: "Position", value: `${fmtTokenAmount(position.total_tokens)} tokens` },
          {
            label: "Unrealized PnL",
            value: fmtPercent(position.unrealizedPnlPercent),
            tone:
              (position.unrealizedPnlPercent ?? 0) >= 0 ? "success" : "danger",
          },
        ],
      });
    }

    const fromTrigger = (o: PaperOrder) =>
      o.trigger_type === "market_cap"
        ? { mc: o.trigger_value, priceUsd: null }
        : { mc: null, priceUsd: o.trigger_value };
    const sellPct = (o: PaperOrder) =>
      o.amount_type === "percent" ? `sell ${o.amount_value}%` : null;

    const targets = orders
      .filter((o) => o.order_type === "take_profit")
      .sort((a, b) => a.trigger_value - b.trigger_value);
    targets.forEach((o, i) => {
      const pct = sellPct(o);
      specs.push({
        id: `order-${o.id}`,
        ...fromTrigger(o),
        title: `Target ${targets.length > 1 ? i + 1 : ""}`.trim() + (pct ? ` · ${pct}` : ""),
        color: SUCCESS,
        style: LineStyle.Dashed,
        hover: [
          { label: `Target ${i + 1}`, value: fmtMarketCap(o.trigger_value) },
          ...(pct ? [{ label: "On trigger", value: pct }] : []),
        ],
      });
    });

    for (const o of orders.filter((x) => x.order_type === "stop_loss")) {
      const pct = sellPct(o);
      specs.push({
        id: `order-${o.id}`,
        ...fromTrigger(o),
        title: `Stop Loss${pct ? ` · ${pct}` : ""}`,
        color: DANGER,
        style: LineStyle.Dashed,
        hover: [
          { label: "Stop Loss", value: fmtMarketCap(o.trigger_value), tone: "danger" },
          ...(pct ? [{ label: "On trigger", value: pct }] : []),
        ],
      });
    }

    for (const o of orders.filter((x) => x.order_type === "buy_limit")) {
      specs.push({
        id: `order-${o.id}`,
        ...fromTrigger(o),
        title: "Buy Limit",
        color: ACCENT,
        style: LineStyle.Dashed,
        hover: [
          { label: "Buy Limit", value: fmtMarketCap(o.trigger_value), tone: "accent" },
          { label: "Spend", value: `${fmtSol(o.amount_value)} SOL` },
        ],
      });
    }

    for (const lp of levPositions) {
      const dir = lp.direction === "short" ? "Short" : "Long";
      if (lp.entry_market_cap != null) {
        specs.push({
          id: `lev-entry-${lp.id}`,
          mc: lp.entry_market_cap,
          priceUsd: null,
          title: `${dir} ${lp.leverage}x Entry`,
          color: ACCENT,
          style: LineStyle.Solid,
          hover: [
            { label: `${dir} ${lp.leverage}x entry`, value: `${fmtMarketCap(lp.entry_market_cap)} MC` },
            { label: "Margin", value: `${fmtSol(lp.margin_sol)} SOL` },
            ...(lp.roiOnMargin != null
              ? [
                  {
                    label: "ROI on margin",
                    value: fmtPercent(lp.roiOnMargin),
                    tone: (lp.roiOnMargin >= 0 ? "success" : "danger") as
                      | "success"
                      | "danger",
                  },
                ]
              : []),
          ],
        });
      }
      if (lp.liq_market_cap != null) {
        specs.push({
          id: `lev-liq-${lp.id}`,
          mc: lp.liq_market_cap,
          priceUsd: null,
          title: "Liquidation",
          color: DANGER,
          style: LineStyle.Solid,
          hover: [
            { label: "Liquidation", value: `${fmtMarketCap(lp.liq_market_cap)} MC`, tone: "danger" },
            { label: "Position", value: `${dir} ${lp.leverage}x` },
          ],
        });
      }
      const exits = lp.exitOrders ?? [];
      if (exits.length > 0) {
        for (const eo of exits) {
          const isTp = eo.kind === "take_profit";
          specs.push({
            id: `lev-exit-${eo.id}`,
            mc: eo.trigger_mc,
            priceUsd: null,
            title: `${isTp ? "Perps Target" : "Perps Stop"} · ${eo.percent}%`,
            color: isTp ? SUCCESS : DANGER,
            style: LineStyle.Dashed,
            hover: [
              {
                label: isTp ? "Perps Target" : "Perps Stop",
                value: `${fmtMarketCap(eo.trigger_mc)} MC`,
                tone: isTp ? "success" : "danger",
              },
              { label: "Closes", value: `${eo.percent}% of position` },
            ],
          });
        }
      } else {
        if (lp.tp_trigger_mc != null) {
          specs.push({
            id: `lev-tp-${lp.id}`,
            mc: lp.tp_trigger_mc,
            priceUsd: null,
            title: "Perps Target",
            color: SUCCESS,
            style: LineStyle.Dashed,
            hover: [
              { label: "Perps Target", value: `${fmtMarketCap(lp.tp_trigger_mc)} MC`, tone: "success" },
            ],
          });
        }
        if (lp.sl_trigger_mc != null) {
          specs.push({
            id: `lev-sl-${lp.id}`,
            mc: lp.sl_trigger_mc,
            priceUsd: null,
            title: "Perps Stop",
            color: DANGER,
            style: LineStyle.Dashed,
            hover: [
              { label: "Perps Stop", value: `${fmtMarketCap(lp.sl_trigger_mc)} MC`, tone: "danger" },
            ],
          });
        }
      }
    }

    return specs;
  }, [position, orders, levPositions]);

  // ── Chart refs ────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartElRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const fittedKeyRef = useRef<string>("");

  // Refs mirroring reactive values so chart event handlers stay stable.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const supplyRef = useRef(supply);
  supplyRef.current = supply;
  const lineSpecsRef = useRef(lineSpecs);
  lineSpecsRef.current = lineSpecs;
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const tradesByBucketRef = useRef<Map<number, Trade[]>>(new Map());

  const axisFormatter = useCallback((v: number) => {
    return modeRef.current === "market_cap" ? fmtMarketCap(v) : fmtPrice(v);
  }, []);

  // ── Chart creation (once per mount) ──────────────────────────────────────
  useEffect(() => {
    const el = chartElRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: TICK,
        fontSize: 11,
        // Small standard TradingView corner logo - the Apache 2.0 license's
        // attribution requirement. Never hide or restyle it.
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(201,169,110,0.4)",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#8a744c",
        },
        horzLine: {
          color: "rgba(201,169,110,0.4)",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#8a744c",
        },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
      },
      localization: { priceFormatter: axisFormatter },
      // Natural but scroll-safe interaction (no "tap to activate" gate):
      //  - the page ALWAYS scrolls (mouse wheel + vertical touch swipe never
      //    move the chart), so scrolling over the chart is never hijacked;
      //  - the chart pans on click-drag (desktop) and horizontal swipe
      //    (mobile), and zooms via pinch / axis-drag / axis double-click.
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false,
        pinch: true,
        axisPressedMouseMove: true,
        axisDoubleClickReset: true,
      },
      kineticScroll: { touch: true, mouse: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: SUCCESS,
      downColor: DANGER,
      borderVisible: false,
      wickUpColor: SUCCESS,
      wickDownColor: DANGER,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      visible: false,
    });

    const markers = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;
    markersRef.current = markers;

    // ── Hover cards: own-trade markers + intent lines ──
    const onCrosshair = (param: MouseEventParams) => {
      if (!param.point || param.time == null) {
        setHover(null);
        return;
      }
      const px = param.point.x;
      const py = param.point.y;

      // Trades in the hovered candle bucket?
      const bucketTrades = tradesByBucketRef.current.get(param.time as number);
      if (bucketTrades && bucketTrades.length > 0) {
        const candle = param.seriesData.get(series) as
          | { high?: number; low?: number }
          | undefined;
        // Only show when the cursor is near the marker (above/below the bar),
        // so hovering mid-candle still reads as normal crosshair use.
        const lowY =
          candle?.low != null ? series.priceToCoordinate(candle.low) : null;
        const highY =
          candle?.high != null ? series.priceToCoordinate(candle.high) : null;
        const nearBelow = lowY != null && py > lowY - 8;
        const nearAbove = highY != null && py < highY + 8;
        if (nearBelow || nearAbove) {
          const rows: HoverRow[] = bucketTrades.slice(0, 4).map((t) => ({
            label: t.side === "buy" ? "Buy" : "Sell",
            value: `${fmtSol(t.sol_amount)} SOL${
              t.market_cap_usd != null ? ` @ ${fmtMarketCap(t.market_cap_usd)} MC` : ""
            }`,
            tone: t.side === "buy" ? ("success" as const) : ("danger" as const),
          }));
          if (bucketTrades.length > 4) {
            rows.push({
              label: "",
              value: `+${bucketTrades.length - 4} more in this candle`,
            });
          }
          setHover({
            x: px,
            y: py,
            title: "Your trades",
            rows,
          });
          return;
        }
      }

      // Near an intent line?
      for (const spec of lineSpecsRef.current) {
        const value = lineValue(spec, modeRef.current, supplyRef.current);
        if (value == null) continue;
        const y = series.priceToCoordinate(value);
        if (y != null && Math.abs(y - py) <= 6) {
          setHover({
            x: px,
            y,
            title: spec.title,
            tone:
              spec.color === SUCCESS
                ? "success"
                : spec.color === DANGER
                  ? "danger"
                  : "accent",
            rows: spec.hover,
          });
          return;
        }
      }

      setHover(null);
    };
    chart.subscribeCrosshairMove(onCrosshair);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      markersRef.current = null;
      priceLinesRef.current = [];
    };
    // The chart instance is created once; reactive values flow in via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint]);

  // ── Candle data → series ──────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const volume = volumeRef.current;
    if (!chart || !series || !volume || candles.length === 0) return;

    const mcMode = mode === "market_cap" && supply != null && supply > 0;
    const factor = mcMode ? supply : 1;

    series.setData(
      candles.map((c) => ({
        time: toChartTime(c.t),
        open: c.o * factor,
        high: c.h * factor,
        low: c.l * factor,
        close: c.c * factor,
      })),
    );
    volume.setData(
      candles.map((c) => ({
        time: toChartTime(c.t),
        value: c.v,
        color:
          c.c >= c.o ? "rgba(71,194,149,0.22)" : "rgba(216,100,100,0.22)",
      })),
    );

    // Precision: derive a sensible minMove from the latest close so tiny
    // memecoin prices and multi-million MCs both format cleanly.
    const lastClose = candles[candles.length - 1].c * factor;
    const magnitude = Math.floor(Math.log10(Math.max(lastClose, 1e-12)));
    const minMove = Math.pow(10, magnitude - 4);
    series.applyOptions({
      priceFormat: { type: "custom", formatter: axisFormatter, minMove },
    });
    chart.applyOptions({
      localization: { priceFormatter: axisFormatter },
      timeScale: {
        secondsVisible: resolution === "15s" || resolution === "30s",
      },
    });

    // Initial view: fit young tokens' whole life; older tokens get a smart
    // recent window instead of a squashed multi-week fit. Only on first load
    // per (mint, resolution) so polling never yanks the user's zoom.
    const fitKey = `${mint}:${resolution}`;
    if (fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey;
      if (candles.length > 200) {
        chart.timeScale().setVisibleLogicalRange({
          from: candles.length - 150,
          to: candles.length + 3,
        });
      } else {
        chart.timeScale().fitContent();
      }
    }
  }, [candles, mode, supply, resolution, mint, axisFormatter]);

  // ── My trade markers ──────────────────────────────────────────────────────
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    if (myTrades.length === 0 || candles.length === 0) {
      tradesByBucketRef.current = new Map();
      markers.setMarkers([]);
      return;
    }

    // Snap each trade to the nearest candle at-or-before its execution so the
    // marker lands on a real bar even when quiet buckets are missing.
    const times = candles.map((c) => c.t);
    const byBucket = new Map<number, Trade[]>();
    for (const t of myTrades) {
      const bucket = snapToCandle(times, t.executed_at);
      if (bucket == null) continue;
      const chartTime = toChartTime(bucket) as number;
      const arr = byBucket.get(chartTime);
      if (arr) arr.push(t);
      else byBucket.set(chartTime, [t]);
    }
    tradesByBucketRef.current = byBucket;

    const items: SeriesMarker<Time>[] = [];
    for (const [chartTime, trades] of byBucket) {
      const hasBuy = trades.some((t) => t.side === "buy");
      const hasSell = trades.some((t) => t.side === "sell");
      if (hasBuy) {
        items.push({
          time: chartTime as UTCTimestamp,
          position: "belowBar",
          shape: "circle",
          color: SUCCESS,
          size: 1,
        });
      }
      if (hasSell) {
        items.push({
          time: chartTime as UTCTimestamp,
          position: "aboveBar",
          shape: "circle",
          color: DANGER,
          size: 1,
        });
      }
    }
    items.sort((a, b) => (a.time as number) - (b.time as number));
    markers.setMarkers(items);
  }, [myTrades, candles]);

  // ── Intent lines ──────────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];
    if (candles.length === 0) return;

    for (const spec of lineSpecs) {
      const value = lineValue(spec, mode, supply);
      if (value == null || !Number.isFinite(value) || value <= 0) continue;
      priceLinesRef.current.push(
        series.createPriceLine({
          price: value,
          color: spec.color,
          lineWidth: 1,
          lineStyle: spec.style,
          axisLabelVisible: true,
          title: spec.title,
        }),
      );
    }
  }, [lineSpecs, mode, supply, candles.length]);

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const resolutionChoices = UI_RESOLUTIONS;

  const mcAvailable = supply != null && supply > 0;
  const effectiveMode: ChartMode = mcAvailable ? mode : "price";

  function selectMode(next: ChartMode) {
    setMode(next);
    saveChartMode(next);
  }

  const showLoading = candlesQuery.isLoading;
  const showError = noData && !showLoading;

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col rounded-2xl bg-card shadow-card overflow-hidden border border-border/60"
      data-testid="token-chart"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap" role="tablist" aria-label="Timeframe">
          {resolutionChoices.map((r) => {
            const selected = r === resolution;
            return (
              <button
                key={r}
                role="tab"
                aria-selected={selected}
                onClick={() => setUserResolution(r)}
                data-testid={`chart-res-${r}`}
                className={cn(
                  "px-2 h-6 rounded-full text-[11px] font-mono transition-colors",
                  selected
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {isStale && (
            <span
              className="text-[10px] text-muted-foreground/70"
              title="Live source briefly unavailable - showing the most recent candles."
              data-testid="chart-stale"
            >
              delayed
            </span>
          )}
          <div className="flex items-center border border-border rounded-full p-0.5">
            {(
              [
                { key: "market_cap" as const, label: "MC" },
                { key: "price" as const, label: "Price" },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                onClick={() => selectMode(m.key)}
                disabled={m.key === "market_cap" && !mcAvailable}
                data-testid={`chart-mode-${m.key}`}
                className={cn(
                  "px-2.5 h-6 rounded-full text-[11px] font-medium transition-colors",
                  effectiveMode === m.key
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:text-foreground",
                  m.key === "market_cap" && !mcAvailable && "opacity-40 cursor-not-allowed",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart body */}
      <div className="relative h-[400px] md:h-[520px]">
        <div ref={chartElRef} className="absolute inset-0" />

        {/* Hover card */}
        {hover && (
          <div
            className="absolute z-20 pointer-events-none rounded-xl bg-[#171717] border border-white/10 shadow-card px-3 py-2 min-w-[150px] max-w-[240px]"
            style={{
              left: Math.min(Math.max(hover.x + 12, 4), (containerRef.current?.clientWidth ?? 320) - 200),
              top: Math.max(hover.y - 10, 34),
            }}
            data-testid="chart-hover-card"
          >
            <div
              className={cn(
                "text-[11px] font-semibold mb-1",
                hover.tone === "success"
                  ? "text-success"
                  : hover.tone === "danger"
                    ? "text-danger"
                    : "text-accent",
              )}
            >
              {hover.title}
            </div>
            <div className="space-y-0.5">
              {hover.rows.map((row, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span
                    className={cn(
                      "font-mono",
                      row.tone === "success"
                        ? "text-success"
                        : row.tone === "danger"
                          ? "text-danger"
                          : row.tone === "accent"
                            ? "text-accent"
                            : "text-foreground",
                    )}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 pointer-events-none">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {showError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-4 text-center">
            <p className="text-sm text-muted-foreground">
              No chart data available for this timeframe.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => candlesQuery.refetch()}
                data-testid="button-reload-chart"
                className="flex items-center gap-2 px-3 h-9 rounded-full border border-border text-xs text-foreground hover:border-accent/50 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Chart
              </button>
              {info.pairAddress && (
                <a
                  href={`https://dexscreener.com/solana/${info.pairAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-3 h-9 rounded-full border border-border text-xs text-foreground hover:border-accent/50 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  DexScreener
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
