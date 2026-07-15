import { describe, expect, it } from "vitest";
import { resolveGoalLamports } from "./campaign-math.js";
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
