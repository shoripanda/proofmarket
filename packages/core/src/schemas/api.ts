// External API contract as zod schemas — the single source of truth for request validation,
// TypeScript types and the generated OpenAPI document (packages/core/openapi.json).
// Specs: api-contract.md, implementation/ja/05-api-design.md.

import { z } from "zod";
import {
  ANSWER_KINDS,
  API_SETTLEMENT_STATUSES,
  CHECK_REASON_CODES,
  CHECK_STATUSES,
  CLAIM_STATES,
  FUNDING_STATUSES,
  OUTCOME_REASONS,
  OUTCOMES,
  PLATFORM_FLAGS,
  STORE_REPORT_STATUSES,
  SUBMISSION_STATES,
  TASK_STATUSES,
  TASK_TYPES,
  WEBHOOK_EVENTS,
} from "../domain/enums.ts";
import { LIMITS } from "../domain/limits.ts";
import { REQUIRABLE_TIERS, WORKER_TIERS } from "../domain/trust.ts";
import { ERROR_CATALOG, type ErrorCode } from "../errors.ts";

// ---------- primitives ----------

const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`), `must be a ${prefix}_ ULID`);

export const VerificationIdSchema = id("ver");
export const ClaimIdSchema = id("clm");
export const ChallengeIdSchema = id("chl");
export const UploadIdSchema = id("upl");
export const SubmissionIdSchema = id("sub");
export const PrincipalRefSchema = id("prn");

const IsoDateTime = z.iso.datetime({ offset: true });
const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);
/** Decimal string with up to 6 fractional digits, > 0 (05 §2.1 check 13). */
const Amount = z
  .string()
  .regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/, "decimal string with up to 6 decimals")
  .refine((v) => Number(v) > 0, "must be > 0");
const Sha256Hex = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const SolanaSignature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);

/** An answer as stored: a fixed code, a requester-defined choice, a number or text (01 §4.15). */
export const AnswerValueSchema = z.string().min(1).max(LIMITS.answer.maxTextChars);
const ChoiceValue = z.string().trim().min(1).max(LIMITS.answer.maxChoiceChars);

/** How the worker answers. enum values must fit the type (TASK_TYPE_SPECS); checked in validateAnswerSchema. */
export const AnswerSchemaSpec = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("enum"), values: z.array(ChoiceValue).min(2).max(LIMITS.answer.maxChoices) })
    .strict(),
  z
    .object({
      type: z.literal("number"),
      unit: z.string().trim().min(1).max(16).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("text"),
      max_chars: z.number().int().min(1).max(LIMITS.answer.maxTextChars).optional(),
    })
    .strict(),
]);
export type AnswerSchemaSpec = z.infer<typeof AnswerSchemaSpec>;
export const AnswerKindSchema = z.enum(ANSWER_KINDS);
const LocationSchema = z.object({
  lat: Lat,
  lng: Lng,
  radius_m: z.number().int().min(LIMITS.radiusM.min).max(LIMITS.radiusM.max),
});
export const IdempotencyKeyHeader = z.string().min(1).max(255);

// ---------- errors ----------

export const ErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(Object.keys(ERROR_CATALOG) as [ErrorCode, ...ErrorCode[]]),
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()),
  }),
});

// ---------- requester: create ----------

/** Named presets for `assurance` (05 §2.1 row 12). Agents may pick a level instead of counts. */
export const ASSURANCE_LEVELS = {
  fast: { required_witnesses: 1, quorum: 1 },
  standard: { required_witnesses: 2, quorum: 2 },
  high: { required_witnesses: 3, quorum: 2 },
} as const;
export type AssuranceLevel = keyof typeof ASSURANCE_LEVELS;
const LEVEL_NAMES = Object.keys(ASSURANCE_LEVELS) as [AssuranceLevel, ...AssuranceLevel[]];

/** The level whose counts equal these, or null. */
export function levelOf(a: { required_witnesses: number; quorum: number }): AssuranceLevel | null {
  return (
    LEVEL_NAMES.find(
      (l) =>
        ASSURANCE_LEVELS[l].required_witnesses === a.required_witnesses &&
        ASSURANCE_LEVELS[l].quorum === a.quorum,
    ) ?? null
  );
}

const AssuranceCountsSchema = z
  .object({
    required_witnesses: z.number().int().min(1).max(LIMITS.witnesses.max),
    quorum: z.number().int().min(1).max(LIMITS.witnesses.max),
  })
  .strict()
  .refine((a) => a.quorum <= a.required_witnesses, "quorum must be <= required_witnesses");

/** Either explicit counts or `{ level }`; always normalized to counts. */
export const AssuranceInputSchema = z
  .union([
    AssuranceCountsSchema,
    z
      .object({
        level: z.enum(LEVEL_NAMES).describe("fast = 1 witness, standard = 2 agreeing, high = 2 of 3"),
      })
      .strict(),
  ])
  .transform((a) => ("level" in a ? { ...ASSURANCE_LEVELS[a.level] } : a));

export const CreateVerificationRequestSchema = z
  .object({
    type: z.enum(TASK_TYPES),
    question: z.string().min(1).max(LIMITS.question.maxChars),
    // Must match the type's answer kind and, for fixed-choice types, its values (validateAnswerSchema).
    answer_schema: AnswerSchemaSpec,
    /** Required for at-a-place types; may be omitted for work that can be done anywhere (TASK_TYPE_SPECS). */
    location: LocationSchema.optional(),
    deadline: IsoDateTime,
    freshness: z
      .object({
        max_age_seconds: z
          .number()
          .int()
          .min(LIMITS.freshnessMaxAgeS.min)
          .max(LIMITS.freshnessMaxAgeS.max)
          .default(LIMITS.freshnessMaxAgeS.default),
      })
      .default({ max_age_seconds: LIMITS.freshnessMaxAgeS.default }),
    evidence_requirements: z.object({
      photo: z.literal(true),
      task_nonce: z.literal(true),
    }),
    assurance: AssuranceInputSchema,
    bounty: z.object({
      asset: z.literal("USDC"),
      amount: Amount, // per witness (D-07)
      network: z.literal("solana-devnet"),
    }),
    principal_ref: PrincipalRefSchema,
    /** Only workers at or above this tier may take the task (01 §4.11). */
    worker_requirements: z
      .object({ min_tier: z.enum(REQUIRABLE_TIERS) })
      .strict()
      .optional(),
    /** Let other requesters receive this result through `reuse` (01 §4.9). */
    allow_reuse: z.boolean().optional(),
    /**
     * Put the VERIFIED result on the public map for 72 hours (01 §4.22). This makes the question, the place,
     * the answer and the time public. Only for tasks with a location and a choice or number answer.
     */
    publish: z.boolean().optional(),
    /** Return a recent shared VERIFIED result for the same place instead of sending someone (01 §4.9). */
    reuse: z
      .object({ max_age_seconds: z.number().int().min(60).max(3600) })
      .strict()
      .optional(),
  })
  .strict();
export type CreateVerificationRequest = z.infer<typeof CreateVerificationRequestSchema>;

/** POST /v1/x402/verifications (01 §4.19): the payer's wallet stands in for the principal. */
export const X402CreateVerificationRequestSchema = CreateVerificationRequestSchema.omit({
  principal_ref: true,
});

export const CreateVerificationResponseSchema = z.object({
  verification_id: VerificationIdSchema,
  status: z.enum(["CREATED", "VERIFIED"]),
  created_at: IsoDateTime,
  funding: z.object({ status: z.enum(["PENDING", "NONE"]) }),
  /** true: an existing shared result was returned (01 §4.9); `verification_id` is that task and `result` is final. */
  reused: z.boolean().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
});

export const X402CreateVerificationResponseSchema = CreateVerificationResponseSchema.extend({
  /** Reads this verification via GET /v1/verifications/{id}. Shown once; null when the same payment is replayed. */
  api_key: z.string().nullable(),
  payment: z.object({
    signature: z.string(),
    explorer_url: z.url(),
    network: z.string(),
    payer: z.string(),
    amount: Amount,
  }),
});

// ---------- requester: result ----------

const CheckStatusSchema = z.enum(CHECK_STATUSES);

export const VerificationResultSchema = z.object({
  verification_id: VerificationIdSchema,
  status: z.enum(OUTCOMES),
  reason: z.enum(OUTCOME_REASONS).nullable(),
  answer: AnswerValueSchema.nullable(),
  /** Text answers: every accepted answer, oldest first. `answer` is the first of them. */
  answers: z.array(AnswerValueSchema).optional(),
  /**
   * AI review of each accepted submission (01 §4.16): did the photo and answer do what was asked?
   * Absent when no reviewer is configured. Requester-only; excluded from result_hash (its status is in checks).
   */
  reviews: z
    .array(
      z.object({
        verdict: z.enum(["pass", "uncertain", "unavailable"]),
        reason: z.string(),
        observed: z.string(),
        model: z.string().nullable(),
      }),
    )
    .optional(),
  /**
   * Links to show the person you answer that a human checked this (01 §4.21): the public result page,
   * a badge image, and Markdown that embeds the badge. Only on the requester's own result; not in result_hash.
   */
  proof: z.object({ url: z.url(), badge_url: z.url(), markdown: z.string() }).optional(),
  witnesses: z.object({ valid: z.number().int(), required: z.number().int(), quorum: z.number().int() }),
  answer_counts: z.record(z.string(), z.number().int()),
  consensus_ratio: z.number().min(0).max(1).nullable(),
  checks: z.object({
    geofence: CheckStatusSchema,
    freshness: CheckStatusSchema,
    task_nonce: CheckStatusSchema,
    replay: CheckStatusSchema,
    media_schema: CheckStatusSchema,
    duplicate: CheckStatusSchema,
    vision_consistency: CheckStatusSchema,
  }),
  rejected_submissions: z.record(z.enum(CHECK_REASON_CODES), z.number().int()),
  evidence_root: Sha256Hex,
  result_hash: Sha256Hex,
  attestation: z
    .object({
      network: z.literal("solana-devnet"),
      signature: SolanaSignature,
      task_account: z.string(),
      explorer_url: z.url(),
    })
    .nullable(),
  settlement: z.object({
    status: z.enum(API_SETTLEMENT_STATUSES),
    signature: SolanaSignature.nullable(),
    paid: z.array(z.object({ witness_ref: z.string(), amount: Amount })),
    test_asset: z.boolean().optional(),
  }),
  verified_at: IsoDateTime,
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const GetVerificationResponseSchema = z.object({
  verification_id: VerificationIdSchema,
  type: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  question: z.string(),
  answer_schema: AnswerSchemaSpec,
  location: LocationSchema.nullable(),
  deadline: IsoDateTime,
  /** Set on a task created by a dispute: the original task (01 §4.12). */
  recheck_of: VerificationIdSchema.nullable(),
  /** Set on a disputed task: its recheck and whether the answers matched. */
  recheck: z
    .object({
      verification_id: VerificationIdSchema,
      status: z.enum(TASK_STATUSES),
      answer: AnswerValueSchema.nullable(),
      matches_original: z.boolean().nullable(),
    })
    .nullable(),
  /** What the shop itself reported, if anything (01 §4.13). Context only: not part of the result or its hash. */
  store_report: z
    .object({
      status: z.enum(STORE_REPORT_STATUSES),
      reported_at: IsoDateTime,
      valid_until: IsoDateTime,
    })
    .nullable(),
  worker_requirements: z.object({ min_tier: z.enum(REQUIRABLE_TIERS) }).nullable(),
  assurance: z.object({
    required_witnesses: z.number().int(),
    quorum: z.number().int(),
    level: z.enum(LEVEL_NAMES).nullable(),
  }),
  bounty: CreateVerificationRequestSchema.shape.bounty,
  witness_progress: z.object({
    valid: z.number().int(),
    active_claims: z.number().int(),
    open_slots: z.number().int(),
    required: z.number().int(),
  }),
  funding: z.object({
    status: z.enum(FUNDING_STATUSES),
    signature: SolanaSignature.nullable(),
    explorer_url: z.url().nullable(),
  }),
  result: VerificationResultSchema.nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});
export type GetVerificationResponse = z.infer<typeof GetVerificationResponseSchema>;

/**
 * Public result (05 §4): no question, location, evidence URLs or per-submission data. Text answers and the
 * AI review notes are requester-only (01 §4.15, §4.16), so they are left out; the task type is added (01 §4.21).
 */
export const PublicVerificationResultSchema = VerificationResultSchema.omit({
  rejected_submissions: true,
  answers: true,
  reviews: true,
  proof: true,
}).extend({
  type: z.enum(TASK_TYPES),
  answer_kind: z.enum(ANSWER_KINDS),
  /** Set only when the requester published the result (01 §4.22). */
  published: z
    .object({
      question: z.string(),
      location: z.object({ lat: z.number(), lng: z.number() }),
      place_name: z.string().nullable(),
    })
    .nullable(),
});

/** Public map (01 §4.22): results their requesters chose to publish, newest first. Never photos or workers. */
export const PublicMapSchema = z.object({
  generated_at: IsoDateTime,
  max_age_hours: z.number().int(),
  items: z.array(
    z.object({
      verification_id: VerificationIdSchema,
      type: z.enum(TASK_TYPES),
      question: z.string(),
      answer: AnswerValueSchema,
      answer_kind: z.enum(["enum", "number"]),
      unit: z.string().nullable(),
      location: z.object({ lat: z.number(), lng: z.number() }),
      place_name: z.string().nullable(),
      witnesses: z.number().int(),
      verified_at: IsoDateTime,
      result_url: z.string(),
    }),
  ),
});
export type PublicMap = z.infer<typeof PublicMapSchema>;

/**
 * Public track record (05 §4.1): aggregates only. No question, answer, location, worker or payout address.
 * Recent results link to /r/<id> only when the operator featured them; otherwise just the Explorer transaction.
 */
export const PublicStatsSchema = z.object({
  generated_at: IsoDateTime,
  verifications: z.object({ total: z.number().int(), completed: z.number().int() }),
  workers_with_valid_submission: z.number().int(),
  requesters: z.number().int(),
  paid_to_workers: z.object({
    asset: z.literal("USDC"),
    amount: z.string().regex(/^\d+(\.\d{1,6})?$/),
    network: z.literal("solana-devnet"),
  }),
  median_seconds_to_result: z.number().int().nullable(),
  ai_review: z.object({ pass: z.number().int(), fail: z.number().int(), uncertain: z.number().int() }),
  by_type: z.array(
    z.object({ type: z.enum(TASK_TYPES), total: z.number().int(), completed: z.number().int() }),
  ),
  /** Last 14 days in JST, oldest first, days without results included as 0. */
  daily_completed: z.array(z.object({ date: z.iso.date(), count: z.number().int() })),
  recent_results: z.array(
    z.object({
      type: z.enum(TASK_TYPES),
      finalized_at: IsoDateTime,
      witnesses: z.number().int(),
      explorer_url: z.url(),
      result_url: z.string().nullable(),
    }),
  ),
});
export type PublicStats = z.infer<typeof PublicStatsSchema>;

export const EvidenceUrlsResponseSchema = z.object({
  evidence: z.array(
    z.object({ witness_ref: z.string(), url: z.url(), expires_in_seconds: z.number().int() }),
  ),
});

// ---------- worker ----------

export const OnboardingRequestSchema = z
  .object({
    invite_code: z.string().min(4).max(64),
    consents: z.object({
      worker_terms: z.string(),
      safety_rules: z.string(),
      privacy_notice: z.string(),
    }),
  })
  .strict();

export const WorkerMeResponseSchema = z.object({
  worker_id: z.string(),
  onboarded: z.boolean(),
  status: z.enum(["active", "suspended"]),
  consents: z.record(z.string(), z.string()),
  /** The worker asked to be paid in yen once that is available (01 §4.10). */
  yen_payout_interest: z.boolean(),
  /** Trust tier and the record it comes from (01 §4.11). Absent before onboarding. */
  trust: z
    .object({
      tier: z.enum(WORKER_TIERS),
      reasons: z.array(z.string()),
      record: z.object({
        valid: z.number().int(),
        violations: z.number().int(),
        compared: z.number().int(),
        agreed: z.number().int(),
      }),
    })
    .optional(),
});

/** Client must round lat/lng to 3 decimals before sending (05 §3.2). */
/** Which tasks to list: near the worker, or only work that needs no place (01 §4.20). */
export const WORKER_TASK_SCOPES = ["nearby", "anywhere"] as const;

export const WorkerTaskQuerySchema = z
  .object({
    scope: z.enum(WORKER_TASK_SCOPES).default("nearby"),
    lat: z.coerce.number().pipe(Lat).optional(),
    lng: z.coerce.number().pipe(Lng).optional(),
    radius_km: z.coerce
      .number()
      .int()
      .min(LIMITS.workerTaskSearchRadiusKm.min)
      .max(LIMITS.workerTaskSearchRadiusKm.max)
      .default(LIMITS.workerTaskSearchRadiusKm.default),
  })
  .refine((q) => q.scope === "anywhere" || (q.lat !== undefined && q.lng !== undefined), {
    path: ["lat"],
    message: "lat and lng are required unless scope=anywhere",
  });

export const WorkerTaskSchema = z.object({
  verification_id: VerificationIdSchema,
  type: z.enum(TASK_TYPES),
  question: z.string(),
  answer_values: z.array(AnswerValueSchema),
  answer_schema: AnswerSchemaSpec,
  /** null: the work can be done anywhere. */
  location: LocationSchema.nullable(),
  distance_m: z.number().int().nullable(),
  reward: z.object({ asset: z.literal("USDC"), amount: Amount }),
  deadline: IsoDateTime,
  freshness_max_age_seconds: z.number().int(),
  open_slots: z.number().int(),
  requirements: z.array(z.enum(["photo", "location", "task_nonce"])),
  safety_notes_version: z.string(),
});
export const WorkerTaskListResponseSchema = z.object({ tasks: z.array(WorkerTaskSchema) });

const ChallengeSchema = z.object({
  challenge_id: ChallengeIdSchema,
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "32 random bytes, base64url"),
  expires_at: IsoDateTime,
});

export const ClaimResponseSchema = z.object({
  claim_id: ClaimIdSchema,
  status: z.literal("CLAIMED"),
  expires_at: IsoDateTime,
  challenge: ChallengeSchema,
});

export const ChallengeResponseSchema = ChallengeSchema;

export const CreateUploadRequestSchema = z
  .object({
    challenge_id: ChallengeIdSchema,
    content_type: z.literal(LIMITS.media.contentType),
    byte_size: z.number().int().min(1).max(LIMITS.media.maxBytes),
  })
  .strict();

export const CreateUploadResponseSchema = z.object({
  upload_id: UploadIdSchema,
  upload_url: z.url(),
  expires_in_seconds: z.number().int(),
  max_bytes: z.number().int(),
});

export const SubmitEvidenceRequestSchema = z
  .object({
    claim_id: ClaimIdSchema,
    answer: AnswerValueSchema,
    capture: z.object({
      client_timestamp: IsoDateTime,
      // Required when the task has a location; optional for work that can be done anywhere.
      lat: Lat.optional(),
      lng: Lng.optional(),
      accuracy_m: z.number().min(0).max(10_000).optional(),
    }),
    challenge: z.object({ nonce: z.string().min(1).max(128) }),
    evidence: z
      .array(z.object({ type: z.literal("photo"), object_ref: UploadIdSchema }))
      .min(1)
      .max(LIMITS.media.maxPhotos) // 01 §4.18: up to 4 photos, all under the same challenge
      .refine((e) => new Set(e.map((x) => x.object_ref)).size === e.length, "each photo once"),
  })
  .strict();
export type SubmitEvidenceRequest = z.infer<typeof SubmitEvidenceRequestSchema>;

const ChecksMapSchema = z.record(z.string(), CheckStatusSchema);

export const SubmitEvidenceResponseSchema = z.object({
  submission_id: SubmissionIdSchema,
  /** CHECKING: every mechanical check passed and the submission waits for the AI review (01 §4.17). */
  state: z.enum(SUBMISSION_STATES),
  reason_code: z.enum(CHECK_REASON_CODES).nullable(),
  reason_message_ja: z.string().nullable(),
  retryable: z.boolean(),
  attempts_remaining: z.number().int(),
  claim_state: z.enum(CLAIM_STATES),
  checks: ChecksMapSchema,
});

export const ClaimDetailResponseSchema = z.object({
  claim_id: ClaimIdSchema,
  verification_id: VerificationIdSchema,
  state: z.enum(CLAIM_STATES),
  expires_at: IsoDateTime,
  attempts_remaining: z.number().int(),
  submissions: z.array(SubmitEvidenceResponseSchema.omit({ claim_state: true, attempts_remaining: true })),
  task_result: z.object({ status: z.enum(OUTCOMES), answer: AnswerValueSchema.nullable() }).nullable(),
  type: z.enum(TASK_TYPES),
  question: z.string(),
  answer_values: z.array(AnswerValueSchema),
  answer_schema: AnswerSchemaSpec,
  location_required: z.boolean(),
});

export const PayoutsResponseSchema = z.object({
  payouts: z.array(
    z.object({
      verification_id: VerificationIdSchema,
      amount: Amount,
      asset: z.literal("USDC"),
      status: z.enum(API_SETTLEMENT_STATUSES),
      explorer_url: z.url().nullable(),
      paid_at: IsoDateTime.nullable(),
    }),
  ),
});

// ---------- admin ----------

export const AdminFlagRequestSchema = z
  .object({
    key: z.enum(PLATFORM_FLAGS),
    value: z.boolean(),
  })
  .strict();

/** The outside reviewer's verdict on one held submission (01 §4.17). */
export const AdminReviewRequestSchema = z
  .object({
    verdict: z.enum(["pass", "fail", "uncertain"]),
    reason: z.string().min(1).max(300),
    observed: z.string().max(200),
    model: z.string().min(1).max(100),
  })
  .strict();

// ---------- webhook ----------

/** Body carries no result; receivers must GET the verification (05 §5). */
export const WebhookPayloadSchema = z.object({
  id: z.string().regex(/^evt_/),
  type: z.enum(WEBHOOK_EVENTS),
  created_at: IsoDateTime,
  data: z.object({ verification_id: VerificationIdSchema, status: z.enum(TASK_STATUSES) }),
});

// ---------- recurring checks (04 §3.23) ----------
const HhmmSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "HH:MM (Japan time)");
export const CreateScheduleRequestSchema = z
  .object({
    request: CreateVerificationRequestSchema.omit({ deadline: true }),
    deadline_minutes: z.number().int().min(10).max(1440),
    times_jst: z.array(HhmmSchema).min(1).max(24),
    days_jst: z.array(z.number().int().min(0).max(6)).min(1).max(7).describe("0 = Sunday ... 6 = Saturday"),
    ends_at: IsoDateTime.optional(),
  })
  .strict();
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;

export const ScheduleSchema = z.object({
  schedule_id: z.string(),
  active: z.boolean(),
  times_jst: z.array(z.string()),
  days_jst: z.array(z.number().int()),
  deadline_minutes: z.number().int(),
  ends_at: IsoDateTime.nullable(),
  next_run_at: IsoDateTime.nullable(),
  last_run_at: IsoDateTime.nullable(),
  last_verification_id: z.string().nullable(),
  last_error: z.string().nullable(),
});
export const ScheduleListResponseSchema = z.object({ schedules: z.array(ScheduleSchema) });

// ---------- disputes (01 §4.12) ----------
export const DisputeRequestSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    assurance: AssuranceInputSchema.optional(),
    deadline_minutes: z.number().int().min(10).max(1440).optional(),
  })
  .strict();
export const DisputeResponseSchema = z.object({
  verification_id: VerificationIdSchema,
  recheck_verification_id: VerificationIdSchema,
});
