import * as React from "react";
import {
  Coins,
  ShoppingCart,
  Banknote,
  Target,
  TrendingDown,
  AlertTriangle,
  Medal,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { toast, type ToastChip } from "@/hooks/use-toast";
import type { ToastVariant } from "@/components/ui/toast";
import { pushNotification } from "@/lib/notifications-store";

/**
 * Activity toast adapter (Phase 3A/3B).
 *
 * The ONE place that turns a typed BlackPebble activity into a premium toast —
 * it extends the shared toast() system (same dark-glass base), it is NOT a
 * separate visual system. Each `ActivityToastKind` maps to a semantic accent
 * variant + status icon; callers supply real, already-available copy/chips.
 *
 * Every activity toast is ALSO eligible to become a notification-center item
 * (localStorage, Phase 3B) unless `notify: false`. Deduped by sourceActivityId.
 *
 * Scope: ME-scoped only (my trade executions, my fills, my milestones). Nothing
 * here fires for global/follower feed activity — no per-reaction/per-global spam.
 */

export type ActivityToastKind =
  | "spot_buy"
  | "spot_sell"
  | "buy_fill"
  | "tp_hit"
  | "sl_hit"
  | "liquidation"
  | "tier_upgrade"
  | "achievement";

export const KIND_STYLE: Record<
  ActivityToastKind,
  { variant: ToastVariant; icon: LucideIcon }
> = {
  spot_buy: { variant: "positive", icon: ShoppingCart },
  spot_sell: { variant: "exit", icon: Banknote },
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
  /** Originating activity id for notification dedupe across refresh. */
  sourceActivityId?: string | null;
  /** Optional in-app link target for the notification "View" affordance. */
  href?: string | null;
  /** When false, show the toast but do NOT create a notification item. */
  notify?: boolean;
}

/** Show a premium, typed activity toast (and, by default, log a notification). */
export function activityToast(input: ActivityToastInput) {
  const style = KIND_STYLE[input.kind];
  const Icon = style.icon;
  const handle = toast({
    variant: style.variant,
    icon: <Icon className="h-4 w-4" />,
    title: input.title,
    description: input.description,
    chips: input.chips,
    tokenLogo: input.tokenLogo ?? undefined,
    pfp: input.pfp ?? undefined,
    duration: input.duration ?? 6000,
  });

  if (input.notify !== false) {
    pushNotification({
      kind: input.kind,
      title: input.title,
      description: input.description,
      chips: input.chips,
      tokenSymbol: null,
      tokenLogo: input.tokenLogo ?? null,
      pfp: input.pfp ?? null,
      href: input.href ?? null,
      sourceActivityId: input.sourceActivityId ?? null,
    });
  }

  return handle;
}
