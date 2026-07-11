import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Sparkles,
  Brain,
  HandCoins,
  Target,
} from "lucide-react";

/**
 * Shared Utilities catalogue — single source of truth for landing-card icons
 * and utility subpage title icons, so the section reads as one polished system.
 */
export type UtilityKey =
  | "journal"
  | "wallet_cleanup"
  | "trading_analysis"
  | "campaigns"
  | "trade_planner";

export type UtilityFlag =
  | "real_trading_analysis"
  | "community_campaigns"
  | "experimental_utilities";

export interface UtilityMeta {
  key: UtilityKey;
  title: string;
  /** Landing-card blurb (also the default subpage subtitle). */
  description: string;
  href: string;
  icon: LucideIcon;
  /** When set, the landing card is gated by this feature flag. */
  flag?: UtilityFlag;
  testId: string;
}

export const UTILITIES: UtilityMeta[] = [
  {
    key: "journal",
    title: "Trading Journal",
    description:
      "Record trade reviews, track your emotions and lessons, and improve your decisions over time.",
    href: "/utilities/journal",
    icon: BookOpen,
    testId: "link-trading-journal",
  },
  {
    key: "wallet_cleanup",
    title: "Wallet Cleanup",
    description:
      "See every token, spot scams and inflated value, reclaim trapped SOL, and burn junk - safely.",
    href: "/utilities/sol-recovery",
    icon: Sparkles,
    testId: "link-wallet-cleaner",
  },
  {
    key: "trading_analysis",
    title: "Trading Analysis",
    description:
      "Read-only intelligence from your real on-chain history - trader DNA, signals, insights, and milestones.",
    href: "/utilities/trading-analysis",
    icon: Brain,
    flag: "real_trading_analysis",
    testId: "link-trading-analysis",
  },
  {
    key: "campaigns",
    title: "Community Campaigns",
    description:
      "Escrow-backed community funding with a fully public money trail - automatic refunds if goals aren't met.",
    href: "/campaigns",
    // HandCoins = community funding / contribution (transparent contribution campaigns).
    icon: HandCoins,
    flag: "community_campaigns",
    testId: "link-campaigns",
  },
  {
    key: "trade_planner",
    title: "Trade Planner",
    description:
      "Plan entries, targets, stops, position size, risk, and profit scenarios before taking a trade.",
    href: "/utilities/trade-planner",
    icon: Target,
    flag: "experimental_utilities",
    testId: "link-trade-planner",
  },
];

export function getUtility(key: UtilityKey): UtilityMeta {
  const u = UTILITIES.find((x) => x.key === key);
  if (!u) throw new Error(`Unknown utility: ${key}`);
  return u;
}
