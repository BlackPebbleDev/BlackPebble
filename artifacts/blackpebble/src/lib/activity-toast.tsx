import * as React from "react";
import {
  Coins,
  Target,
  TrendingDown,
  AlertTriangle,
  Medal,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { toast, type ToastChip } from "@/hooks/use-toast";
import type { ToastVariant } from "@/components/ui/toast";

/**
 * Activity toast adapter (Phase 3A).
 *
 * The ONE place that turns a typed BlackPebble activity into a premium toast.
 * It extends the shared toast() system (same dark-glass base) — it is NOT a
 * separate visual system. Each `ActivityToastKind` maps to a semantic accent
 * variant + status icon; callers supply the real, already-available copy/chips.
 *
 * First pass is ME-scoped only (my fills + my milestones); nothing here fires
 * for global/follower activity, and no per-reaction / per-buy spam.
 */

export type ActivityToastKind =
  | "buy_fill"
  | "tp_hit"
  | "sl_hit"
  | "liquidation"
  | "tier_upgrade"
  | "achievement";

const KIND_STYLE: Record<
  ActivityToastKind,
  { variant: ToastVariant; icon: LucideIcon }
> = {
  buy_fill: { variant: "positive", icon: Coins },
  tp_hit: { variant: "profit", icon: Target },
  sl_hit: { variant: "loss", icon: TrendingDown },
  liquidation: { variant: "critical", icon: AlertTriangle },
  tier_upgrade: { variant: "reputation", icon: Medal },
  achievement: { variant: "reputation", icon: Trophy },
};

export interface ActivityToastInput {
  kind: ActivityToastKind;
  title: string;
  description?: string;
  chips?: ToastChip[];
  /** Token logo (trade toasts). */
  tokenLogo?: string | null;
  /** Sender avatar (social/reputation toasts). */
  pfp?: string | null;
  /** Auto-dismiss ms (Radix duration). Defaults to a calm 6s. */
  duration?: number;
}

/** Show a premium, typed activity toast via the shared toast system. */
export function activityToast(input: ActivityToastInput) {
  const style = KIND_STYLE[input.kind];
  const Icon = style.icon;
  return toast({
    variant: style.variant,
    icon: <Icon className="h-4 w-4" />,
    title: input.title,
    description: input.description,
    chips: input.chips,
    tokenLogo: input.tokenLogo ?? undefined,
    pfp: input.pfp ?? undefined,
    duration: input.duration ?? 6000,
  });
}
