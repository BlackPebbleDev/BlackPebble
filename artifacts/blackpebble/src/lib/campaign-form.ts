/**
 * Pure validation for the Community Campaign creation form.
 *
 * This mirrors the backend POST /campaigns contract (see api-server
 * campaign-math.ts / campaign-engine.ts) exactly so the "Review Campaign"
 * gate never disagrees with what the server will accept:
 *   - title  4–80 chars
 *   - brief  20–2000 chars
 *   - deadline strictly one of 12 / 24 / 48 / 72 hours
 *   - banner required when the type declares a "banner" asset
 *   - a validated (non-danger, recognized) token when the type requires one
 *   - a selected goal tier
 *   - an X-linked BlackPebble account
 *
 * Keeping this as a pure function (no React) lets us unit test every branch
 * and drive both the inline field messages and the "Complete these items"
 * summary from a single source of truth.
 */

export const CAMPAIGN_TITLE_MIN = 4;
export const CAMPAIGN_TITLE_MAX = 80;
export const CAMPAIGN_BRIEF_MIN = 20;
export const CAMPAIGN_BRIEF_MAX = 2000;
/** Banner URLs must be more than 8 chars (a bare "http://x" is meaningless). */
export const CAMPAIGN_BANNER_MIN = 9;
/** Supported deadlines, must match backend DEADLINE_OPTIONS_HOURS. */
export const CAMPAIGN_DEADLINE_OPTIONS = [12, 24, 48, 72] as const;
export type CampaignDeadlineHours = (typeof CAMPAIGN_DEADLINE_OPTIONS)[number];

export function isValidCampaignDeadline(hours: number): boolean {
  return (CAMPAIGN_DEADLINE_OPTIONS as readonly number[]).includes(hours);
}

/** Which UI field an issue belongs to (drives scroll/focus + inline message). */
export type CampaignField =
  | "type"
  | "tier"
  | "token"
  | "banner"
  | "title"
  | "brief"
  | "duration"
  | "auth";

/**
 * Category of problem, so the UI can phrase it correctly rather than showing a
 * single generic "invalid" message:
 *  - missing:     required input not provided yet
 *  - invalid:     provided but out of bounds / rejected
 *  - auth:        authentication / account-link requirement
 *  - eligibility: creator is not allowed (e.g. already has an active campaign)
 *  - config:      pricing / config / quote not available
 */
export type CampaignIssueKind =
  | "missing"
  | "invalid"
  | "auth"
  | "eligibility"
  | "config";

export interface CampaignFormIssue {
  field: CampaignField;
  kind: CampaignIssueKind;
  message: string;
}

export interface CampaignFormState {
  /** Whether a campaign type/service has been chosen. */
  hasType: boolean;
  requiresToken: boolean;
  requiresBanner: boolean;
  /** True when the type has more than one goal tier and none is picked yet. */
  tierRequired: boolean;
  goalSelected: boolean;
  /** Token validation state (only meaningful when requiresToken). */
  tokenValidated: boolean;
  tokenValid: boolean;
  /** Raw safety verdict; only "danger" hard-blocks a campaign. */
  tokenSafety: string | null;
  bannerUrl: string;
  title: string;
  brief: string;
  /** Raw duration in hours (already coerced to a number by the caller). */
  durationHours: number;
  /** Whether the creator has an X-linked BlackPebble account. */
  loggedIn: boolean;
}

/**
 * Returns the ordered list of blocking issues (empty === ready to review).
 * Order follows the visual top-to-bottom field order so "scroll to first
 * invalid" lands on the highest field.
 */
export function campaignFormIssues(
  s: CampaignFormState,
): CampaignFormIssue[] {
  const issues: CampaignFormIssue[] = [];

  if (!s.hasType) {
    issues.push({
      field: "type",
      kind: "missing",
      message: "Choose a campaign service to continue.",
    });
    // Nothing else can be validated without a type.
    return issues;
  }

  if (s.tierRequired && !s.goalSelected) {
    issues.push({
      field: "tier",
      kind: "missing",
      message: "Select a funding tier.",
    });
  }

  if (s.requiresToken) {
    if (!s.tokenValidated) {
      issues.push({
        field: "token",
        kind: "missing",
        message: "Enter your token contract address and press Validate.",
      });
    } else if (s.tokenSafety === "danger") {
      issues.push({
        field: "token",
        kind: "invalid",
        message: "This token failed the safety scan and can't be campaigned.",
      });
    } else if (!s.tokenValid) {
      issues.push({
        field: "token",
        kind: "invalid",
        message: "Token not recognized. Check the contract address.",
      });
    }
  }

  if (s.requiresBanner && s.bannerUrl.trim().length < CAMPAIGN_BANNER_MIN) {
    issues.push({
      field: "banner",
      kind: "missing",
      message: "Add a banner image URL. This service needs it for fulfillment.",
    });
  }

  const title = s.title.trim();
  if (title.length === 0) {
    issues.push({
      field: "title",
      kind: "missing",
      message: "Enter a campaign title.",
    });
  } else if (title.length < CAMPAIGN_TITLE_MIN) {
    issues.push({
      field: "title",
      kind: "invalid",
      message: `Title must be at least ${CAMPAIGN_TITLE_MIN} characters.`,
    });
  } else if (s.title.length > CAMPAIGN_TITLE_MAX) {
    issues.push({
      field: "title",
      kind: "invalid",
      message: `Title must be ${CAMPAIGN_TITLE_MAX} characters or fewer.`,
    });
  }

  const brief = s.brief.trim();
  if (brief.length === 0) {
    issues.push({
      field: "brief",
      kind: "missing",
      message: "Describe what is being funded.",
    });
  } else if (brief.length < CAMPAIGN_BRIEF_MIN) {
    issues.push({
      field: "brief",
      kind: "invalid",
      message: `Brief must be at least ${CAMPAIGN_BRIEF_MIN} characters (${brief.length} so far).`,
    });
  } else if (s.brief.length > CAMPAIGN_BRIEF_MAX) {
    issues.push({
      field: "brief",
      kind: "invalid",
      message: `Brief must be ${CAMPAIGN_BRIEF_MAX} characters or fewer.`,
    });
  }

  if (!isValidCampaignDeadline(s.durationHours)) {
    issues.push({
      field: "duration",
      kind: "invalid",
      message: "Choose a supported deadline: 12, 24, 48, or 72 hours.",
    });
  }

  if (!s.loggedIn) {
    issues.push({
      field: "auth",
      kind: "auth",
      message: "Sign in with X to create a campaign.",
    });
  }

  return issues;
}

/** Convenience: the first issue for a given field, if any. */
export function issueForField(
  issues: CampaignFormIssue[],
  field: CampaignField,
): CampaignFormIssue | undefined {
  return issues.find((i) => i.field === field);
}
