import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for every Academy diagram: a framed, captioned figure with a
 * consistent aspect box. Diagrams draw into a 0 0 320 180 viewBox so they scale
 * crisply on any screen. The caption doubles as the accessible label, so a
 * concept is understandable without reading the surrounding prose.
 */
export function DiagramFrame({
  title,
  caption,
  children,
  className,
  testId,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-2xl border border-border/60 bg-card/60",
        className,
      )}
      data-testid={testId}
    >
      <div className="bg-surface-2/40 px-3 pt-3">
        <svg
          viewBox="0 0 320 180"
          role="img"
          aria-label={caption ? `${title}. ${caption}` : title}
          className="h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {children}
        </svg>
      </div>
      {caption ? (
        <figcaption className="border-t border-border/60 px-3.5 py-2 text-xs leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Small helper: a labelled text node with consistent typography for diagrams. */
export function DiagramLabel({
  x,
  y,
  children,
  anchor = "middle",
  className = "text-muted-foreground",
  size = 11,
  weight = 600,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: "start" | "middle" | "end";
  className?: string;
  size?: number;
  weight?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={className}
      fill="currentColor"
      fontSize={size}
      fontWeight={weight}
      style={{ fontFamily: "var(--app-font-sans, inherit)" }}
    >
      {children}
    </text>
  );
}
