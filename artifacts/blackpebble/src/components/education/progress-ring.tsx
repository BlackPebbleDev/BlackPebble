import { cn } from "@/lib/utils";

/**
 * Compact circular progress indicator used across Academy surfaces (lesson right
 * rail, journey map, path header). Pure SVG, theme-aware, and animated only via
 * a CSS transition that respects reduced motion.
 */
export function ProgressRing({
  value,
  size = 44,
  stroke = 4,
  label,
  className,
  tone = "accent",
}: {
  /** 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
  tone?: "accent" | "success";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const toneClass = tone === "success" ? "text-success" : "text-accent";
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${clamped}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="text-border"
          stroke="currentColor"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn(toneClass, "transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none")}
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-foreground">
        {clamped}%
      </span>
    </div>
  );
}
