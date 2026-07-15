/**
 * Community Campaigns - structured, safe error type.
 *
 * Money flows must never fail behind a generic message. Every campaign
 * creation / activation / contribution failure carries:
 *   - a stable machine `code`
 *   - the `stage` of the pipeline that failed
 *   - a human-safe `message` (no secrets, seed material, SQL, or stack traces)
 *   - a `correlationId` tying the API response to server logs and audit rows
 *
 * `retryable` tells the client whether trying again (later) can succeed
 * (e.g. a transiently unavailable SOL price) versus a permanent input problem.
 */

export type CampaignStage =
  | "feature_flag"
  | "authentication"
  | "validation"
  | "token_verification"
  | "pricing"
  | "escrow_config"
  | "duplicate_check"
  | "persistence"
  | "activation_verification"
  | "contribution_verification"
  | "lifecycle_transition"
  | "fulfillment"
  | "refund"
  | "internal";

export type CampaignErrorCode =
  | "FEATURE_DISABLED"
  | "AUTH_REQUIRED"
  | "INVALID_INPUT"
  | "UNKNOWN_TYPE"
  | "TOKEN_INVALID"
  | "TOKEN_UNSAFE"
  | "PRICE_UNAVAILABLE"
  | "ESCROW_NOT_CONFIGURED"
  | "DUPLICATE_ACTIVE_CAMPAIGN"
  | "NOT_FOUND"
  | "ACTIVATION_TX_INVALID"
  | "ACTIVATION_TX_UNCONFIRMED"
  | "ACTIVATION_WRONG_SENDER"
  | "ACTIVATION_WRONG_DESTINATION"
  | "ACTIVATION_AMOUNT_TOO_LOW"
  | "CONTRIBUTION_TX_INVALID"
  | "CONTRIBUTION_TX_UNCONFIRMED"
  | "CONTRIBUTION_WRONG_DESTINATION"
  | "CONTRIBUTION_TOO_LOW"
  | "CONTRIBUTION_CLOSED"
  | "INVALID_TRANSITION"
  | "WRONG_STATE"
  | "PROOF_REQUIRED"
  | "INTERNAL";

export interface CampaignErrorShape {
  error: string;
  code: CampaignErrorCode;
  stage: CampaignStage;
  retryable: boolean;
  correlationId: string;
}

export class CampaignError extends Error {
  readonly code: CampaignErrorCode;
  readonly stage: CampaignStage;
  readonly retryable: boolean;
  readonly httpStatus: number;

  constructor(opts: {
    code: CampaignErrorCode;
    stage: CampaignStage;
    message: string;
    retryable?: boolean;
    httpStatus?: number;
  }) {
    super(opts.message);
    this.name = "CampaignError";
    this.code = opts.code;
    this.stage = opts.stage;
    this.retryable = opts.retryable ?? false;
    this.httpStatus = opts.httpStatus ?? 400;
  }

  toResponse(correlationId: string): CampaignErrorShape {
    return {
      error: this.message,
      code: this.code,
      stage: this.stage,
      retryable: this.retryable,
      correlationId,
    };
  }
}

/** Result union used by engine functions so callers get a typed failure. */
export type CampaignResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: CampaignError };

export function fail(
  code: CampaignErrorCode,
  stage: CampaignStage,
  message: string,
  retryable = false,
): { ok: false; error: CampaignError } {
  return { ok: false, error: new CampaignError({ code, stage, message, retryable }) };
}
