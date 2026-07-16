import {
  BadgeCheck,
  Flame,
  HandCoins,
  LineChart,
  Megaphone,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Centralized provider + service branding for Community Campaigns.
 *
 * This is the SINGLE source of truth for how every campaign provider and
 * service is presented: name, logo, accent color, icon, description, and legal
 * disclaimer. Nothing about provider identity should be hardcoded in
 * components — resolve it from here via `serviceBrand(typeKey)` /
 * `providerBrand(key)` so future providers require only a config entry.
 *
 * Trademark note: official provider logos are only rendered when a locally
 * stored, licensed asset exists at the `logo` path. When it does not, the UI
 * falls back to the service icon on the provider accent — we never fabricate
 * or recolor a trademarked logo. `logoLicensed: false` flags assets still
 * pending licensing so they can be tracked centrally.
 */

export type ProviderKey = "dexscreener" | "dextools" | "community";

export interface ProviderBrand {
  key: ProviderKey;
  name: string;
  /** Public path to a locally stored official logo, or null if none bundled. */
  logo: string | null;
  /** Whether the bundled logo is confirmed licensed for use. */
  logoLicensed: boolean;
  /** Tailwind text color class for provider accent. */
  accentText: string;
  /** Tailwind background tint class for chips/badges. */
  accentBg: string;
  /** Tailwind border class for selected/emphasis states. */
  accentBorder: string;
  /** Tailwind ring/glow class applied to a selected card. */
  accentGlow: string;
  description: string;
  disclaimer: string;
}

export const PROVIDERS: Record<ProviderKey, ProviderBrand> = {
  dexscreener: {
    key: "dexscreener",
    name: "DEX Screener",
    logo: "/provider-logos/dexscreener.svg",
    logoLicensed: false,
    accentText: "text-amber-300",
    accentBg: "bg-amber-400/12",
    accentBorder: "border-amber-400/50",
    accentGlow: "ring-2 ring-amber-400/40 shadow-[0_0_24px_-6px_rgba(251,191,36,0.55)]",
    description:
      "Boosts, Enhanced Token Info listings, trending placement, and display ads on DEX Screener.",
    disclaimer:
      "Third-party service fulfilled through DEX Screener. BlackPebble is not affiliated with or endorsed by the provider.",
  },
  dextools: {
    key: "dextools",
    name: "DEXTools",
    logo: "/provider-logos/dextools.svg",
    logoLicensed: false,
    accentText: "text-sky-300",
    accentBg: "bg-sky-400/12",
    accentBorder: "border-sky-400/50",
    accentGlow: "ring-2 ring-sky-400/40 shadow-[0_0_24px_-6px_rgba(56,189,248,0.55)]",
    description:
      "Fast Track listings, NITRO visibility packs, and banner ads on DEXTools.",
    disclaimer:
      "Third-party service fulfilled through DEXTools. BlackPebble is not affiliated with or endorsed by the provider.",
  },
  community: {
    key: "community",
    name: "Community",
    logo: null,
    logoLicensed: true,
    accentText: "text-purple-300",
    accentBg: "bg-purple-400/12",
    accentBorder: "border-purple-400/50",
    accentGlow:
      "ring-2 ring-purple-400/40 shadow-[0_0_24px_-6px_rgba(192,132,252,0.55)]",
    description:
      "Community-run takeovers for abandoned tokens: new socials, listings, and momentum.",
    disclaimer:
      "Community-coordinated campaign fulfilled by BlackPebble operators with public proof.",
  },
};

export interface ServiceBrand {
  provider: ProviderKey;
  /** Icon representing the specific service (not the provider). */
  icon: LucideIcon;
  /** Short label for compact chips, e.g. "Boost". */
  short: string;
}

/**
 * Per-campaign-type service branding, keyed by the backend type key. Adding a
 * new service is a single entry here plus its backend CampaignTypeDef.
 */
export const SERVICES: Record<string, ServiceBrand> = {
  dex_listing: { provider: "dexscreener", icon: BadgeCheck, short: "Listing" },
  dex_boost: { provider: "dexscreener", icon: Zap, short: "Boost" },
  dex_ads: { provider: "dexscreener", icon: Megaphone, short: "Ads" },
  dex_trending: { provider: "dexscreener", icon: TrendingUp, short: "Trending" },
  dextools_listing: { provider: "dextools", icon: BadgeCheck, short: "Listing" },
  dextools_nitro: { provider: "dextools", icon: Flame, short: "Nitro" },
  dextools_ads: { provider: "dextools", icon: Megaphone, short: "Ads" },
  community_takeover: { provider: "community", icon: Users, short: "Takeover" },
  // Legacy fallbacks so old campaigns still render sensibly.
  listing: { provider: "dexscreener", icon: BadgeCheck, short: "Listing" },
  marketing: { provider: "dexscreener", icon: Megaphone, short: "Ads" },
  community_event: { provider: "community", icon: HandCoins, short: "Community" },
  other: { provider: "community", icon: LineChart, short: "Campaign" },
};

const FALLBACK_SERVICE: ServiceBrand = {
  provider: "community",
  icon: Megaphone,
  short: "Campaign",
};

export function serviceBrand(typeKey: string): ServiceBrand {
  return SERVICES[typeKey] ?? FALLBACK_SERVICE;
}

export function providerBrand(key: ProviderKey): ProviderBrand {
  return PROVIDERS[key];
}

/** Convenience: resolve the provider brand directly from a campaign type key. */
export function providerForTypeKey(typeKey: string): ProviderBrand {
  return PROVIDERS[serviceBrand(typeKey).provider];
}
