import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Compass, Heart, ShieldCheck, Sparkles, X } from "lucide-react";
import { learningPathPath } from "@/lib/education/routes";
import type { LearningPath } from "@/lib/education/learning-paths";

const DISMISS_KEY = "bp.academy.welcome.dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First-run welcome for people brand-new to crypto. Instead of dumping a
 * beginner into a wall of topics, it sets the mission, reduces fear, and offers
 * one obvious next step: the guided path. Shown only when there is no progress
 * yet, and dismissible (remembered locally).
 */
export function AcademyWelcome({
  path,
  hasProgress,
}: {
  path?: LearningPath;
  hasProgress: boolean;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (dismissed || hasProgress || !path) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/[0.12] to-accent/[0.03] p-5 shadow-card sm:p-6"
      data-testid="academy-welcome"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        data-testid="welcome-dismiss"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15">
          <Compass className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          New here? Start with this
        </span>
      </div>

      <h2 className="mt-3 text-lg font-bold text-foreground sm:text-xl">
        Never touched crypto before? You're in the right place.
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        No jargon, no pressure, and nothing at risk. In about an hour you'll
        understand wallets, prices, risk, memecoins, and scams, and you'll
        practice safely with simulated funds before ever using real money.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          { icon: Sparkles, text: "Learn by doing, not just reading" },
          { icon: ShieldCheck, text: "Spot scams before they cost you" },
          { icon: Heart, text: "Go at your own pace. Progress saves" },
        ].map((item) => (
          <li key={item.text} className="flex items-start gap-2 text-xs text-foreground/90">
            <item.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>

      <Link
        href={learningPathPath(path.slug)}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        data-testid="welcome-start-path"
      >
        Start the beginner path
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
