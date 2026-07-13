import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AcademyLesson } from "@/lib/education/types";
import { LessonBody } from "./lesson-body";

export function LessonAccordionRow({
  lesson,
  defaultOpen = false,
  highlight = false,
}: {
  lesson: AcademyLesson;
  defaultOpen?: boolean;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      id={lesson.slug}
      className={cn(
        "scroll-mt-28 rounded-xl border border-border/60 bg-card/40",
        highlight && "border-accent/30 bg-accent/5",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
      >
        <span className="min-w-0 text-sm font-medium text-foreground">
          {lesson.title}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="border-t border-border/60 px-4 py-4">
          <LessonBody
            what={lesson.what}
            why={lesson.why}
            example={lesson.example}
            related={lesson.related}
            callout={lesson.callout}
          />
        </div>
      ) : null}
    </div>
  );
}
