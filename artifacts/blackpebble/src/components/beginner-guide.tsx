import { useState } from "react";
import { GraduationCap, X } from "lucide-react";

/**
 * Dismissible "New to Paper Trading?" onboarding card shown near the top of the
 * Trading Desk. Shown once — the dismissal is persisted to localStorage so it
 * never returns for a user who has closed it. Purely informational (UX pass
 * item 9): it adds no trading behaviour.
 */
const DISMISS_KEY = "bp:beginner-guide-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

const DESCRIPTION =
  "Practice trading Solana tokens using live market data and simulated funds. Test strategies, learn leverage, and improve your trading skills without risking real money.";

const STEPS = [
  "Search a token or browse Markets.",
  "Trade Spot or Leverage positions.",
  "Set Take Profit, Stop Loss, or advanced orders.",
  "Track performance, rankings, and portfolio growth.",
];

export function BeginnerGuide() {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore (private mode / disabled storage) */
    }
    setDismissed(true);
  }

  return (
    <div
      data-testid="beginner-guide"
      className="relative overflow-hidden rounded-2xl bg-card shadow-card p-5 sm:p-6 mb-4"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <button
        type="button"
        onClick={dismiss}
        data-testid="button-dismiss-beginner-guide"
        aria-label="Dismiss beginner guide"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
          <GraduationCap className="w-5 h-5" />
        </span>
        <h3 className="text-lg font-bold tracking-tight">
          What is BlackPebble Paper Trading?
        </h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl leading-relaxed">{DESCRIPTION}</p>
      <ol className="grid gap-2.5 sm:grid-cols-2 text-sm text-muted-foreground">
        {STEPS.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
              {i + 1}
            </span>
            <span className="pt-px">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
