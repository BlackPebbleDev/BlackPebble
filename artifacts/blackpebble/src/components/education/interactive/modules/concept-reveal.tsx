import { useState } from "react";
import { Eye, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InteractiveModuleProps } from "../contract";

/**
 * Guess-then-reveal cards. The reader sees a question or term, thinks about the
 * answer, then taps to reveal it. This "retrieval practice" is far stickier than
 * passively reading. Fully config-driven so one component powers many lessons.
 */

interface RevealCard {
  front: string;
  back: string;
}

interface ConceptRevealConfig {
  prompt?: string;
  cards?: RevealCard[];
}

const DEFAULT_CARDS: RevealCard[] = [
  { front: "What can someone do with your public address?", back: "Only send you tokens and view your history. They can't move your funds." },
  { front: "What can someone do with your seed phrase?", back: "Everything. It restores your whole wallet — so it never goes into a website or chat." },
];

export function ConceptReveal({
  config,
  onEvent,
  onComplete,
}: InteractiveModuleProps<ConceptRevealConfig>) {
  const cards = config?.cards?.length ? config.cards : DEFAULT_CARDS;
  const [revealed, setRevealed] = useState<boolean[]>(() => cards.map(() => false));
  const [started, setStarted] = useState(false);

  function reveal(i: number) {
    if (!started) {
      setStarted(true);
      onEvent({ type: "interacted" });
    }
    setRevealed((prev) => {
      const next = [...prev];
      next[i] = true;
      if (next.every(Boolean)) onComplete({ completionType: "reveal" });
      return next;
    });
  }

  return (
    <section
      className="rounded-2xl border border-accent/20 bg-card shadow-card"
      aria-label="Reveal cards"
      data-testid="concept-reveal"
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <Sparkles className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
        <h3 className="m-0 text-sm font-semibold text-foreground">
          Guess, then reveal
        </h3>
      </header>
      {config?.prompt ? (
        <p className="border-b border-border/60 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {config.prompt}
        </p>
      ) : (
        <p className="border-b border-border/60 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Think about your answer first — then tap to check.
        </p>
      )}
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {cards.map((card, i) => (
          <button
            key={i}
            type="button"
            onClick={() => reveal(i)}
            aria-expanded={revealed[i]}
            className={cn(
              "flex min-h-24 flex-col justify-between rounded-xl border p-3 text-left transition-colors",
              revealed[i]
                ? "border-accent/40 bg-accent/[0.06]"
                : "border-border bg-surface-2 hover:border-accent/30",
            )}
            data-testid={`reveal-card-${i}`}
          >
            <span className="text-sm font-medium text-foreground">{card.front}</span>
            {revealed[i] ? (
              <span className="bp-anim-rise mt-2 text-xs leading-relaxed text-muted-foreground">
                {card.back}
              </span>
            ) : (
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                <Eye className="h-3 w-3" aria-hidden /> Tap to reveal
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
