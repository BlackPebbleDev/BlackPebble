import { describe, expect, it } from "vitest";
import {
  nextIntentAction,
  operationKey,
} from "./campaign-transfer-intents.pure.js";

describe("operationKey", () => {
  it("is deterministic for the same logical transfer", () => {
    const a = operationKey({ kind: "payout", campaignId: 7, purpose: "payout" });
    const b = operationKey({ kind: "payout", campaignId: 7, purpose: "payout" });
    expect(a).toBe(b);
    expect(a).toBe("payout:7");
  });
  it("differs per campaign and purpose", () => {
    expect(operationKey({ kind: "fee", campaignId: 7, purpose: "platform_fee" })).toBe(
      "platform_fee:7",
    );
    expect(
      operationKey({ kind: "refund", campaignId: 7, purpose: "excess", contributionId: 42 }),
    ).toBe("excess:7:42");
    expect(
      operationKey({ kind: "refund", campaignId: 7, purpose: "failure", contributionId: 42 }),
    ).toBe("failure:7:42");
  });
  it("keeps per-contribution refunds unique", () => {
    const one = operationKey({ kind: "refund", campaignId: 1, purpose: "failure", contributionId: 1 });
    const two = operationKey({ kind: "refund", campaignId: 1, purpose: "failure", contributionId: 2 });
    expect(one).not.toBe(two);
  });
});

describe("nextIntentAction", () => {
  it("never resends a recorded transfer", () => {
    expect(nextIntentAction("recorded", true)).toBe("done");
    expect(nextIntentAction("recorded", false)).toBe("done");
  });
  it("verifies on-chain before resending a submitted/confirmed transfer", () => {
    expect(nextIntentAction("submitted", true)).toBe("verify");
    expect(nextIntentAction("confirmed", true)).toBe("verify");
  });
  it("sends when planned or when no signature was ever persisted", () => {
    expect(nextIntentAction("planned", false)).toBe("send");
    expect(nextIntentAction("submitted", false)).toBe("send");
    expect(nextIntentAction("signing", false)).toBe("send");
  });
  it("verifies a signing intent that did persist a signature (crash mid-sign)", () => {
    expect(nextIntentAction("signing", true)).toBe("verify");
  });
  it("allows a fresh attempt only after definitive failure", () => {
    expect(nextIntentAction("failed", false)).toBe("abandon");
  });
  it("never auto-resends an intent under manual review", () => {
    expect(nextIntentAction("manual_review", true)).toBe("done");
  });
});
