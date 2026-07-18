import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  GraduationCap,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LearningPath } from "@/lib/education/learning-paths";

const CONFETTI = [
  { left: "6%", delay: "0s", cls: "text-accent" },
  { left: "20%", delay: "0.12s", cls: "text-success" },
  { left: "34%", delay: "0.05s", cls: "text-warning" },
  { left: "50%", delay: "0.2s", cls: "text-accent" },
  { left: "64%", delay: "0.09s", cls: "text-success" },
  { left: "78%", delay: "0.16s", cls: "text-warning" },
  { left: "92%", delay: "0.03s", cls: "text-accent" },
];

/**
 * Shown at the top of a learning path once every lesson is complete. It turns
 * "I finished reading" into "I'm ready": it celebrates the milestone, summarises
 * what the learner can now do, runs a lightweight confidence self-check, and
 * hands off cleanly into applying the knowledge (paper trading). The self-check
 * is honest self-report — it never gates the CTA, it just tunes encouragement.
 */
export function PathGraduation({ path }: { path: LearningPath }) {
  const checks = useMemo(() => path.outcomes.slice(0, 5), [path.outcomes]);
  const [confident, setConfident] = useState<boolean[]>(() =>
    checks.map(() => false),
  );

  const confidentCount = confident.filter(Boolean).length;
  const allConfident = checks.length > 0 && confidentCount === checks.length;
  const someShaky = checks.length > 0 && confidentCount < checks.length;

  function toggle(i: number) {
    setConfident((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  }

  const encouragement = allConfident
    ? "You've got the fundamentals down. Time to put them to work, with zero real money at risk."
    : confidentCount === 0
      ? "Tick off what already feels solid. Anything you leave unchecked is worth a quick review before you trade."
      : "Great progress. Revisit the unchecked topics whenever you like. They'll click fast the second time.";

  return (
    <section
      className="bp-anim-pop relative overflow-hidden rounded-2xl border border-success/30 bg-success/[0.07] p-5 sm:p-6"
      data-testid="path-graduation"
      aria-label={`${path.title} complete`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full" aria-hidden>
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className={cn("bp-confetti-piece absolute top-0 h-2 w-1.5 rounded-sm", c.cls)}
            style={{ left: c.left, animationDelay: c.delay, backgroundColor: "currentColor" }}
          />
        ))}
      </div>

      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-success/15">
            <GraduationCap className="h-6 w-6 text-success" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-success">
              Path complete
            </div>
            <h2 className="text-lg font-bold text-foreground sm:text-xl">
              You finished {path.title}
            </h2>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This is a real milestone. You started knowing little and now understand
          wallets, markets, risk, and how to use BlackPebble safely. {encouragement}
        </p>

        {/* Knowledge summary */}
        {path.outcomes.length > 0 ? (
          <div className="mt-4 rounded-xl border border-border/60 bg-card/60 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/80">
              <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden /> What you can do now
            </div>
            <ul className="space-y-1.5">
              {path.outcomes.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success" aria-hidden />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Confidence self-check */}
        {checks.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
                Quick readiness check
              </span>
              <span className="text-[11px] text-muted-foreground">
                {confidentCount}/{checks.length} confident
              </span>
            </div>
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-success transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${(confidentCount / checks.length) * 100}%` }}
              />
            </div>
            <ul className="space-y-1.5">
              {checks.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={confident[i]}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      confident[i]
                        ? "border-success/40 bg-success/[0.06] text-foreground"
                        : "border-border bg-surface-2 text-muted-foreground hover:border-accent/30",
                    )}
                    data-testid={`readiness-check-${i}`}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border",
                        confident[i]
                          ? "border-success bg-success text-background"
                          : "border-border bg-transparent",
                      )}
                    >
                      {confident[i] ? <Check className="h-3 w-3" aria-hidden /> : null}
                    </span>
                    <span>I feel confident: {c.charAt(0).toLowerCase() + c.slice(1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Transition to applying it */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {path.finalActionPath ? (
            <Link
              href={path.finalActionPath}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              data-testid="graduation-final-action"
            >
              {path.finalActionLabel ?? "Start practicing"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
          {someShaky ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reviewing unchecked topics first is totally fine.
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
