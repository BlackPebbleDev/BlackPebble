import { useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
  providerForTypeKey,
  serviceBrand,
  type ProviderBrand,
} from "@/lib/provider-branding";

/**
 * Renders a provider's official logo when a locally stored, licensed asset
 * loads; otherwise falls back to the service icon on the provider accent. All
 * provider identity comes from lib/provider-branding.ts — this component only
 * handles presentation. No lookalike/trademarked art is ever fabricated.
 */

/** Standard third-party disclosure for a campaign type. */
export function providerDisclosure(typeKey: string): string {
  return providerForTypeKey(typeKey).disclaimer;
}

interface ProviderLogoProps {
  typeKey: string;
  /** Optional explicit fallback icon; defaults to the service icon. */
  fallbackIcon?: ComponentType<{ className?: string }>;
  className?: string;
  /** Size in px for the rendered logo box. */
  size?: number;
}

export function ProviderLogo({
  typeKey,
  fallbackIcon,
  className,
  size = 32,
}: ProviderLogoProps) {
  const provider: ProviderBrand = providerForTypeKey(typeKey);
  const service = serviceBrand(typeKey);
  const Fallback = fallbackIcon ?? service.icon;
  const [errored, setErrored] = useState(false);
  const showLogo = provider.logo && provider.logoLicensed && !errored;

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0 overflow-hidden",
        provider.accentBg,
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showLogo ? (
        <img
          src={provider.logo!}
          alt={`${provider.name} logo`}
          className="w-full h-full object-contain p-1"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      ) : (
        <Fallback className={cn("w-1/2 h-1/2", provider.accentText)} />
      )}
    </div>
  );
}
