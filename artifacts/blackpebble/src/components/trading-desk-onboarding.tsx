import { useEffect, useState } from "react";
import { Check, GraduationCap, X } from "lucide-react";

/**
 * Premium, dismissible onboarding overlay for the Trading Desk homepage.
 *
 * Rendered ONLY from the bare Trading Desk (`/` with no `?token=`), never on
 * token pages or any other route. It floats above the page (fixed position) so
 * it never pushes content down / causes layout shift.
 *
 * Dismissal is persisted to localStorage so it never returns for a user who
 * closed it. No login required, no backend persistence, no CTAs — the only
 * action is the close button.
 */
const DISMISS_KEY = "blackpebble.tradingDeskOnboarding.dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
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
  // Start hidden so the overlay never appears in prerendered HTML and never
  // flashes for users who already dismissed it; reveal only on the client once
  // we've confirmed it isn't dismissed.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!readDismissed()) setVisible(true);
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore (private mode / disabled storage) */
    }
    setVisible(false);
  }

  return (
    <div
      className="fixed bottom-20 left-3 right-3 z-40 md:bottom-auto md:left-auto md:right-6 md:top-28 md:w-[380px] animate-in fade-in zoom-in-95 duration-300"
      role="dialog"
      aria-label="Welcome to BlackPebble Paper Trading"
    >
      <div
        data-testid="trading-desk-onboarding"
        className="hairline-accent relative overflow-hidden rounded-2xl border border-card-border bg-card p-4 shadow-elevated sm:p-5"
      >
        <button
          type="button"
          onClick={dismiss}
          data-testid="button-dismiss-onboarding"
          aria-label="Dismiss"
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-2.5 flex items-center gap-2.5 pr-7">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
            <GraduationCap className="h-[18px] w-[18px]" />
          </span>
          <h3 className="text-[15px] font-bold leading-snug tracking-tight">
            Welcome to BlackPebble Paper Trading
          </h3>
        </div>

        <p className="mb-3.5 text-[13px] leading-relaxed text-muted-foreground">
          {BODY}
        </p>

        <ul className="grid gap-2">
          {POINTS.map((point) => (
            <li
              key={point}
              className="flex items-start gap-2 text-[13px] text-muted-foreground"
            >
              <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="leading-snug">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
