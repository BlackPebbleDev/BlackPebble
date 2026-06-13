import { Crown, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfficialBadgeType } from "@/lib/api";

interface OfficialBadgeProps {
  type: OfficialBadgeType;
  /** xs = icon-only with tooltip (for dense surfaces like feed cards) */
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function OfficialBadge({
  type,
  size = "md",
  className,
}: OfficialBadgeProps) {
  const isFounder = type === "founder";

  if (size === "xs") {
    return (
      <span
        title={isFounder ? "Founder" : "BlackPebble Team"}
        aria-label={isFounder ? "Founder" : "BlackPebble Team"}
        className={cn(
          "inline-flex items-center justify-center flex-shrink-0",
          isFounder ? "text-amber-400" : "text-zinc-400",
          className,
        )}
      >
        {isFounder ? (
          <Crown className="w-3 h-3" />
        ) : (
          <Shield className="w-3 h-3" />
        )}
      </span>
    );
  }

  if (size === "sm") {
    return (
      <span
        title={isFounder ? "Founder" : "BlackPebble Team"}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide border whitespace-nowrap",
          isFounder
            ? "bg-amber-950/60 border-amber-500/50 text-amber-400"
            : "bg-zinc-800/70 border-zinc-600/50 text-zinc-300",
          className,
        )}
      >
        {isFounder ? (
          <Crown className="w-2.5 h-2.5 flex-shrink-0" />
        ) : (
          <Shield className="w-2.5 h-2.5 flex-shrink-0" />
        )}
        {isFounder ? "Founder" : "BP Team"}
      </span>
    );
  }

  return (
    <span
      title={
        isFounder
          ? "BlackPebble Founder"
          : "Official BlackPebble Team Member"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide border whitespace-nowrap",
        isFounder
          ? "bg-amber-950/60 border-amber-500/50 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
          : "bg-zinc-800/70 border-zinc-600/50 text-zinc-300",
        className,
      )}
    >
      {isFounder ? (
        <Crown className="w-3 h-3 flex-shrink-0" />
      ) : (
        <Shield className="w-3 h-3 flex-shrink-0" />
      )}
      {isFounder ? "Founder" : "BlackPebble Team"}
    </span>
  );
}
