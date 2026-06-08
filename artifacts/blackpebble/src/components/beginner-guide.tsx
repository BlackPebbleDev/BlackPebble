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

const STEPS = [
  "Search or browse Markets to find a token.",
  "Set your buy amount and hit Buy — it's all simulated, no real money.",
  "Add a Take Profit or Stop Loss to automate your exit.",
  "Track your P&L any time on the Portfolio page.",
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
      className="relative border border-accent/30 bg-accent/5 p-4 mb-4"
    >
      <button
        type="button"
        onClick={dismiss}
        data-testid="button-dismiss-beginner-guide"
        aria-label="Dismiss beginner guide"
        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2 mb-2.5">
        <GraduationCap className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold">New to Paper Trading?</h3>
      </div>
      <ol className="grid gap-1.5 sm:grid-cols-2 text-xs text-muted-foreground">
        {STEPS.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-medium text-accent">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
