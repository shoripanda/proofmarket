// State and value enums. Source of truth: specs/proofmarket/implementation/ja/03-state-machine.md

/** Task lifecycle (03 §2). Names are those of requirements.md. DISPUTED (P1) is intentionally absent. */
export const TASK_STATUSES = [
  "CREATED",
  "FUNDED",
  "OPEN",
  "CLAIMED",
  "SUBMITTED",
  "VERIFYING",
  "VERIFIED",
  "SETTLED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses in which a worker may still claim if open_slots > 0 (03 §2.1). */
export const CLAIMABLE_STATUSES = ["OPEN", "CLAIMED", "SUBMITTED"] as const satisfies readonly TaskStatus[];

/** Money axes (03 §4). */
export const FUNDING_STATUSES = ["NONE", "PENDING", "SUBMITTED", "CONFIRMED", "FAILED", "ABANDONED"] as const;
export type FundingStatus = (typeof FUNDING_STATUSES)[number];

export const SETTLEMENT_STATUSES = ["NONE", "PENDING", "SUBMITTED", "CONFIRMED", "FAILED"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

/** settlement.status as exposed by the API (05 §2.4). */
export const API_SETTLEMENT_STATUSES = [
  "PENDING",
  "SUBMITTED",
  "SETTLED",
  "REFUNDED",
  "FAILED_RETRYING",
] as const;
export type ApiSettlementStatus = (typeof API_SETTLEMENT_STATUSES)[number];

/** Result axis (03 §1). */
export const OUTCOMES = ["VERIFIED", "REJECTED", "EXPIRED"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_REASONS = ["NO_CONSENSUS", "INSUFFICIENT_WITNESSES"] as const;
export type OutcomeReason = (typeof OUTCOME_REASONS)[number];

/** Sub-states (03 §3). */
export const CLAIM_STATES = ["ACTIVE", "ACCEPTED", "REJECTED", "ABANDONED", "EXPIRED"] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

export const SUBMISSION_STATES = ["CHECKING", "VALID", "INVALID"] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

export const CHALLENGE_STATES = ["ISSUED", "USED", "SUPERSEDED", "EXPIRED"] as const;
export type ChallengeState = (typeof CHALLENGE_STATES)[number];

export const UPLOAD_STATES = ["PENDING", "FINALIZED", "DISCARDED"] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];

/**
 * Task types (01 §4.8, §4.15). The first three are the original shop-front types; the rest were added 2026-10-04
 * so an agent can ask for any physical-world work it cannot do itself. Each API key accepts only its
 * allowed_task_types.
 */
export const TASK_TYPES = [
  // at a place: choice
  "PLACE_STATUS_VERIFICATION",
  "QUEUE_LENGTH",
  "NOTICE_POSTED",
  "CROWD_LEVEL",
  "SEAT_AVAILABILITY",
  "PARKING_AVAILABILITY",
  "STOCK_CHECK",
  // at a place: number / text
  "PRICE_CHECK",
  "SIGN_TRANSCRIPTION",
  "SITE_REPORT",
  // anywhere
  "DOCUMENT_TRANSCRIPTION",
  "DOCUMENT_QA",
  "PRODUCT_INSPECTION",
  "PHONE_INQUIRY",
  "MEASUREMENT",
  "CUSTOM_CHOICE",
  "CUSTOM_TASK",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** How a worker answers: pick one of fixed values, enter a number, or write text. */
export const ANSWER_KINDS = ["enum", "number", "text"] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

/** required: the request must give a location and the photo is geofenced. optional: location may be omitted. */
export type LocationRule = "required" | "optional";

export interface TaskTypeSpec {
  answer: AnswerKind;
  location: LocationRule;
  /** enum only. null = the requester defines the choices (CUSTOM_CHOICE). */
  values?: readonly string[] | null;
}

/** UNCLEAR is offered on every fixed-choice type so nobody is pushed into guessing. */
export const TASK_TYPE_SPECS = {
  PLACE_STATUS_VERIFICATION: { answer: "enum", location: "required", values: ["OPEN", "CLOSED", "UNCLEAR"] },
  QUEUE_LENGTH: {
    answer: "enum",
    location: "required",
    values: ["NO_QUEUE", "SHORT_QUEUE", "LONG_QUEUE", "UNCLEAR"],
  },
  NOTICE_POSTED: { answer: "enum", location: "required", values: ["POSTED", "NOT_POSTED", "UNCLEAR"] },
  CROWD_LEVEL: { answer: "enum", location: "required", values: ["EMPTY", "MODERATE", "CROWDED", "UNCLEAR"] },
  SEAT_AVAILABILITY: { answer: "enum", location: "required", values: ["SEATS_AVAILABLE", "FULL", "UNCLEAR"] },
  PARKING_AVAILABILITY: {
    answer: "enum",
    location: "required",
    values: ["SPACES_AVAILABLE", "FULL", "UNCLEAR"],
  },
  STOCK_CHECK: { answer: "enum", location: "required", values: ["IN_STOCK", "OUT_OF_STOCK", "UNCLEAR"] },
  PRICE_CHECK: { answer: "number", location: "required" },
  SIGN_TRANSCRIPTION: { answer: "text", location: "required" },
  SITE_REPORT: { answer: "text", location: "required" },
  DOCUMENT_TRANSCRIPTION: { answer: "text", location: "optional" },
  DOCUMENT_QA: { answer: "text", location: "optional" },
  PRODUCT_INSPECTION: { answer: "text", location: "optional" },
  PHONE_INQUIRY: { answer: "text", location: "optional" },
  MEASUREMENT: { answer: "number", location: "optional" },
  CUSTOM_CHOICE: { answer: "enum", location: "optional", values: null },
  CUSTOM_TASK: { answer: "text", location: "optional" },
} as const satisfies Record<TaskType, TaskTypeSpec>;

/** Fixed choices per enum type (CUSTOM_CHOICE has none: the requester names them). */
export const TASK_TYPE_ANSWERS: Partial<Record<TaskType, readonly string[]>> = Object.fromEntries(
  Object.entries(TASK_TYPE_SPECS).flatMap(([t, s]) => ("values" in s && s.values ? [[t, s.values]] : [])),
);

export const ANSWER_VALUES = [
  "OPEN",
  "CLOSED",
  "NO_QUEUE",
  "SHORT_QUEUE",
  "LONG_QUEUE",
  "POSTED",
  "NOT_POSTED",
  "EMPTY",
  "MODERATE",
  "CROWDED",
  "SEATS_AVAILABLE",
  "SPACES_AVAILABLE",
  "FULL",
  "IN_STOCK",
  "OUT_OF_STOCK",
  "UNCLEAR",
] as const;
/** Fixed answer codes. Answers in general are strings: numbers and text are stored as written. */
export type AnswerValue = (typeof ANSWER_VALUES)[number];

/** Evidence checks (07 §3, 04 §3.12). Order of CHECK_ORDER is the execution order after pre-checks. */
export const CHECK_TYPES = [
  "claim_binding",
  "task_window",
  "task_nonce",
  "answer_schema",
  "media_schema",
  "replay",
  "freshness",
  "geofence",
  "duplicate",
  "vision_consistency",
] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export const PRE_CHECKS = [
  "claim_binding",
  "task_window",
  "task_nonce",
  "answer_schema",
] as const satisfies readonly CheckType[];
export const CHECK_ORDER = [
  "media_schema",
  "replay",
  "freshness",
  "geofence",
  "duplicate",
  "vision_consistency",
] as const satisfies readonly CheckType[];

export const CHECK_STATUSES = ["pass", "fail", "warning", "not_run"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

/** Reason codes produced by evidence checks (07 §3); returned in a 200 body, not as HTTP errors. */
export const CHECK_REASON_CODES = [
  "MEDIA_TYPE_UNSUPPORTED",
  "MEDIA_TOO_LARGE",
  "MEDIA_DECODE_FAILED",
  "EVIDENCE_REPLAYED",
  "EVIDENCE_STALE",
  "LOCATION_ACCURACY_TOO_LOW",
  "EVIDENCE_OUTSIDE_GEOFENCE",
  "EVIDENCE_NEAR_DUPLICATE",
  /** AI review: the photo or answer does not do what was asked (01 §4.16). Retryable. */
  "EVIDENCE_MISMATCH",
] as const;
export type CheckReasonCode = (typeof CHECK_REASON_CODES)[number];

/** Reasons that end the claim immediately (01 §4.5, 03 §3.1). */
export const NON_RETRYABLE_REASONS = [
  "EVIDENCE_REPLAYED",
  "EVIDENCE_NEAR_DUPLICATE",
] as const satisfies readonly CheckReasonCode[];

/** Risk flags recorded without changing pass/fail (07 §3). */
export const RISK_FLAGS = ["clock_skew", "edge_of_geofence", "fallback_capture"] as const;
export type RiskFlag = (typeof RISK_FLAGS)[number];

/** Outbox job kinds (04 §3.17). */
export const OUTBOX_JOB_KINDS = [
  "FUND_TASK",
  "FINALIZE_AND_SETTLE",
  "REFUND_TASK",
  "DELIVER_WEBHOOK",
  "PURGE_EVIDENCE",
  "NOTIFY_WORKERS",
] as const;
export type OutboxJobKind = (typeof OUTBOX_JOB_KINDS)[number];

/** payment_records.kind (04 §3.14). */
export const PAYMENT_KINDS = ["FUND", "FINALIZE_AND_SETTLE", "REFUND"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/** Webhook events: api-contract.md §11 plus verification.cancelled (G-13). */
export const WEBHOOK_EVENTS = [
  "verification.open",
  "verification.claimed",
  "verification.submitted",
  "verification.verified",
  "verification.rejected",
  "verification.settled",
  "verification.expired",
  "verification.cancelled",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** platform_flags keys (04 §3.19). */
export const PLATFORM_FLAGS = [
  "tasks_create_enabled",
  "claims_enabled",
  "settlement_enabled",
  "public_evidence_enabled",
  /** Hold submissions for an outside reviewer (Claude Code on the operator's machine, 01 §4.17). Default off. */
  "external_review_enabled",
] as const;
export type PlatformFlag = (typeof PLATFORM_FLAGS)[number];

/** audit_events.event_type: architecture.md §7 plus 08 §5 additions. */
export const AUDIT_EVENT_TYPES = [
  "request_created",
  "funding_confirmed",
  "task_opened",
  "worker_claimed",
  "evidence_uploaded",
  "evidence_check_completed",
  "witness_accepted",
  "quorum_reached",
  "settlement_submitted",
  "settlement_confirmed",
  "refund_confirmed",
  "task_expired",
  "task_cancelled",
  "submission_rejected",
  "claim_abandoned",
  "operator_action",
  "oauth_granted",
  "bounty_fixed",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const ACTOR_TYPES = ["requester", "worker", "system", "operator"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** participation_requests (04 §3.20): who is signing up, and the rough pilot area for workers. */
export const PARTICIPATION_ROLES = ["worker", "requester"] as const;
export type ParticipationRole = (typeof PARTICIPATION_ROLES)[number];
export const PARTICIPATION_AREAS = ["shibuya", "shinjuku", "other"] as const;
export type ParticipationArea = (typeof PARTICIPATION_AREAS)[number];

/** Reports a registered shop can file about itself (01 §4.13). Context only, never used to decide results. */
export const STORE_REPORT_STATUSES = ["CLOSED_TODAY", "OPEN_AS_USUAL"] as const;
export type StoreReportStatus = (typeof STORE_REPORT_STATUSES)[number];
