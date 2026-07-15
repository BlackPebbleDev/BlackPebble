import { useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Maps a campaign type key to the third-party provider that actually fulfills
 * the service. Logos are served from locally stored, optimized assets in
 * /public/provider-logos (never hotlinked). If the official brand asset is not
 * present, the component gracefully falls back to the BlackPebble gold service
 * icon so nothing breaks and no lookalike/trademarked art is invented.
 */
export interface CampaignProvider {
  key: "dexscreener" | "dextools" | "community";
  label: string;
  /** Public path to the local logo asset, or null for the community icon. */
  logo: string | null;
}

export function providerForType(typeKey: string): CampaignProvider {
  if (typeKey.startsWith("dextools")) {
    return {
      key: "dextools",
      label: "DEXTools",
      logo: "/provider-logos/dextools.svg",
    };
  }
  if (typeKey.startsWith("dex_") || typeKey === "dex_listing") {
    return {
      key: "dexscreener",
      label: "DEX Screener",
      logo: "/provider-logos/dexscreener.svg",
    };
  }
  return { key: "community", label: "Community", logo: null };
}

/** Standard third-party disclosure shown near provider-branded services. */
export function providerDisclosure(label: string): string {
  return `Third-party service fulfilled through ${label}. BlackPebble is not affiliated with or endorsed by the provider.`;
}

interface ProviderLogoProps {
  typeKey: string;
  /** BlackPebble gold service icon used as the fallback / secondary mark. */
  fallbackIcon: ComponentType<{ className?: string }>;
  className?: string;
  /** Size in px for the rendered logo box. */
  size?: number;
}

/**
 * Renders the provider's official logo when the local asset loads, otherwise
 * the BlackPebble gold service icon. The provider logo makes the source
 * immediately recognizable; the gold icon remains the graceful fallback.
 */
export function ProviderLogo({
  typeKey,
  fallbackIcon: Fallback,
  className,
  size = 32,
}: ProviderLogoProps) {
  const provider = providerForType(typeKey);
  const [errored, setErrored] = useState(false);

  const box = (
    <div
      className={cn(
        "rounded-full bg-accent/12 flex items-center justify-center shrink-0 overflow-hidden",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {provider.logo && !errored ? (
        <img
          src={provider.logo}
          alt={`${provider.label} logo`}
          className="w-full h-full object-contain p-1"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      ) : (
        <Fallback className="w-1/2 h-1/2 text-accent" />
      )}
    </div>
  );

  return box;
}
