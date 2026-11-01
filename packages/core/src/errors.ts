// API error catalog. Source of truth: 05-api-design.md §8 and api-contract.md §8.
// Format: { error: { code, message, retryable, details } }. Never include stack traces or secrets (REQ-N-001).

type ErrorDef = { readonly http: number; readonly retryable: boolean; readonly message: string };

export const ERROR_CATALOG = {
  UNAUTHENTICATED: { http: 401, retryable: false, message: "Authentication is required." },
  FORBIDDEN: { http: 403, retryable: false, message: "You are not allowed to perform this action." },
  CREDENTIAL_SUSPENDED: {
    http: 403,
    retryable: false,
    message: "This API credential is suspended or revoked.",
  },
  PRINCIPAL_MISMATCH: {
    http: 403,
    retryable: false,
    message: "principal_ref does not match the API credential.",
  },
  WORKER_NOT_ONBOARDED: {
    http: 403,
    retryable: false,
    message: "Complete onboarding before using worker APIs.",
  },
  INVITE_INVALID: { http: 403, retryable: false, message: "The invite code is invalid or expired." },
  VALIDATION_FAILED: { http: 400, retryable: false, message: "The request is invalid." },
  UNSUPPORTED_ASSET: { http: 400, retryable: false, message: "This asset is not accepted here." },
  UNSUPPORTED_TASK_TYPE: { http: 400, retryable: false, message: "This task type is not allowed." },
  DEADLINE_OUT_OF_RANGE: {
    http: 400,
    retryable: false,
    message: "deadline must be 10 minutes to 24 hours from now.",
  },
  LOCATION_OUT_OF_PILOT_AREA: {
    http: 400,
    retryable: false,
    message: "The location is outside the pilot area.",
  },
  LOCATION_NOT_ALLOWLISTED: {
    http: 400,
    retryable: false,
    message: "The location is not an allowlisted public place.",
  },
  TASK_POLICY_VIOLATION: { http: 422, retryable: false, message: "The request violates the task policy." },
  TASK_AMOUNT_LIMIT_EXCEEDED: {
    http: 403,
    retryable: false,
    message: "The task amount exceeds the per-task limit.",
  },
  DAILY_SPEND_LIMIT_EXCEEDED: {
    http: 403,
    retryable: true,
    message: "The daily spend limit has been reached.",
  },
  INSUFFICIENT_BALANCE: { http: 402, retryable: false, message: "The prepaid balance is insufficient." },
  RATE_LIMITED: { http: 429, retryable: true, message: "Too many requests." },
  IDEMPOTENCY_KEY_CONFLICT: {
    http: 409,
    retryable: false,
    message: "Idempotency-Key was reused with a different request.",
  },
  IDEMPOTENCY_IN_PROGRESS: {
    http: 409,
    retryable: true,
    message: "A request with this Idempotency-Key is in progress.",
  },
  PAYMENT_IN_PROGRESS: {
    http: 409,
    retryable: true,
    message: "This x402 payment is being settled. Retry the same request shortly.",
  },
  PAYMENT_ALREADY_USED: {
    http: 409,
    retryable: false,
    message: "This x402 payment was already used for a different request.",
  },
  VERIFICATION_NOT_FOUND: { http: 404, retryable: false, message: "Verification not found." },
  TASK_NOT_CANCELLABLE: {
    http: 409,
    retryable: false,
    message: "The verification cannot be cancelled in its current state.",
  },
  EVIDENCE_ACCESS_REVOKED: { http: 403, retryable: false, message: "Access to evidence has been revoked." },
  TASK_NOT_CLAIMABLE: { http: 409, retryable: false, message: "The task is not open for claims." },
  NO_OPEN_SLOT: { http: 409, retryable: true, message: "No witness slot is currently open." },
  ALREADY_CLAIMED: { http: 409, retryable: false, message: "You have already claimed this task." },
  DISPUTE_NOT_ALLOWED: {
    http: 409,
    retryable: false,
    message: "This result cannot be disputed (no result yet, more than 24 hours old, or already disputed).",
  },
  CHALLENGE_NOT_ALLOWED: {
    http: 409,
    retryable: false,
    message:
      "This answer cannot be challenged (not an optimistic task, no provisional answer yet, window closed, or already challenged).",
  },
  WORKER_NOT_ELIGIBLE: {
    http: 403,
    retryable: false,
    message: "Your trust tier does not meet this task's requirement.",
  },
  TASK_EXPIRED: { http: 410, retryable: false, message: "The task deadline has passed." },
  CLAIM_NOT_ACTIVE: { http: 409, retryable: false, message: "The claim is not active." },
  REVIEW_PENDING: {
    http: 409,
    retryable: true,
    message: "The previous submission is still being reviewed. Wait for its result.",
  },
  SUBMISSION_NOT_PENDING: {
    http: 409,
    retryable: false,
    message: "The submission is not waiting for review.",
  },
  NONCE_INVALID: { http: 400, retryable: false, message: "The challenge nonce is invalid." },
  NONCE_USED: { http: 409, retryable: false, message: "The challenge nonce has already been used." },
  NONCE_EXPIRED: {
    http: 410,
    retryable: true,
    message: "The challenge nonce has expired. Request a new challenge.",
  },
  UPLOAD_NOT_FOUND: { http: 404, retryable: false, message: "The upload was not found for this claim." },
  ANSWER_INVALID: { http: 400, retryable: false, message: "The answer is not one of the allowed values." },
  MEDIA_TYPE_UNSUPPORTED: { http: 415, retryable: false, message: "Only image/jpeg is accepted." },
  MEDIA_TOO_LARGE: { http: 413, retryable: false, message: "The file exceeds the maximum size." },
  QUOTE_NOT_FOUND: { http: 404, retryable: false, message: "The quote was not found for this API key." },
  TASKS_NOT_ENABLED: { http: 404, retryable: false, message: "General tasks are not open yet." },
  TASK_NOT_FOUND: { http: 404, retryable: false, message: "Task not found." },
  PROFILE_NOT_FOUND: { http: 404, retryable: false, message: "No public profile with this id." },
  SEAT_NOT_FOUND: { http: 404, retryable: false, message: "Seat not found for this task." },
  APPLICATION_NOT_FOUND: { http: 404, retryable: false, message: "Application not found for this task." },
  TASK_STATE_CONFLICT: {
    http: 409,
    retryable: false,
    message: "The task or seat is not in a state that allows this action.",
  },
  WEBHOOK_NOT_FOUND: {
    http: 404,
    retryable: false,
    message: "The webhook endpoint was not found for this API key.",
  },
  WEBHOOK_LIMIT_REACHED: {
    http: 409,
    retryable: false,
    message: "This API key already has the most active webhook endpoints allowed. Delete one first.",
  },
  QUOTE_MISMATCH: {
    http: 409,
    retryable: false,
    message: "The request body differs from the one that was quoted.",
  },
  QUOTE_EXPIRED: { http: 409, retryable: false, message: "The quote has expired; ask for a new one." },
  FEATURE_DISABLED: {
    http: 503,
    retryable: true,
    message: "This feature is temporarily disabled by the operator.",
  },
  NOT_IMPLEMENTED: { http: 501, retryable: false, message: "Not implemented yet." },
  INTERNAL_ERROR: { http: 500, retryable: true, message: "An internal error occurred." },
} as const satisfies Record<string, ErrorDef>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; retryable: boolean; details: Record<string, unknown> };
}

/** Thrown by services; converted to an HTTP response by apps/web/lib/http. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;
  /** Overrides catalog retryable where the spec says "depends" (e.g. TASK_NOT_CANCELLABLE while funding is in flight, 03 §2.2). */
  readonly retryableOverride: boolean | undefined;

  constructor(code: ErrorCode, details: Record<string, unknown> = {}, retryableOverride?: boolean) {
    super(ERROR_CATALOG[code].message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.retryableOverride = retryableOverride;
  }

  get http(): number {
    return ERROR_CATALOG[this.code].http;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryableOverride ?? ERROR_CATALOG[this.code].retryable,
        details: this.details,
      },
    };
  }
}
