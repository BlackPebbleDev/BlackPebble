import {
  AlertTriangle,
  BarChart3,
  Compass,
  HandCoins,
  Link2,
  MessageCircle,
  Rocket,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { CategoryIcon } from "@/lib/education/types";

export const CATEGORY_ICONS: Record<CategoryIcon, LucideIcon> = {
  compass: Compass,
  trending: TrendingUp,
  "bar-chart": BarChart3,
  shield: Shield,
  link: Link2,
  wallet: Wallet,
  rocket: Rocket,
  alert: AlertTriangle,
  sparkles: Sparkles,
  users: Users,
  "hand-coins": HandCoins,
  message: MessageCircle,
};

export function CategoryGlyph({
  icon,
  className,
}: {
  icon: CategoryIcon;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[icon];
  return <Icon className={className} aria-hidden />;
}
