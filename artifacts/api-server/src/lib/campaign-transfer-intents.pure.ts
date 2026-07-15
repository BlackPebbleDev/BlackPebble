/**
 * Community Campaigns - durable transfer intents: PURE helpers only.
 *
 * Kept free of any database / Solana import so the deterministic decision logic
 * (operation keys, retry/crash actions) is unit-testable in isolation.
 */

export type IntentKind = "payout" | "fee" | "refund";

export type IntentState =
  | "planned"
  | "signing"
  | "submitted"
  | "confirmed"
  | "recorded"
  | "failed"
  | "manual_review";

/**
 * Deterministic, unique operation key for an outbound transfer. The SAME
 * logical transfer always produces the SAME key, so retries reuse the intent.
 */
export function operationKey(opts: {
  kind: IntentKind;
  campaignId: number;
  purpose: string;
  contributionId?: number | null;
}): string {
  const parts = [opts.purpose, String(opts.campaignId)];
  if (opts.contributionId != null) parts.push(String(opts.contributionId));
  return parts.join(":");
}

export type IntentAction = "send" | "verify" | "record" | "done" | "abandon";

/**
 * Decide what to do with an intent on (re)entry, given its persisted state and
 * whether a previously submitted transaction signature exists.
 */
export function nextIntentAction(
  state: IntentState,
  hasSignature: boolean,
): IntentAction {
  switch (state) {
    case "recorded":
      return "done";
    case "submitted":
    case "confirmed":
    case "signing":
      return hasSignature ? "verify" : "send";
    case "failed":
      return "abandon";
    case "manual_review":
      return "done";
    case "planned":
    default:
      return "send";
  }
}
