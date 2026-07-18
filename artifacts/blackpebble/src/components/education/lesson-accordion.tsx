import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NormalizedLesson } from "@/lib/education/normalize";
import { NormalizedLessonBody } from "./lesson-body";

export function LessonAccordionRow({
  lesson,
  defaultOpen = false,
  highlight = false,
}: {
  lesson: NormalizedLesson;
  defaultOpen?: boolean;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const buttonId = `lesson-btn-${lesson.slug}`;
  const panelId = `lesson-panel-${lesson.slug}`;

  return (
    <div
      id={lesson.slug}
      className={cn(
        "scroll-mt-28 rounded-xl border border-border/60 bg-card/40",
        highlight && "border-accent/30 bg-accent/5",
      )}
    >
      <h3 className="m-0">
        <button
          type="button"
          id={buttonId}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          <span className="min-w-0 text-sm font-medium text-foreground">
            {lesson.title}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h3>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="border-t border-border/60 px-4 py-4"
        >
          <NormalizedLessonBody lesson={lesson} />
        </div>
      ) : null}
    </div>
  );
}
