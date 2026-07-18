import { DiagramFrame } from "./diagram-frame";
import { DIAGRAM_LIBRARY } from "./library";
import type { LessonDiagramId, LessonDiagramRef } from "@/lib/education/diagrams";

export { DiagramFrame } from "./diagram-frame";

export function hasDiagram(id: string): id is LessonDiagramId {
  return Object.prototype.hasOwnProperty.call(DIAGRAM_LIBRARY, id);
}

export function diagramIds(): LessonDiagramId[] {
  return Object.keys(DIAGRAM_LIBRARY) as LessonDiagramId[];
}

/**
 * Renders a single lesson diagram by id inside the shared frame. Motion is
 * enabled by the diagram's own `animated` flag and further gated by
 * prefers-reduced-motion in CSS, so nothing moves for users who opt out.
 * Unknown ids render nothing (validated away by content tests, but safe at
 * runtime).
 */
export function LessonDiagram({
  diagram,
  className,
}: {
  diagram: LessonDiagramRef;
  className?: string;
}) {
  if (!hasDiagram(diagram.id)) return null;
  const entry = DIAGRAM_LIBRARY[diagram.id];
  const Component = entry.Component;
  return (
    <DiagramFrame
      title={entry.title}
      caption={diagram.caption ?? entry.caption}
      className={className}
      testId={`diagram-${diagram.id}`}
    >
      <Component animated={entry.animated} />
    </DiagramFrame>
  );
}
