import { Clock, Signal } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHAIN_SCOPE_LABELS, type ChainScope } from "@/lib/education/chains";
import { LESSON_KIND_LABELS } from "@/lib/education/classification";
import type { LessonDifficulty, LessonKind } from "@/lib/education/types";

const PILL =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider";

const DIFFICULTY_LABELS: Record<LessonDifficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: LessonDifficulty;
  className?: string;
}) {
  return (
    <span
      className={cn(
        PILL,
        "border-border bg-surface-2 text-muted-foreground",
        className,
      )}
    >
      <Signal className="h-3 w-3" aria-hidden />
      {DIFFICULTY_LABELS[difficulty]}
    </span>
  );
}

export function EstimatedTime({
  minutes,
  className,
}: {
  minutes: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        PILL,
        "border-border bg-surface-2 text-muted-foreground",
        className,
      )}
    >
      <Clock className="h-3 w-3" aria-hidden />
      {minutes} min
    </span>
  );
}

/** Chain scope badge. Descriptive only — never a good/bad judgement. */
export function ChainScopeBadge({
  scope,
  className,
}: {
  scope: ChainScope;
  className?: string;
}) {
  return (
    <span
      className={cn(
        PILL,
        "border-accent/25 bg-accent/10 text-accent",
        className,
      )}
    >
      {CHAIN_SCOPE_LABELS[scope]}
    </span>
  );
}

export function LessonKindBadge({
  kind,
  className,
}: {
  kind: LessonKind;
  className?: string;
}) {
  const accent = kind === "flagship" || kind === "safety";
  return (
    <span
      className={cn(
        PILL,
        accent
          ? "border-accent/25 bg-accent/10 text-accent"
          : "border-border bg-surface-2 text-muted-foreground",
        className,
      )}
    >
      {LESSON_KIND_LABELS[kind]}
    </span>
  );
}
