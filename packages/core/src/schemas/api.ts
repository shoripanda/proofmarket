// External API contract as zod schemas — the single source of truth for request validation,
// TypeScript types and the generated OpenAPI document (packages/core/openapi.json).
// Specs: api-contract.md, implementation/ja/05-api-design.md.

import { z } from "zod";
import {
  ANSWER_VALUES,
  API_SETTLEMENT_STATUSES,
  CHECK_REASON_CODES,
  CHECK_STATUSES,
  CLAIM_STATES,
  FUNDING_STATUSES,
  OUTCOME_REASONS,
  OUTCOMES,
  SUBMISSION_STATES,
  TASK_STATUSES,
  WEBHOOK_EVENTS,
} from "../domain/enums.ts";
import { LIMITS } from "../domain/limits.ts";
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

export const AnswerValueSchema = z.enum(ANSWER_VALUES);
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

export const CreateVerificationRequestSchema = z
  .object({
    type: z.literal("PLACE_STATUS_VERIFICATION"),
    question: z.string().min(1).max(LIMITS.question.maxChars),
    answer_schema: z.object({
      type: z.literal("enum"),
      values: z.array(AnswerValueSchema).min(2).max(3),
    }),
    location: z.object({
      lat: Lat,
      lng: Lng,
      radius_m: z.number().int().min(LIMITS.radiusM.min).max(LIMITS.radiusM.max),
    }),
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
    assurance: z
      .object({
        required_witnesses: z.number().int().min(1).max(LIMITS.witnesses.max),
        quorum: z.number().int().min(1).max(LIMITS.witnesses.max),
      })
      .refine((a) => a.quorum <= a.required_witnesses, "quorum must be <= required_witnesses"),
    bounty: z.object({
      asset: z.literal("USDC"),
      amount: Amount, // per witness (D-07)
      network: z.literal("solana-devnet"),
    }),
    principal_ref: PrincipalRefSchema,
  })
  .strict();
export type CreateVerificationRequest = z.infer<typeof CreateVerificationRequestSchema>;

export const CreateVerificationResponseSchema = z.object({
  verification_id: VerificationIdSchema,
  status: z.literal("CREATED"),
  created_at: IsoDateTime,
  funding: z.object({ status: z.literal("PENDING") }),
});

// ---------- requester: result ----------

const CheckStatusSchema = z.enum(CHECK_STATUSES);

export const VerificationResultSchema = z.object({
  verification_id: VerificationIdSchema,
  status: z.enum(OUTCOMES),
  reason: z.enum(OUTCOME_REASONS).nullable(),
  answer: AnswerValueSchema.nullable(),
  witnesses: z.object({ valid: z.number().int(), required: z.number().int(), quorum: z.number().int() }),
  answer_counts: z.record(AnswerValueSchema, z.number().int()),
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
  type: z.literal("PLACE_STATUS_VERIFICATION"),
  status: z.enum(TASK_STATUSES),
  question: z.string(),
  answer_schema: CreateVerificationRequestSchema.shape.answer_schema,
  location: CreateVerificationRequestSchema.shape.location,
  deadline: IsoDateTime,
  assurance: z.object({ required_witnesses: z.number().int(), quorum: z.number().int() }),
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

/** Public result (05 §4): no question, location, evidence URLs or per-submission data. */
export const PublicVerificationResultSchema = VerificationResultSchema.omit({ rejected_submissions: true });

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
});

/** Client must round lat/lng to 3 decimals before sending (05 §3.2). */
export const WorkerTaskQuerySchema = z.object({
  lat: z.coerce.number().pipe(Lat),
  lng: z.coerce.number().pipe(Lng),
  radius_km: z.coerce
    .number()
    .int()
    .min(LIMITS.workerTaskSearchRadiusKm.min)
    .max(LIMITS.workerTaskSearchRadiusKm.max)
    .default(LIMITS.workerTaskSearchRadiusKm.default),
});

export const WorkerTaskSchema = z.object({
  verification_id: VerificationIdSchema,
  question: z.string(),
  answer_values: z.array(AnswerValueSchema),
  location: CreateVerificationRequestSchema.shape.location,
  distance_m: z.number().int(),
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
      lat: Lat,
      lng: Lng,
      accuracy_m: z.number().min(0).max(10_000),
    }),
    challenge: z.object({ nonce: z.string().min(1).max(128) }),
    evidence: z
      .array(z.object({ type: z.literal("photo"), object_ref: UploadIdSchema }))
      .min(1)
      .max(1), // MVP: exactly one photo
  })
  .strict();
export type SubmitEvidenceRequest = z.infer<typeof SubmitEvidenceRequestSchema>;

const ChecksMapSchema = z.record(z.string(), CheckStatusSchema);

export const SubmitEvidenceResponseSchema = z.object({
  submission_id: SubmissionIdSchema,
  state: z.enum(SUBMISSION_STATES).exclude(["CHECKING"]),
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
    key: z.enum(["tasks_create_enabled", "claims_enabled", "settlement_enabled", "public_evidence_enabled"]),
    value: z.boolean(),
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
