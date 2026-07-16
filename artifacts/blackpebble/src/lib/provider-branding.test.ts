import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  SERVICES,
  providerBrand,
  providerForTypeKey,
  serviceBrand,
} from "./provider-branding";

describe("provider-branding config", () => {
  it("maps every DEX Screener service to the dexscreener provider", () => {
    for (const key of ["dex_listing", "dex_boost", "dex_ads", "dex_trending"]) {
      expect(serviceBrand(key).provider).toBe("dexscreener");
      expect(providerForTypeKey(key).name).toBe("DEX Screener");
    }
  });

  it("maps every DEXTools service to the dextools provider", () => {
    for (const key of ["dextools_listing", "dextools_nitro", "dextools_ads"]) {
      expect(serviceBrand(key).provider).toBe("dextools");
      expect(providerForTypeKey(key).name).toBe("DEXTools");
    }
  });

  it("maps community takeover to the community provider", () => {
    expect(serviceBrand("community_takeover").provider).toBe("community");
    expect(providerForTypeKey("community_takeover").name).toBe("Community");
  });

  it("falls back to a safe community brand for unknown type keys", () => {
    const svc = serviceBrand("totally_unknown_type");
    expect(svc.provider).toBe("community");
    expect(providerForTypeKey("totally_unknown_type").name).toBe("Community");
  });

  it("every provider exposes required branding fields + a disclaimer", () => {
    for (const brand of Object.values(PROVIDERS)) {
      expect(brand.name).toBeTruthy();
      expect(brand.accentText).toMatch(/^text-/);
      expect(brand.accentBg).toMatch(/^bg-/);
      expect(brand.accentGlow).toContain("ring");
      expect(brand.disclaimer.length).toBeGreaterThan(10);
      // A bundled logo must never be marked usable unless a path exists.
      if (brand.logoLicensed && brand.logo === null) {
        // community has no external logo — that's allowed.
        expect(brand.key).toBe("community");
      }
    }
  });

  it("does not present unlicensed third-party logos as usable", () => {
    // DEX Screener / DEXTools official marks are not yet licensed for bundling.
    expect(providerBrand("dexscreener").logoLicensed).toBe(false);
    expect(providerBrand("dextools").logoLicensed).toBe(false);
  });

  it("every service icon is a renderable component", () => {
    for (const svc of Object.values(SERVICES)) {
      expect(["function", "object"]).toContain(typeof svc.icon);
      expect(svc.short).toBeTruthy();
    }
  });
});
