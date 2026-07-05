import {
  Crown,
  Shield,
  Sparkles,
  BadgeCheck,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfficialBadgeType } from "@/lib/api";

/**
 * Role badges - an independent identity axis. A user may hold any number of
 * these at once and they render in a fixed priority order (see ROLE_ORDER). This
 * is the single source of truth for role-badge display: icon, labels and tone.
 * Adding a new role is just another entry here (plus the server union).
 */
interface RoleMeta {
  /** Full label (md size + tooltips). */
  label: string;
  /** Compact label for the sm pill on dense surfaces. */
  short: string;
  /** Longer tooltip used on the md pill. */
  full: string;
  Icon: LucideIcon;
  /** Icon-only color (xs). */
  iconColor: string;
  /** Pill classes (bg + border + text) for sm/md. */
  chip: string;
  /** Optional glow added on the md pill. */
  glow?: string;
}

export const ROLE_META: Record<OfficialBadgeType, RoleMeta> = {
  founder: {
    label: "Founder",
    short: "Founder",
    full: "BlackPebble Founder",
    Icon: Crown,
    iconColor: "text-amber-400",
    chip: "bg-amber-950/60 border-amber-500/50 text-amber-400",
    glow: "shadow-[0_0_10px_rgba(245,158,11,0.15)]",
  },
  bp_team: {
    label: "BlackPebble Team",
    short: "BP Team",
    full: "Official BlackPebble Team Member",
    Icon: Shield,
    iconColor: "text-zinc-400",
    chip: "bg-zinc-800/70 border-zinc-600/50 text-zinc-300",
  },
  ambassador: {
    label: "Ambassador",
    short: "Ambassador",
    full: "BlackPebble Community Ambassador",
    Icon: Megaphone,
    iconColor: "text-violet-300",
    chip: "bg-violet-950/50 border-violet-600/40 text-violet-300",
  },
  verified_trader: {
    label: "Verified Trader",
    short: "Verified",
    full: "Identity-verified trader",
    Icon: BadgeCheck,
    iconColor: "text-sky-300",
    chip: "bg-sky-950/50 border-sky-600/40 text-sky-300",
  },
  early_user: {
    label: "Early User",
    short: "Early",
    full: "Recognized early supporter of BlackPebble",
    Icon: Sparkles,
    iconColor: "text-teal-300",
    chip: "bg-teal-950/50 border-teal-600/40 text-teal-300",
  },
};

/**
 * Fixed render priority - highest-status roles lead and are never dropped first
 * when horizontal space is tight. Shared with UserIdentity's ordering and the
 * admin assignment UI so roles stay consistent everywhere.
 */
export const ROLE_ORDER: OfficialBadgeType[] = [
  "founder",
  "bp_team",
  "ambassador",
  "verified_trader",
  "early_user",
];

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
  const meta = ROLE_META[type];
  if (!meta) return null;
  const { Icon } = meta;

  if (size === "xs") {
    return (
      <span
        title={meta.label}
        aria-label={meta.label}
        data-testid={`official-badge-${type}`}
        className={cn(
          "inline-flex items-center justify-center flex-shrink-0",
          meta.iconColor,
          className,
        )}
      >
        <Icon className="w-3 h-3" />
      </span>
    );
  }

  if (size === "sm") {
    return (
      <span
        title={meta.full}
        data-testid={`official-badge-${type}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide border whitespace-nowrap",
          meta.chip,
          className,
        )}
      >
        <Icon className="w-2.5 h-2.5 flex-shrink-0" />
        {meta.short}
      </span>
    );
  }

  return (
    <span
      title={meta.full}
      data-testid={`official-badge-${type}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide border whitespace-nowrap",
        meta.chip,
        meta.glow,
        className,
      )}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      {meta.label}
    </span>
  );
}
