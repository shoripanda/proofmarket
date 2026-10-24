// External API contract as zod schemas — the single source of truth for request validation,
// TypeScript types and the generated OpenAPI document (packages/core/openapi.json).
// Specs: api-contract.md, implementation/en/05-api-design.md.

import { z } from "zod";
import { ASSET_SYMBOLS } from "../domain/assets.ts";
import {
  ANSWER_KINDS,
  API_SETTLEMENT_STATUSES,
  APPLICATION_STATES,
  CHECK_REASON_CODES,
  CHECK_STATUSES,
  CLAIM_STATES,
  FUNDING_STATUSES,
  MARKET_TASK_STATUSES,
  OUTCOME_REASONS,
  OUTCOMES,
  PLATFORM_FLAGS,
  PROFILE_LANGUAGES,
  RELEASE_MODES,
  SEAT_STATES,
  SELECTION_MODES,
  SETTLEMENT_STATUSES,
  STORE_REPORT_STATUSES,
  SUBMISSION_STATES,
  TASK_EVIDENCE_TYPES,
  TASK_STATUSES,
  TASK_TYPES,
  WEBHOOK_EVENTS,
} from "../domain/enums.ts";
import { LIMITS } from "../domain/limits.ts";
import { LOCATION_PRIVACY } from "../domain/location-privacy.ts";
import { REQUIRABLE_TIERS, WORKER_TIERS } from "../domain/trust.ts";
import { ERROR_CATALOG, type ErrorCode } from "../errors.ts";

// ---------- primitives ----------

