import { useState } from "react";
import { GraduationCap, X } from "lucide-react";

/**
 * Trading Desk onboarding overlay.
 *
 * A compact, premium floating card that layers over the top of the Trading
 * Desk content (never in flow, so it causes no layout shift). Shown once until
 * dismissed; the dismissal is persisted to localStorage so it never returns for
 * a user who has closed it. Purely informational - the only action is the
 * close X. Scoped to the Trading Desk only (see trading.tsx); it must never
 * render on token pages or any other route.
 */
const DISMISS_KEY = "blackpebble.tradingDeskOnboarding.dismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

const BODY =
  "Practice trading Solana tokens with live market data and simulated capital. Test spot and perps, use advanced orders, and track your growth across the BlackPebble trading ecosystem.";

const POINTS = [
  "Search live Solana tokens",
  "Paper trade spot and perps",
  "Set TP / SL and advanced order automation",
  "Track performance, journal, rankings, and portfolio growth",
];

export function TradingDeskOnboarding() {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore (private mode / disabled storage) */
    }
    setDismissed(true);
  }

  return (
    // Out-of-flow overlay: pinned to the top of the (relative) content area so
    // it floats over the page without pushing anything down.
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-1">
      <div
        data-testid="trading-desk-onboarding"
        className="hairline-accent pointer-events-auto relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border/60 bg-card/95 p-5 shadow-elevated backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300 sm:p-6"
      >
        <button
          type="button"
          onClick={dismiss}
          data-testid="button-dismiss-onboarding"
          aria-label="Dismiss onboarding"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex items-center gap-3 pr-8">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
            <GraduationCap className="h-[18px] w-[18px]" />
          </span>
          <h3 className="text-base font-bold tracking-tight sm:text-lg">
            Welcome to BlackPebble Paper Trading
          </h3>
        </div>

        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {BODY}
        </p>

        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
