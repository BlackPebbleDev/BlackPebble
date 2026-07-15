import { describe, expect, it } from "vitest";
import {
  resolveGoalLamports,
  isValidDeadlineHours,
  DEADLINE_OPTIONS_HOURS,
  validateCampaignInput,
  getCampaignTypeDef,
} from "./campaign-math.js";
import { CampaignError, fail } from "./campaign-errors.js";

/**
 * Regression for the confirmed production creation failure.
 *
 * Root cause: the creation path fetched the SOL price with `.catch(() => 0)`
 * and then converted the USD goal to lamports. When the price feed was
 * unavailable (backend cold-start / upstream hiccup) the price was 0 and
 * `resolveGoalLamports` returned a generic 400 "SOL price unavailable" with no
 * code / stage / correlation id, so the user could not create a campaign and
 * had nothing actionable to report.
 *
 * Phase 2 fix: creation no longer depends on a live price (the SOL goal is
 * locked at activation), and every failure now returns a structured, retryable
 * error the client can surface with a correlation id.
 */
describe("creation failure regression: SOL price unavailable", () => {
  it("resolveGoalLamports rejects at a zero/missing price (the original bug)", () => {
    const r = resolveGoalLamports({
      typeKey: "dex_boost",
      goalUsd: 110,
      goalSol: null,
      solPriceUsd: 0,
    });
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toMatch(/SOL price unavailable/i);
  });

  it("resolves a valid lamport goal once a price is available", () => {
    const r = resolveGoalLamports({
      typeKey: "dex_boost",
      goalUsd: 110,
      goalSol: null,
      solPriceUsd: 150,
    });
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.lamports).toBeGreaterThan(0);
  });
});

describe("structured campaign errors", () => {
  it("PRICE_UNAVAILABLE is retryable and carries stage + correlation id", () => {
    const f = fail("PRICE_UNAVAILABLE", "pricing", "SOL price unavailable, try again shortly", true);
    expect(f.ok).toBe(false);
    const body = f.error.toResponse("corr-123");
    expect(body).toMatchObject({
      code: "PRICE_UNAVAILABLE",
      stage: "pricing",
      retryable: true,
      correlationId: "corr-123",
    });
    expect(body.error).not.toMatch(/stack|SQL|seed|secret/i);
  });

  it("input errors default to non-retryable with a safe message", () => {
    const e = new CampaignError({
      code: "INVALID_INPUT",
      stage: "validation",
      message: "Title must be 4-80 characters",
    });
    expect(e.retryable).toBe(false);
    expect(e.httpStatus).toBe(400);
    expect(e.toResponse("x").code).toBe("INVALID_INPUT");
  });
});

/**
 * Contract guardrails: the frontend "Review Campaign" gate (blackpebble
 * lib/campaign-form.ts) must accept exactly what these backend rules accept.
 * If these bounds change, the frontend constants must change in lockstep.
 */
describe("POST /campaigns contract bounds", () => {
  it("only 12 / 24 / 48 / 72 hour deadlines are accepted", () => {
    expect([...DEADLINE_OPTIONS_HOURS]).toEqual([12, 24, 48, 72]);
    for (const h of [12, 24, 48, 72]) expect(isValidDeadlineHours(h)).toBe(true);
    for (const h of [6, 36, 100, 336, 0, -1]) {
      expect(isValidDeadlineHours(h)).toBe(false);
    }
  });

  it("title 4-80 and brief 20-2000 are enforced with specific reasons", () => {
    const base = {
      typeKey: "dex_boost",
      goalLamports: 1_000_000_000, // 1 SOL, within the 0.1–10,000 SOL bounds
      durationSec: 24 * 3600,
    };
    expect(
      validateCampaignInput({ ...base, title: "abc", brief: "x".repeat(30) }),
    ).toMatch(/Title must be/i);
    expect(
      validateCampaignInput({ ...base, title: "Valid title", brief: "too short" }),
    ).toMatch(/Brief must be/i);
    expect(
      validateCampaignInput({
        ...base,
        title: "Valid title",
        brief: "x".repeat(25),
      }),
    ).toBeNull();
  });

  it("banner-required types are exactly the ones the UI marks as needing a banner", () => {
    const bannerTypes = ["dex_listing", "dextools_listing", "dextools_ads", "community_takeover"];
    for (const key of bannerTypes) {
      expect(getCampaignTypeDef(key)?.requiredAssets).toContain("banner");
    }
    // dex_boost and dextools_nitro do NOT need a banner.
    expect(getCampaignTypeDef("dex_boost")?.requiredAssets).not.toContain("banner");
    expect(getCampaignTypeDef("dextools_nitro")?.requiredAssets).not.toContain("banner");
  });

  it("every type requires a validated token", () => {
    for (const key of [
      "dex_listing",
      "dex_boost",
      "dex_ads",
      "dex_trending",
      "dextools_listing",
      "dextools_nitro",
      "dextools_ads",
      "community_takeover",
    ]) {
      expect(getCampaignTypeDef(key)?.requiresToken).toBe(true);
    }
  });
});