const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`), `must be a ${prefix}_ ULID`);

export const VerificationIdSchema = id("ver");
export const QuoteIdSchema = id("qte");
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
/** What a reward is paid in (16 §3): a symbol from the asset registry. Which ones a server accepts is ASSETS_ENABLED. */
export const AssetSchema = z.enum(ASSET_SYMBOLS);
/** The chain a request settles on (15 §4.1): Devnet during the pilot, "solana" on mainnet. */
export const NetworkSchema = z.enum(["solana-devnet", "solana"]);
export type Network = z.infer<typeof NetworkSchema>;
export type Asset = z.infer<typeof AssetSchema>;
const Sha256Hex = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const SolanaSignature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);

/** An answer as stored: a fixed code, a requester-defined choice, a number or text (01 §4.15). */
export const AnswerValueSchema = z.string().min(1).max(LIMITS.answer.maxTextChars);
const ChoiceValue = z.string().trim().min(1).max(LIMITS.answer.maxChoiceChars);

const FieldKey = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, "snake_case key, up to 32 characters");
const FieldLabel = z.string().trim().min(1).max(LIMITS.answer.maxFieldLabelChars);
const ScaleLabel = z.string().trim().min(1).max(20);
/** One field of a form answer (01 §4.25): the same three shapes as a whole answer, named and labelled. */
export const FormFieldSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("enum"),
      key: FieldKey,
      label: FieldLabel,
      values: z.array(ChoiceValue).min(2).max(LIMITS.answer.maxChoices),
      required: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("number"),
      key: FieldKey,
      label: FieldLabel,
      unit: z.string().trim().min(1).max(16).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      required: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("text"),
      key: FieldKey,
      label: FieldLabel,
      max_chars: z.number().int().min(1).max(LIMITS.answer.maxTextChars).optional(),
      required: z.boolean().default(true),
    })
    .strict(),
  /**
   * Sense index (13 §4): a whole number from 1 to `max` (5 or 10, checked in validateAnswerSchema), shown as a
   * row of circles with `labels` at the two ends (e.g. "quiet", "loud").
   */
  z
    .object({
      type: z.literal("scale"),
      key: FieldKey,
      label: FieldLabel,
      min: z.literal(1).default(1),
      max: z.number().int(),
      labels: z.tuple([ScaleLabel, ScaleLabel]),
      required: z.boolean().default(true),
    })
    .strict(),
]);
export type FormField = z.infer<typeof FormFieldSchema>;

/**
 * How the worker answers. enum values must fit the type (TASK_TYPE_SPECS); checked in validateAnswerSchema.
 * form (01 §4.25): several named fields in one answer, for text types; stored and returned as one JSON object.
 */
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
  z
    .object({
      type: z.literal("form"),
      fields: z.array(FormFieldSchema).min(1).max(LIMITS.answer.maxFormFields),
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

/** The level whose counts equal these, or null. A challenge window means optimistic (13 §3). */
export function levelOf(a: {
  required_witnesses: number;
  quorum: number;
  challenge_minutes?: number | null;
}): AssuranceLevel | "optimistic" | null {
  if (a.challenge_minutes != null) return "optimistic";
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
export const AssuranceCountsOrLevelSchema = z
  .union([
    AssuranceCountsSchema,
    z
      .object({
        level: z.enum(LEVEL_NAMES).describe("fast = 1 witness, standard = 2 agreeing, high = 2 of 3"),
      })
      .strict(),
  ])
  .transform((a) => ("level" in a ? { ...ASSURANCE_LEVELS[a.level] } : a));

/**
 * Optimistic (13 §3): one person answers, the answer is provisional for `challenge_minutes`, and anyone with an
 * API key may challenge it for a bond of twice the bounty. Not for text answers (a recheck cannot match one).
 */
const OptimisticAssuranceSchema = z
  .object({
    level: z.literal("optimistic"),
    challenge_minutes: z
      .number()
      .int()
      .min(LIMITS.challenge.minMinutes)
      .max(LIMITS.challenge.maxMinutes)
      .default(LIMITS.challenge.defaultMinutes),
  })
  .strict()
  .transform((a) => ({ required_witnesses: 1, quorum: 1, challenge_minutes: a.challenge_minutes }));

/** Counts, a named level, or optimistic. Normalized to counts; `challenge_minutes` only for optimistic. */
export const AssuranceInputSchema = z.union([AssuranceCountsOrLevelSchema, OptimisticAssuranceSchema]);

/**
 * Attestation (13 §5): the agent asks a person to confirm something the agent itself did (delivered, installed,
 * cleaned). Checks and judgement are the same as any task; only the wording to the worker and on the proof changes.
 */
export const AgentAttestationSchema = z
  .object({
    subject: z.literal("agent_action"),
    description: z.string().trim().min(1).max(LIMITS.attestation.maxDescriptionChars),
  })
  .strict();
export type AgentAttestation = z.infer<typeof AgentAttestationSchema>;

export const CreateVerificationRequestSchema = z
  .object({
    type: z.enum(TASK_TYPES),
    question: z.string().min(1).max(LIMITS.question.maxChars),
    // Must match the type's answer kind and, for fixed-choice types, its values (validateAnswerSchema).
    answer_schema: AnswerSchemaSpec,
    /**
     * What a submission must contain to be accepted (01 §4.25): shown to the worker before they start and given
     * to the AI review next to the question. Plain language; no instructions to the reviewer.
     */
    acceptance_criteria: z.string().trim().min(1).max(LIMITS.acceptanceCriteria.maxChars).optional(),
    /** Confirm an action the agent says it took (13 §5). Shown to the worker and on the proof page. */
    attestation: AgentAttestationSchema.optional(),
    /** Required for at-a-place types; may be omitted for work that can be done anywhere (TASK_TYPE_SPECS). */
    location: LocationSchema.optional(),
    /** Within 24 h for work at a place; up to 7 days for work with no location (01 §4.25). */
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
    bounty: z
      .object({
        asset: AssetSchema,
        amount: Amount, // per witness (D-07)
        network: NetworkSchema,
        /**
         * Rising bounty (13 §1): the reward climbs in a straight line from `amount` to this ceiling until someone
         * claims; the amount at the first claim is what every witness is paid. `max_amount × witnesses` is reserved.
         */
        max_amount: Amount.optional(),
        /** Minutes the climb takes (10-1440). Defaults to the time until the deadline. Needs `max_amount`. */
        ramp_minutes: z.number().int().min(10).max(1440).optional(),
      })
      .refine((b) => b.max_amount === undefined || Number(b.max_amount) >= Number(b.amount), {
        path: ["max_amount"],
        message: "max_amount must be >= amount",
      })
      .refine((b) => b.ramp_minutes === undefined || b.max_amount !== undefined, {
        path: ["ramp_minutes"],
        message: "ramp_minutes needs max_amount",
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
    /**
     * How precisely public surfaces (proof page, map, dataset) show the place (13 §9 PR 7). "coarse" rounds it to
     * the centre of its geohash-6 cell, about 1 km. The requester always sees it exact. Default "exact".
     */
    location_privacy: z.enum(LOCATION_PRIVACY).optional(),
    /** Return a recent shared VERIFIED result for the same place instead of sending someone (01 §4.9). */
    reuse: z
      .object({ max_age_seconds: z.number().int().min(60).max(3600) })
      .strict()
      .optional(),
    /**
     * Confirm a quote from POST /v1/verifications/quote (docs/architecture 04 §4.2). The body must match the
     * quoted one (409 QUOTE_MISMATCH otherwise); the quote lasts five minutes. Without it, the request is
     * created and its cost reserved at once, as before.
     */
    quote_id: QuoteIdSchema.optional(),
  })
  .strict();
export type CreateVerificationRequest = z.infer<typeof CreateVerificationRequestSchema>;

/** POST /v1/verifications/quote: the same body, minus the quote it would confirm. */
export const QuoteVerificationRequestSchema = CreateVerificationRequestSchema.omit({ quote_id: true });

/** POST /v1/x402/verifications (01 §4.19): the payer's wallet stands in for the principal; 402 is the quote. */
export const X402CreateVerificationRequestSchema = CreateVerificationRequestSchema.omit({
  principal_ref: true,
  quote_id: true,
});

/**
 * What a request would cost, before anything is reserved (docs/architecture 04 §4.2). `policy.ok` is true when
 * the same body would be accepted right now; the checks are the ones POST /v1/verifications runs, in order.
 */
export const QuoteResponseSchema = z.object({
  quote_id: QuoteIdSchema,
  bounty: z.object({ asset: AssetSchema, amount: Amount, required_witnesses: z.number().int() }),
  /** `amount × required_witnesses` (the ceiling for a rising bounty): what goes into escrow for the witnesses. */
  bounty_total: Amount,
  /** On top of the bounty (docs/architecture 13 §6.1). Kept only for the witnesses who are paid. */
  platform_fee: z.object({ rate_bps: z.number().int(), amount: Amount.or(z.literal("0")) }),
  /** `bounty_total + platform_fee.amount`: what is reserved from the balance. */
  total: Amount,
  balance: Amount.or(z.literal("0")),
  balance_after: z.string(),
  policy: z.object({ checked: z.array(z.string()), ok: z.literal(true) }),
  /** A recent shared result would be returned for free instead of sending someone (01 §4.9). */
  reuse: z.object({ verification_id: VerificationIdSchema }).nullable(),
  expires_at: IsoDateTime,
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

export const CreateVerificationResponseSchema = z.object({
  verification_id: VerificationIdSchema,
  status: z.enum(["CREATED", "VERIFIED"]),
  created_at: IsoDateTime,
  funding: z.object({ status: z.enum(["PENDING", "NONE"]) }),
  /** true: an existing shared result was returned (01 §4.9); `verification_id` is that task and `result` is final. */
  reused: z.boolean().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /v1/verifications/batch (01 §4.25): one body, many tasks. Each item is the template with its own
 * location and/or question laid over it, then checked exactly like a single request. All or nothing.
 */
export const CreateVerificationBatchRequestSchema = z
  .object({
    template: CreateVerificationRequestSchema.omit({ quote_id: true }).partial({
      question: true,
      location: true,
    }),
    items: z
      .array(
        z
          .object({
            question: z.string().min(1).max(LIMITS.question.maxChars).optional(),
            location: LocationSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(LIMITS.batch.maxItems),
  })
  .strict();
export type CreateVerificationBatchRequest = z.infer<typeof CreateVerificationBatchRequestSchema>;
export const CreateVerificationBatchResponseSchema = z.object({
  /** In the order of `items`. */
  verifications: z.array(CreateVerificationResponseSchema),
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
  /**
   * 13 §3: true while an optimistic answer waits out its challenge window. The answer and hashes are already the
   * ones it will be finalized with unless a recheck overturns it. Not in result_hash.
   */
  provisional: z.literal(true).optional(),
  /**
   * 13 §3: the challenge window of an optimistic task. open: still running. closed: passed with no challenge.
   * challenged: a recheck is running. upheld / overturned: the recheck agreed / disagreed. Not in result_hash.
   */
  challenge: z
    .object({
      minutes: z.number().int(),
      until: IsoDateTime,
      state: z.enum(["open", "closed", "challenged", "upheld", "overturned"]),
    })
    .optional(),
  witnesses: z.object({ valid: z.number().int(), required: z.number().int(), quorum: z.number().int() }),
  /**
   * Sense index (13 §4): per number or scale field of a form, over 3 or more accepted answers. The median of an
   * even count is the lower middle value. Part of result_hash. Not a vote: the outcome is decided as for text.
   */
  aggregate: z
    .record(
      z.string(),
      z.object({ median: z.number(), min: z.number(), max: z.number(), n: z.number().int() }),
    )
    .optional(),
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
      network: NetworkSchema,
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
  acceptance_criteria: z.string().nullable(),
  /** What the agent asked a person to confirm it did (13 §5); null on an ordinary task. */
  attestation: AgentAttestationSchema.nullable(),
  answer_schema: AnswerSchemaSpec,
  location: LocationSchema.nullable(),
  location_privacy: z.enum(LOCATION_PRIVACY),
  /**
   * The salt of the evidence bundle's location_commitment (13 §9 PR 7); null on work with no place. Give it out
   * together with the place only to someone who should be able to check that the work happened there.
   */
  location_salt: z.string().nullable(),
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
    level: z.enum([...LEVEL_NAMES, "optimistic"]).nullable(),
    /** 13 §3: the challenge window of an optimistic task; null otherwise. */
    challenge_minutes: z.number().int().nullable(),
  }),
  bounty: z.object({
    asset: AssetSchema,
    amount: Amount,
    network: NetworkSchema,
    /** Rising bounty (13 §1); null when the reward is fixed. */
    max_amount: Amount.nullable(),
    ramp_minutes: z.number().int().nullable(),
    /** The reward per witness now; once someone has claimed, the fixed amount everyone is paid. */
    current_amount: Amount,
  }),
  witness_progress: z.object({
    valid: z.number().int(),
    active_claims: z.number().int(),
    open_slots: z.number().int(),
    required: z.number().int(),
    /** Submissions the AI review is still looking at (01 §4.27). */
    checking: z.number().int(),
    /** Submissions the AI review sent back to the worker as not matching the request; the worker may fix them. */
    returned: z.number().int(),
  }),
  /**
   * One paragraph a person can read, in Japanese and English, saying where the request stands: who is on it,
   * what the AI review found, the final answer and why it is (or is not) final (01 §4.27). The agent that asked
   * is expected to repeat it to its user as soon as it changes, so the verdict reaches them unasked.
   */
  summary: z.object({ ja: z.string(), en: z.string() }),
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
  aggregate: true,
}).extend({
  type: z.enum(TASK_TYPES),
  answer_kind: z.enum(ANSWER_KINDS),
  /**
   * What the agent asked a person to confirm it did (13 §5), written by the requester; null on an ordinary task.
   * Named apart from `attestation`, which here is the on-chain record. Not part of result_hash.
   */
  agent_attestation: AgentAttestationSchema.nullable(),
  /** Set only when the requester published the result (01 §4.22). */
  published: z
    .object({
      question: z.string(),
      location: z.object({ lat: z.number(), lng: z.number() }),
      /** Meters the place may be off by: 1200 when the requester asked for "coarse" (13 §9 PR 7); null when exact. */
      location_precision_m: z.number().int().nullable(),
      place_name: z.string().nullable(),
    })
    .nullable(),
});

/**
 * Where a result sits on Solana and how another program reads it (13 §2). The hashes and outcome are null until
 * the settle transaction is confirmed; a refunded task is never finalized on chain.
 */
export const PublicOnchainSchema = z.object({
  verification_id: VerificationIdSchema,
  network: NetworkSchema,
  program_id: z.string(),
  /** PDA ["task", sha256("proofmarket:task:v1:" + verification_id)]. */
  task_account: z.string(),
  /** True once finalize + settle is confirmed on chain. */
  recorded: z.boolean(),
  /** The Outcome the program stores: VERIFIED, NO_CONSENSUS (REJECTED) or INSUFFICIENT_WITNESSES (EXPIRED). */
  outcome: z.enum(["VERIFIED", "NO_CONSENSUS", "INSUFFICIENT_WITNESSES"]).nullable(),
  /** SHA-256(JCS(the result's hashed fields)); see RESULT_HASH_FIELDS. */
  result_hash: Sha256Hex.nullable(),
  evidence_root: Sha256Hex.nullable(),
  /** When ProofMarket finalized the result. The account's own finalized_at is the program clock, seconds later. */
  finalized_at: IsoDateTime.nullable(),
  /** Solana Explorer page of the Task account. */
  explorer_url: z.string(),
  how_to_read: z.object({ rust: z.string(), typescript: z.string() }),
});
export type PublicOnchain = z.infer<typeof PublicOnchainSchema>;

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
      /** Meters the place may be off by: 1200 when the requester asked for "coarse" (13 §9 PR 7); null when exact. */
      location_precision_m: z.number().int().nullable(),
      place_name: z.string().nullable(),
      witnesses: z.number().int(),
      verified_at: IsoDateTime,
      result_url: z.string(),
    }),
  ),
});
export type PublicMap = z.infer<typeof PublicMapSchema>;

/** Open dataset (01 §4.24): published VERIFIED results with their on-chain record. Never photos or workers. */
export const PublicDatasetRowSchema = z.object({
  verification_id: VerificationIdSchema,
  type: z.enum(TASK_TYPES),
  question: z.string(),
  answer: AnswerValueSchema,
  answer_kind: z.enum(["enum", "number"]),
  unit: z.string().nullable(),
  location: z.object({ lat: z.number(), lng: z.number() }),
  /** Meters the place may be off by: 1200 when the requester asked for "coarse" (13 §9 PR 7); null when exact. */
  location_precision_m: z.number().int().nullable(),
  place_name: z.string().nullable(),
  witnesses: z.number().int(),
  verified_at: IsoDateTime,
  evidence_root: Sha256Hex,
  result_hash: Sha256Hex,
  attestation: z
    .object({ network: NetworkSchema, signature: SolanaSignature, explorer_url: z.url() })
    .nullable(),
  proof_url: z.url(),
});
export const PublicDatasetSchema = z.object({
  generated_at: IsoDateTime,
  license: z.literal("CC-BY-4.0"),
  attribution: z.string(),
  count: z.number().int(),
  rows: z.array(PublicDatasetRowSchema),
});
export type PublicDataset = z.infer<typeof PublicDatasetSchema>;

/** GET /v1/public/assets (16 §3.2): what this server accepts as a reward, in registry order. */
export const PublicAssetsSchema = z.object({
  network: NetworkSchema,
  assets: z.array(
    z.object({
      symbol: AssetSchema,
      name: z.string(),
      mint: z.string(),
      token_program: z.enum(["spl-token", "token-2022"]),
      decimals: z.number().int(),
      /** Fraction digits `bounty.amount` may have in this asset: min(6, decimals). */
      amount_decimals: z.number().int(),
      min_bounty: z.string().nullable(),
      /** The value moves with the market (SOL, JUP, BONK ...). */
      volatile: z.boolean(),
      x402: z.boolean(),
    }),
  ),
});
export type PublicAssets = z.infer<typeof PublicAssetsSchema>;

/**
 * Public track record (05 §4.1): aggregates only. No question, answer, location, worker or payout address.
 * Recent results link to /r/<id> only when the operator featured them; otherwise just the Explorer transaction.
 */
export const PublicStatsSchema = z.object({
  generated_at: IsoDateTime,
  verifications: z.object({ total: z.number().int(), completed: z.number().int() }),
  workers_with_valid_submission: z.number().int(),
  requesters: z.number().int(),
  /** USDC only, as before SOL existed; every asset is in paid_by_asset. */
  paid_to_workers: z.object({
    asset: z.literal("USDC"),
    amount: z.string().regex(/^\d+(\.\d{1,6})?$/),
    network: NetworkSchema,
  }),
  paid_by_asset: z.array(z.object({ asset: AssetSchema, amount: z.string().regex(/^\d+(\.\d{1,6})?$/) })),
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
  /** What the requester will accept (01 §4.25). Null when they did not say. */
  acceptance_criteria: z.string().nullable(),
  /** The agent's claim the worker is asked to check (13 §5); null on an ordinary task. */
  attestation: AgentAttestationSchema.nullable(),
  answer_values: z.array(AnswerValueSchema),
  answer_schema: AnswerSchemaSpec,
  /** null: the work can be done anywhere. */
  location: LocationSchema.nullable(),
  distance_m: z.number().int().nullable(),
  reward: z.object({
    asset: AssetSchema,
    amount: Amount,
    /** Rising bounty (13 §1): the amount now (equals `amount`, kept for clients that read it). */
    current: Amount,
    /** The ceiling, or null when the reward does not rise. */
    max: Amount.nullable(),
    /** When it reaches the ceiling; null when it does not rise (or was already fixed by a claim). */
    rises_until: IsoDateTime.nullable(),
  }),
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
  acceptance_criteria: z.string().nullable(),
  attestation: AgentAttestationSchema.nullable(),
  answer_values: z.array(AnswerValueSchema),
  answer_schema: AnswerSchemaSpec,
  location_required: z.boolean(),
});

export const PayoutsResponseSchema = z.object({
  payouts: z.array(
    z.object({
      verification_id: VerificationIdSchema,
      amount: Amount,
      asset: AssetSchema,
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
  data: z.union([
    z.object({ verification_id: VerificationIdSchema, status: z.enum(TASK_STATUSES) }),
    /** task.* events (docs/architecture 13 §7.3): GET /v1/tasks/{task_id} for the details. */
    z.object({
      task_id: z.string(),
      seat_id: z.string().optional(),
      application_id: z.string().optional(),
      state: z.string(),
    }),
  ]),
});

// ---------- self-service webhook endpoints (docs/architecture 12 §5.1) ----------

export const WEBHOOK_TEST_EVENT = "webhook.test" as const;

export const CreateWebhookRequestSchema = z
  .object({
    /** Public HTTPS only. Private and loopback addresses are refused. */
    url: z.string().url().max(500),
    /** Events to receive; ["*"] means all of them. */
    events: z.array(z.enum([...WEBHOOK_EVENTS, "*"])).min(1),
  })
  .strict();
export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequestSchema>;

export const WebhookEndpointSchema = z.object({
  id: z.string().regex(/^whk_/),
  url: z.string(),
  events: z.array(z.enum(WEBHOOK_EVENTS)),
  status: z.enum(["active", "disabled"]),
});

/** The signing secret appears once, here. Verify `ProofMarket-Signature` against the raw body with it. */
export const CreateWebhookResponseSchema = z.object({
  endpoint: WebhookEndpointSchema,
  secret: z.string().regex(/^whsec_/),
});

export const WebhookListResponseSchema = z.object({ endpoints: z.array(WebhookEndpointSchema) });

export const WebhookDeliverySchema = z.object({
  id: z.string().regex(/^evt_/),
  endpoint_id: z.string(),
  event: z.string(),
  verification_id: z.string().nullable(),
  created_at: IsoDateTime,
  attempts: z.number().int(),
  last_status: z.number().int().nullable(),
  delivered_at: IsoDateTime.nullable(),
});

export const WebhookDeliveriesQuerySchema = z.object({
  endpoint_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const WebhookDeliveriesResponseSchema = z.object({ deliveries: z.array(WebhookDeliverySchema) });

/** A test is sent at once (not queued) so the reply says whether the receiver accepted it. */
export const WebhookTestResponseSchema = z.object({
  delivery: WebhookDeliverySchema,
  ok: z.boolean(),
});

// ---------- recurring checks (04 §3.23) ----------
const HhmmSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "HH:MM (Japan time)");
/** When to stop a watch (01 §4.23): the first VERIFIED result whose answer matches ends the schedule. */
export const StopWhenSchema = z.union([
  z.object({ answer: AnswerValueSchema }).strict(),
  z.object({ answer_in: z.array(AnswerValueSchema).min(1).max(LIMITS.answer.maxChoices) }).strict(),
  z
    .object({ number: z.object({ min: z.number().optional(), max: z.number().optional() }).strict() })
    .strict()
    .refine((s) => s.number.min !== undefined || s.number.max !== undefined, "min or max is required"),
]);
export type StopWhen = z.infer<typeof StopWhenSchema>;

export const CreateScheduleRequestSchema = z
  .object({
    request: CreateVerificationRequestSchema.omit({ deadline: true, quote_id: true }),
    deadline_minutes: z.number().int().min(10).max(1440),
    /** Fixed times mode: both are required together. */
    times_jst: z.array(HhmmSchema).min(1).max(24).optional(),
    days_jst: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .describe("0 = Sunday ... 6 = Saturday")
      .optional(),
    /** Interval mode (01 §4.23): a run every N minutes, the first one right away. */
    every_minutes: z.number().int().min(15).max(1440).optional(),
    /** Stop after this many runs (01 §4.23). */
    max_runs: z.number().int().min(1).max(200).optional(),
    /** Stop once a VERIFIED result matches (01 §4.23). Not for text answers. */
    stop_when: StopWhenSchema.optional(),
    ends_at: IsoDateTime.optional(),
  })
  .strict()
  .refine(
    (b) => (b.every_minutes !== undefined) !== (b.times_jst !== undefined && b.days_jst !== undefined),
    {
      path: ["every_minutes"],
      message: "give either every_minutes, or times_jst with days_jst",
    },
  );
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;

export const SCHEDULE_STOP_REASONS = [
  "condition_met",
  "max_runs",
  "ended",
  "failures",
  "suspended",
  "stopped",
] as const;

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
  every_minutes: z.number().int().nullable(),
  max_runs: z.number().int().nullable(),
  runs: z.number().int(),
  stop_when: StopWhenSchema.nullable(),
  stopped_reason: z.enum(SCHEDULE_STOP_REASONS).nullable(),
  matched_verification_id: z.string().nullable(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;
export const ScheduleListResponseSchema = z.object({ schedules: z.array(ScheduleSchema) });

// ---------- disputes (01 §4.12) ----------
export const DisputeRequestSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    assurance: AssuranceCountsOrLevelSchema.optional(),
    deadline_minutes: z.number().int().min(10).max(1440).optional(),
  })
  .strict();
export const DisputeResponseSchema = z.object({
  verification_id: VerificationIdSchema,
  recheck_verification_id: VerificationIdSchema,
});

// ---------- GET /v1/verifications (docs/architecture 04 §4.1) ----------
export const ListVerificationsQuerySchema = z.object({
  /** Comma separated task statuses; all when omitted. */
  status: z.string().optional(),
  created_after: IsoDateTime.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** The `next_cursor` of the previous page. */
  cursor: VerificationIdSchema.optional(),
});
/** One row of the list: enough to pick a verification and see where it stands. No photos, no free text. */
export const VerificationSummarySchema = z.object({
  verification_id: VerificationIdSchema,
  type: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  funding_status: z.enum(FUNDING_STATUSES),
  settlement_status: z.enum(SETTLEMENT_STATUSES),
  /** The outcome once there is a result; null while the work is in progress. */
  result_status: z.enum(OUTCOMES).nullable(),
  bounty: z.object({ asset: AssetSchema, amount: Amount, network: NetworkSchema }),
  required_witnesses: z.number().int(),
  recheck_of: VerificationIdSchema.nullable(),
  deadline: IsoDateTime,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});
export const ListVerificationsResponseSchema = z.object({
  verifications: z.array(VerificationSummarySchema),
  next_cursor: VerificationIdSchema.nullable(),
});
export type VerificationSummary = z.infer<typeof VerificationSummarySchema>;
export type ListVerificationsQuery = z.infer<typeof ListVerificationsQuerySchema>;
export type ListVerificationsResponse = z.infer<typeof ListVerificationsResponseSchema>;

// ---------- challenges of an optimistic answer (13 §3). "Objection" here: `challenge` is the photo nonce ----------
export const ObjectionRequestSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const ObjectionResponseSchema = z.object({
  verification_id: VerificationIdSchema,
  recheck_verification_id: VerificationIdSchema,
  /** Twice the bounty, reserved from the caller's balance. Returned in full if the recheck disagrees. */
  bond: z.object({ asset: AssetSchema, amount: Amount }),
  state: z.literal("challenged"),
});

// ---------- general tasks (docs/architecture 13, D1-D6 of 2026-10-16) ----------

const TaskIdSchema = z.string().regex(/^tsk_[0-9A-HJKMNP-TV-Z]{26}$/);
const SeatIdSchema = z.string().regex(/^seat_[0-9A-HJKMNP-TV-Z]{26}$/);
const ApplicationIdSchema = z.string().regex(/^app_[0-9A-HJKMNP-TV-Z]{26}$/);

export const TaskQuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
    label: z.string().trim().min(1).max(200),
    required: z.boolean().default(true),
  })
  .strict();

export const CreateTaskRequestSchema = z
  .object({
    title: z.string().trim().min(5).max(200),
    description: z.string().trim().min(20).max(5000),
    /** What "done" means, in terms someone else could check. */
    completion_criteria: z.string().trim().min(5).max(2000),
    evidence_types: z.array(z.enum(TASK_EVIDENCE_TYPES)).min(1).max(4),
    /** City or ward. Never an exact address in public text. Omit with remote_ok for work done anywhere. */
    area: z.string().trim().min(1).max(100).optional(),
    remote_ok: z.boolean().default(false),
    price: z.object({ asset: AssetSchema, amount: Amount, network: NetworkSchema }).strict(),
    seats: z.number().int().min(1).max(50).default(1),
    selection_mode: z.enum(SELECTION_MODES).default("application"),
    release_mode: z.enum(RELEASE_MODES).default("manual"),
    completion_window_hours: z.number().int().min(1).max(168).default(24),
    /** No new applicants after this. */
    deadline: IsoDateTime,
    application_questions: z.array(TaskQuestionSchema).max(5).default([]),
    /** true: run every check and return the cost; nothing is created or reserved. */
    dry_run: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.area !== undefined || b.remote_ok, { message: "give an area or set remote_ok" });
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const TaskCostSchema = z.object({
  asset: AssetSchema,
  price_per_seat: Amount,
  seats: z.number().int(),
  platform_fee: z.object({ rate_bps: z.number().int(), per_seat: z.string(), amount: z.string() }),
  total: Amount,
});

export const SeatViewSchema = z.object({
  seat_id: SeatIdSchema,
  seat_no: z.number().int(),
  round: z.number().int(),
  state: z.enum(SEAT_STATES),
  worker_ref: z.string(),
  funded: z.boolean(),
  assigned_at: IsoDateTime,
  due_at: IsoDateTime,
  submitted_at: IsoDateTime.nullable(),
  /** manual release: when the 24 h rule pays the worker if nothing is decided (D2). */
  review_due_at: IsoDateTime.nullable(),
  revisions: z.number().int(),
  released_by: z.enum(["requester", "timeout", "auto"]).nullable(),
  decision_reason: z.string().nullable(),
  delivery: z.object({ round: z.number().int(), body: z.string(), links: z.array(z.string()) }).nullable(),
});

export const TaskViewSchema = z.object({
  task_id: TaskIdSchema,
  kind: z.literal("task"),
  status: z.enum(MARKET_TASK_STATUSES),
  title: z.string(),
  description: z.string(),
  completion_criteria: z.string(),
  evidence_types: z.array(z.enum(TASK_EVIDENCE_TYPES)),
  area: z.string().nullable(),
  remote_ok: z.boolean(),
  selection_mode: z.enum(SELECTION_MODES),
  release_mode: z.enum(RELEASE_MODES),
  completion_window_hours: z.number().int(),
  deadline: IsoDateTime,
  application_questions: z.array(TaskQuestionSchema),
  cost: TaskCostSchema,
  applications_pending: z.number().int(),
  seats: z.array(SeatViewSchema),
  created_at: IsoDateTime,
});
export type TaskView = z.infer<typeof TaskViewSchema>;

export const TaskDryRunResponseSchema = z.object({
  dry_run: z.literal(true),
  cost: TaskCostSchema,
  balance_after: z.string(),
});

export const TaskListResponseSchema = z.object({ tasks: z.array(TaskViewSchema) });

export const ApplicationViewSchema = z.object({
  application_id: ApplicationIdSchema,
  worker_ref: z.string(),
  state: z.enum(APPLICATION_STATES),
  answers: z.record(z.string(), z.string()),
  note: z.string().nullable(),
  /** The worker's public profile when they chose to publish one (D5); otherwise only completed counts. */
  worker: z.object({ completed_tasks: z.number().int(), completed_verifications: z.number().int() }),
  created_at: IsoDateTime,
});
export const ApplicationListResponseSchema = z.object({ applications: z.array(ApplicationViewSchema) });

export const DecisionReasonSchema = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();
export const ReleaseSeatRequestSchema = z.object({ acknowledge_release: z.literal(true) }).strict();

export const ApplyTaskRequestSchema = z
  .object({
    answers: z.record(z.string(), z.string().max(1000)).default({}),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const DeliverSeatRequestSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    links: z.array(z.url().max(500)).max(10).default([]),
  })
  .strict();

// ---------- public worker profiles (docs/architecture 14 §3) ----------

const ProfileText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(min).max(max));

/** PUT /v1/worker/profile. A worker session only; requester keys cannot edit profiles. */
export const WorkerProfileUpdateSchema = z
  .object({
    public: z.boolean(),
    indexable: z.boolean().default(false),
    display_name: ProfileText(2, 40),
    /** A city or ward, never a street, station or coordinates: no digits. */
    city: ProfileText(1, 40)
      .refine((v) => !/[0-9０-９]/.test(v), "no digits: a city or ward only")
      .nullable()
      .default(null),
    skills: z.array(ProfileText(1, 30)).max(10).default([]),
    languages: z.array(z.enum(PROFILE_LANGUAGES)).max(5).default([]),
  })
  .strict();

export const PublicWorkerProfileSchema = z.object({
  public_id: z.string().regex(/^pw_[a-z0-9]{20}$/),
  display_name: z.string(),
  city: z.string().nullable(),
  skills: z.array(z.string()),
  languages: z.array(z.enum(PROFILE_LANGUAGES)),
  /** Released task seats plus valid verification submissions. */
  completed: z.number().int(),
  /** Shown from 3 ratings; null below that. */
  rating: z.object({ average: z.number(), count: z.number().int() }).nullable(),
  /** YYYY-MM */
  member_since: z.string().regex(/^\d{4}-\d{2}$/),
  note: z.string(),
});

export const PublicWorkersQuerySchema = z.object({
  skill: z.string().trim().max(30).optional(),
  city: z.string().trim().max(40).optional(),
  lang: z.enum(PROFILE_LANGUAGES).optional(),
  cursor: z.string().max(200).optional(),
});

export const PublicWorkersListSchema = z.object({
  workers: z.array(PublicWorkerProfileSchema.omit({ note: true })),
  next_cursor: z.string().nullable(),
  note: z.string(),
});
export type PublicWorkerProfile = z.infer<typeof PublicWorkerProfileSchema>;
