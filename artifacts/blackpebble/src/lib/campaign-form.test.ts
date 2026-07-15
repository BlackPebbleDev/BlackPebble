import { describe, it, expect } from "vitest";
import {
  campaignFormIssues,
  issueForField,
  isValidCampaignDeadline,
  type CampaignFormState,
} from "./campaign-form";

/** A fully valid baseline; individual tests knock out one field at a time. */
function validState(over: Partial<CampaignFormState> = {}): CampaignFormState {
  return {
    hasType: true,
    requiresToken: true,
    requiresBanner: false,
    tierRequired: true,
    goalSelected: true,
    tokenValidated: true,
    tokenValid: true,
    tokenSafety: "safe",
    bannerUrl: "",
    title: "My Campaign",
    brief: "This brief is definitely long enough to pass validation cleanly.",
    durationHours: 24,
    loggedIn: true,
    ...over,
  };
}

describe("campaignFormIssues", () => {
  it("a fully valid form reaches Review with no issues", () => {
    expect(campaignFormIssues(validState())).toEqual([]);
  });

  it("no type selected short-circuits with a single missing issue", () => {
    const issues = campaignFormIssues(validState({ hasType: false }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: "type", kind: "missing" });
  });

  it("tier must be selected for multi-tier types", () => {
    const issues = campaignFormIssues(validState({ goalSelected: false }));
    expect(issueForField(issues, "tier")).toMatchObject({ kind: "missing" });
  });

  it("single-tier types do not require an explicit tier pick", () => {
    const issues = campaignFormIssues(
      validState({ tierRequired: false, goalSelected: true }),
    );
    expect(issueForField(issues, "tier")).toBeUndefined();
  });

  it("token must be validated when required", () => {
    const issues = campaignFormIssues(
      validState({ tokenValidated: false, tokenValid: false }),
    );
    expect(issueForField(issues, "token")).toMatchObject({ kind: "missing" });
  });

  it("dangerous tokens report an invalid reason", () => {
    const issues = campaignFormIssues(validState({ tokenSafety: "danger" }));
    expect(issueForField(issues, "token")).toMatchObject({ kind: "invalid" });
  });

  it("unrecognized tokens report an invalid reason", () => {
    const issues = campaignFormIssues(
      validState({ tokenValid: false, tokenSafety: "safe" }),
    );
    expect(issueForField(issues, "token")).toMatchObject({ kind: "invalid" });
  });

  it("token is not required when the type does not require it", () => {
    const issues = campaignFormIssues(
      validState({
        requiresToken: false,
        tokenValidated: false,
        tokenValid: false,
      }),
    );
    expect(issueForField(issues, "token")).toBeUndefined();
  });

  it("banner is required only when the type declares it", () => {
    expect(
      issueForField(
        campaignFormIssues(validState({ requiresBanner: true, bannerUrl: "" })),
        "banner",
      ),
    ).toMatchObject({ kind: "missing" });
    expect(
      issueForField(
        campaignFormIssues(
          validState({
            requiresBanner: true,
            bannerUrl: "https://cdn.example.com/banner.png",
          }),
        ),
        "banner",
      ),
    ).toBeUndefined();
  });

  it("invalid title reports the exact minimum reason", () => {
    const issues = campaignFormIssues(validState({ title: "ab" }));
    expect(issueForField(issues, "title")).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("at least 4"),
    });
  });

  it("missing title is distinguished from too-short", () => {
    const issues = campaignFormIssues(validState({ title: "   " }));
    expect(issueForField(issues, "title")).toMatchObject({ kind: "missing" });
  });

  it("invalid brief reports the reason and current length", () => {
    const issues = campaignFormIssues(validState({ brief: "too short" }));
    expect(issueForField(issues, "brief")).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("at least 20"),
    });
  });

  it("rejects unsupported durations and accepts the four supported ones", () => {
    expect(
      issueForField(campaignFormIssues(validState({ durationHours: 36 })), "duration"),
    ).toMatchObject({ kind: "invalid" });
    for (const h of [12, 24, 48, 72]) {
      expect(
        issueForField(campaignFormIssues(validState({ durationHours: h })), "duration"),
      ).toBeUndefined();
    }
  });

  it("requires an X-linked account", () => {
    const issues = campaignFormIssues(validState({ loggedIn: false }));
    expect(issueForField(issues, "auth")).toMatchObject({ kind: "auth" });
  });

  it("optional link never appears as an issue (it is not part of the state)", () => {
    // The link field is genuinely optional and is not represented here, so a
    // valid form with no link produces zero issues.
    expect(campaignFormIssues(validState())).toEqual([]);
  });

  it("issues are ordered top-to-bottom by field position", () => {
    const issues = campaignFormIssues(
      validState({
        goalSelected: false,
        tokenValidated: false,
        tokenValid: false,
        title: "",
        brief: "",
        durationHours: 999,
        loggedIn: false,
      }),
    );
    const order = issues.map((i) => i.field);
    expect(order).toEqual([
      "tier",
      "token",
      "title",
      "brief",
      "duration",
      "auth",
    ]);
  });
});

describe("isValidCampaignDeadline", () => {
  it("matches the backend deadline contract", () => {
    expect([12, 24, 48, 72].every(isValidCampaignDeadline)).toBe(true);
    expect([6, 36, 100, 336, 0].some(isValidCampaignDeadline)).toBe(false);
  });
});
