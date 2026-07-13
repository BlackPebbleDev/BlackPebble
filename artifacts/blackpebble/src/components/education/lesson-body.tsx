import { Link } from "wouter";
import { cn } from "@/lib/utils";
import type { LessonCallout, CalloutType } from "@/lib/education/types";

const CALLOUT_STYLES: Record<
  CalloutType,
  { label: string; className: string }
> = {
  why: {
    label: "Why this matters",
    className: "border-accent/20 bg-accent/5 text-foreground",
  },
  safety: {
    label: "Safety note",
    className: "border-destructive-border/40 bg-destructive/10 text-foreground",
  },
  example: {
    label: "BlackPebble example",
    className: "border-border bg-surface-2 text-foreground",
  },
  beginner: {
    label: "Beginner tip",
    className: "border-accent/15 bg-accent/5 text-foreground",
  },
  advanced: {
    label: "Advanced note",
    className: "border-border bg-surface-2/80 text-muted-foreground",
  },
};

export function LessonCalloutBox({ callout }: { callout: LessonCallout }) {
  const style = CALLOUT_STYLES[callout.type];
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3 text-xs leading-relaxed",
        style.className,
      )}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {style.label}
      </div>
      <p>{callout.text}</p>
    </div>
  );
}

export function LessonBody({
  what,
  why,
  example,
  related,
  callout,
}: {
  what: string;
  why: string;
  example?: string;
  related?: { label: string; path: string };
  callout?: LessonCallout;
}) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
          What it means
        </div>
        <p>{what}</p>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
          Why it matters
        </div>
        <p>{why}</p>
      </div>
      {example ? (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
            Example
          </div>
          <p>{example}</p>
        </div>
      ) : null}
      {related ? (
        <div className="pt-0.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
            Related BlackPebble feature
          </div>
          <Link
            href={related.path}
            className="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent/80"
          >
            {related.label}
          </Link>
        </div>
      ) : null}
      {callout ? <LessonCalloutBox callout={callout} /> : null}
    </div>
  );
}
