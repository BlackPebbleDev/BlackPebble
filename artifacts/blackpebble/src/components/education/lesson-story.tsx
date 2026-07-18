import { useState } from "react";
import { BookOpen, RotateCcw, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LessonStory } from "@/lib/education/types";

/**
 * Renders a lesson's narrative as a short, concrete story — the "teach with a
 * story, not a definition" pattern. When the story includes `beats`, the reader
 * can replay it step by step to *see* what happened before reading why.
 */
export function LessonStoryCard({
  story,
  onReplay,
}: {
  story: LessonStory;
  onReplay?: () => void;
}) {
  const beats = story.beats ?? [];
  const [step, setStep] = useState(0);
  const [replaying, setReplaying] = useState(false);

  function startReplay() {
    setReplaying(true);
    setStep(1);
    onReplay?.();
  }

  const toneClass = (tone?: string) =>
    tone === "positive"
      ? "text-success"
      : tone === "negative"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <section
      className="overflow-hidden rounded-2xl border border-accent/20 bg-card shadow-card"
      aria-label="Story"
      data-testid="lesson-story"
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <BookOpen className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
        <h3 className="m-0 text-sm font-semibold text-foreground">
          {story.character ? `${story.character}'s story` : "A quick story"}
        </h3>
      </header>

      <div className="space-y-3 p-4 text-sm leading-relaxed text-muted-foreground">
        <p className="text-foreground/90">{story.setup}</p>
        {story.expectation ? (
          <p>
            <span className="font-semibold text-foreground">Expected: </span>
            {story.expectation}
          </p>
        ) : null}
        {story.reality ? (
          <p>
            <span className="font-semibold text-foreground">What happened: </span>
            {story.reality}
          </p>
        ) : null}

        {beats.length > 0 ? (
          <div className="rounded-xl border border-border/60 bg-surface-2/50 p-3">
            {!replaying ? (
              <button
                type="button"
                onClick={startReplay}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
                data-testid="story-replay-start"
              >
                <Play className="h-3.5 w-3.5" aria-hidden /> Replay it step by step
              </button>
            ) : (
              <div className="space-y-2">
                <ol className="space-y-2">
                  {beats.slice(0, step).map((beat, i) => (
                    <li
                      key={i}
                      className="bp-anim-rise flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card/70 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground">
                          {beat.label}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {beat.detail}
                        </div>
                      </div>
                      {beat.value ? (
                        <span
                          className={cn(
                            "flex-shrink-0 text-xs font-bold tabular-nums",
                            toneClass(beat.tone),
                          )}
                        >
                          {beat.value}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
                <div className="flex items-center gap-2">
                  {step < beats.length ? (
                    <button
                      type="button"
                      onClick={() => setStep((s) => Math.min(beats.length, s + 1))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
                      data-testid="story-replay-next"
                    >
                      Next step
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setStep(1);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      data-testid="story-replay-restart"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Replay again
                    </button>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {Math.min(step, beats.length)} / {beats.length}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="rounded-xl border border-accent/20 bg-accent/5 px-3.5 py-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            The takeaway
          </div>
          <p className="text-foreground/90">{story.lesson}</p>
        </div>
      </div>
    </section>
  );
}
