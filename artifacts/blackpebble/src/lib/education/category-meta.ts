import type { CategoryLevel } from "./types";

/**
 * Presentation metadata for categories (short description + primary experience
 * level), kept centrally so the homepage "browse by topic / by level" surfaces
 * work without editing all 12 category content files. Merged into the category
 * objects by the registry.
 */
export interface CategoryMeta {
  description: string;
  level: CategoryLevel;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  "start-here": {
    description: "New to BlackPebble or crypto? Begin with the essentials.",
    level: "beginner",
  },
  "trading-basics": {
    description: "Core trading concepts every trader should understand.",
    level: "beginner",
  },
  "market-data": {
    description: "Read price, market cap, liquidity, and token metrics with confidence.",
    level: "beginner",
  },
  "orders-risk": {
    description: "Orders, position sizing, and risk management fundamentals.",
    level: "intermediate",
  },
  "solana-basics": {
    description: "How Solana works: accounts, fees, rent, and transactions.",
    level: "beginner",
  },
  "wallets-safety": {
    description: "Protect your wallet, keys, and transactions from common threats.",
    level: "beginner",
  },
  "memecoin-markets": {
    description: "How memecoin markets, launches, and liquidity really behave.",
    level: "intermediate",
  },
  "scam-awareness": {
    description: "Recognize rugs, honeypots, and drainers before they cost you.",
    level: "intermediate",
  },
  "blackpebble-features": {
    description: "Get the most from BlackPebble's trading and wallet tools.",
    level: "beginner",
  },
  "social-reputation": {
    description: "Profiles, reputation, and the BlackPebble social layer.",
    level: "intermediate",
  },
  "developer-campaigns": {
    description: "Developer insights and community funding campaigns.",
    level: "advanced",
  },
  "crypto-slang": {
    description: "Plain-English definitions for common crypto and degen slang.",
    level: "beginner",
  },
};
