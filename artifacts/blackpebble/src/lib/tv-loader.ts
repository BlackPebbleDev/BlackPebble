/**
 * Lazy loader for the TradingView Advanced Charts library.
 *
 * The library is private and NOT part of this repo. Once access is approved it
 * is dropped into `public/charting_library/` (git-ignored) and served as a
 * static asset. Until then this loader resolves to `null`, and callers fall
 * back to the interim chart — so the app builds and runs with or without the
 * library present.
 */

import type { BlackPebbleDatafeed, TvResolution } from "./tv-datafeed";

/** Where the self-hosted library assets live once installed. */
export const CHARTING_LIBRARY_PATH = "/charting_library/";
const CHARTING_LIBRARY_SCRIPT = `${CHARTING_LIBRARY_PATH}charting_library.standalone.js`;

/**
 * Whether the TradingView chart is opted in for this build. Off by default so
 * nothing changes for users until we deliberately enable it (typically on
 * staging once the library is installed and access is approved).
 */
export function tvChartsEnabled(): boolean {
  return import.meta.env["VITE_TV_CHARTS"] === "1";
}

// ── Minimal widget option/handle types (subset we use) ───────────────────────
// Structural stand-ins so this compiles without the library's own .d.ts.

export interface TvWidgetOptions {
  container: HTMLElement;
  datafeed: BlackPebbleDatafeed;
  library_path: string;
  symbol: string;
  interval: TvResolution;
  locale?: string;
  theme?: "dark" | "light";
  autosize?: boolean;
  fullscreen?: boolean;
  timezone?: string;
  toolbar_bg?: string;
  loading_screen?: { backgroundColor?: string; foregroundColor?: string };
  disabled_features?: string[];
  enabled_features?: string[];
  overrides?: Record<string, string | number | boolean>;
  studies_overrides?: Record<string, string | number | boolean>;
  custom_css_url?: string;
}

export interface TvChartApi {
  setSymbol(symbol: string, interval: TvResolution, callback?: () => void): void;
}

export interface TvWidgetApi {
  onChartReady(cb: () => void): void;
  activeChart(): TvChartApi;
  remove(): void;
}

type TvWidgetConstructor = new (options: TvWidgetOptions) => TvWidgetApi;

interface TradingViewGlobal {
  widget: TvWidgetConstructor;
}

declare global {
  interface Window {
    TradingView?: TradingViewGlobal;
  }
}

let loadPromise: Promise<TvWidgetConstructor | null> | null = null;

/**
 * Resolve the TradingView widget constructor, loading the library script on
 * first use. Resolves to `null` (never rejects) when the library isn't
 * installed or fails to load, so callers can fall back cleanly.
 */
export function loadTradingView(): Promise<TvWidgetConstructor | null> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    if (window.TradingView?.widget) {
      resolve(window.TradingView.widget);
      return;
    }
    const script = document.createElement("script");
    script.src = CHARTING_LIBRARY_SCRIPT;
    script.async = true;
    script.onload = () => {
      resolve(window.TradingView?.widget ?? null);
    };
    script.onerror = () => {
      // Library not installed yet — expected until access is approved.
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** Test seam: forget the cached load so a subsequent call reloads. */
export function __resetTvLoaderForTest(): void {
  loadPromise = null;
}
