// Drizzle schema. Source of truth for the DB; mirrors 04-database-design.md §3.
// Invariants enforced here (not only in app code): idempotency, replay, one vote per worker,
// one ISSUED challenge per claim, settle XOR refund, RELEASE XOR REFUND.
// Things Drizzle cannot express (append-only trigger, RLS) live in drizzle/0001_custom.sql.

import {
  ACTOR_TYPES,
  CHALLENGE_STATES,
  CLAIM_STATES,
  FUNDING_STATUSES,
  OUTBOX_JOB_KINDS,
  OUTCOME_REASONS,
  OUTCOMES,
  PAYMENT_KINDS,
  PLATFORM_FLAGS,
  SETTLEMENT_STATUSES,
  SUBMISSION_STATES,
  TASK_STATUSES,
  UPLOAD_STATES,
} from "@proofmarket/core";
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 20, scale: 6 });

/** `col in ('A','B',...)` built from a core enum array (values are compile-time constants, not user input). */
const inList = (col: string, values: readonly string[]) =>
  `${col} in (${values.map((v) => `'${v}'`).join(",")})`;
const oneOf = (col: string, values: readonly string[]) => sql.raw(inList(col, values));

// ---------- 3.1 principals ----------
export const principals = pgTable(
  "principals",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    displayName: text("display_name").notNull(),
    verificationStatus: text("verification_status").notNull().default("unverified"),
    jurisdiction: text("jurisdiction").notNull().default("JP"),
    status: text("status").notNull().default("active"),
    contactEncrypted: bytea("contact_encrypted"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (_t) => [
    check("principals_type_chk", oneOf("type", ["person", "organization"])),
    check("principals_verification_chk", oneOf("verification_status", ["unverified", "verified"])),
    check("principals_status_chk", oneOf("status", ["active", "suspended"])),
  ],
);

// ---------- 3.2 requester_credentials ----------
export const requesterCredentials = pgTable(
  "requester_credentials",
  {
    id: text("id").primaryKey(),
    principalId: text("principal_id")
      .notNull()
      .references(() => principals.id),
    requesterName: text("requester_name").notNull(),
    keyPrefix: text("key_prefix").notNull().unique(),
    secretHash: bytea("secret_hash").notNull().unique(),
    allowedTaskTypes: text("allowed_task_types")
      .array()
      .notNull()
      .default(sql`'{PLACE_STATUS_VERIFICATION}'`),
    maxTaskAmount: money("max_task_amount").notNull(),
    dailySpendLimit: money("daily_spend_limit").notNull(),
    rateLimitPerMin: integer("rate_limit_per_min").notNull().default(30),
    allowedBbox: doublePrecision("allowed_bbox").array(),
    status: text("status").notNull().default("active"),
    createdAt: tsz("created_at").notNull().defaultNow(),
    revokedAt: tsz("revoked_at"),
  },
  (_t) => [check("requester_credentials_status_chk", oneOf("status", ["active", "suspended"]))],
);

// ---------- 3.3 requester_ledger ----------
export const requesterLedger = pgTable(
  "requester_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    credentialId: text("credential_id")
      .notNull()
      .references(() => requesterCredentials.id),
    verificationId: text("verification_id").references(() => verificationRequests.id),
    entryType: text("entry_type").notNull(),
    amount: money("amount").notNull(),
    asset: text("asset").notNull().default("USDC"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("requester_ledger_entry_chk", oneOf("entry_type", ["TOPUP", "RESERVE", "RELEASE", "REFUND"])),
    unique("requester_ledger_task_entry_uq").on(t.verificationId, t.entryType),
    uniqueIndex("one_credit_back_per_task")
      .on(t.verificationId)
      .where(sql`entry_type in ('RELEASE','REFUND')`),
  ],
);

// ---------- 3.3a places ----------
export const places = pgTable(
  "places",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    category: text("category").notNull(),
    approvedBy: text("approved_by").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (_t) => [
    check("places_category_chk", oneOf("category", ["retail", "restaurant", "service", "public_facility"])),
    check("places_status_chk", oneOf("status", ["active", "disabled"])),
  ],
);

// ---------- 3.18 webhook_endpoints (declared before verification_requests for the FK) ----------
export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: text("id").primaryKey(),
  credentialId: text("credential_id")
    .notNull()
    .references(() => requesterCredentials.id),
  url: text("url").notNull(),
  secretEnc: bytea("secret_enc").notNull(),
  events: text("events").array().notNull(),
  status: text("status").notNull().default("active"),
});

// ---------- 3.4 verification_requests ----------
export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: text("id").primaryKey(),
    credentialId: text("credential_id")
      .notNull()
      .references(() => requesterCredentials.id),
    principalId: text("principal_id")
      .notNull()
      .references(() => principals.id),
    type: text("type").notNull(),
    question: text("question").notNull(),
    answerValues: text("answer_values").array().notNull(),
    targetLat: doublePrecision("target_lat").notNull(),
    targetLng: doublePrecision("target_lng").notNull(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id),
    radiusM: integer("radius_m").notNull(),
    deadline: tsz("deadline").notNull(),
    freshnessMaxAgeS: integer("freshness_max_age_s").notNull(),
    evidencePhotoRequired: boolean("evidence_photo_required").notNull().default(true),
    evidenceNonceRequired: boolean("evidence_nonce_required").notNull().default(true),
    requiredWitnesses: smallint("required_witnesses").notNull(),
    quorum: smallint("quorum").notNull(),
    bountyAsset: text("bounty_asset").notNull(),
    bountyAmount: money("bounty_amount").notNull(),
    bountyNetwork: text("bounty_network").notNull(),
    status: text("status").notNull(),
    fundingStatus: text("funding_status").notNull().default("NONE"),
    settlementStatus: text("settlement_status").notNull().default("NONE"),
    statusReason: text("status_reason"),
    taskIdHash: bytea("task_id_hash").notNull().unique(),
    idempotencyKeyHash: bytea("idempotency_key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    policyRuleVersion: text("policy_rule_version").notNull(),
    callbackEndpointId: text("callback_endpoint_id").references(() => webhookEndpoints.id),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("vr_type_chk", sql`type = 'PLACE_STATUS_VERIFICATION'`),
    check("vr_question_len_chk", sql`char_length(question) <= 280`),
    check("vr_radius_chk", sql`radius_m between 25 and 500`),
    check("vr_freshness_chk", sql`freshness_max_age_s between 60 and 900`),
    check("vr_witnesses_chk", sql`required_witnesses between 1 and 5`),
    check("vr_quorum_chk", sql`quorum between 1 and required_witnesses`),
    check("vr_bounty_chk", sql`bounty_amount > 0`),
    check("vr_network_chk", sql`bounty_network = 'solana-devnet'`),
    check("vr_status_chk", oneOf("status", TASK_STATUSES)),
    check("vr_funding_chk", oneOf("funding_status", FUNDING_STATUSES)),
    check("vr_settlement_chk", oneOf("settlement_status", SETTLEMENT_STATUSES)),
    unique("vr_idempotency_uq").on(t.credentialId, t.idempotencyKeyHash),
    index("vr_status_deadline_idx").on(t.status, t.deadline),
  ],
);

// ---------- 3.5 workers / consents / invites ----------
export const workers = pgTable(
  "workers",
  {
    id: text("id").primaryKey(),
    privyUserId: text("privy_user_id").notNull().unique(),
    payoutPubkey: text("payout_pubkey").notNull().unique(),
    inviteCodeId: text("invite_code_id").notNull(),
    status: text("status").notNull().default("active"),
    coarseArea: text("coarse_area"),
    stats: jsonb("stats").notNull().default({}),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (_t) => [check("workers_status_chk", oneOf("status", ["active", "suspended"]))],
);

export const workerConsents = pgTable(
  "worker_consents",
  {
    workerId: text("worker_id")
      .notNull()
      .references(() => workers.id),
    document: text("document").notNull(),
    version: text("version").notNull(),
    acceptedAt: tsz("accepted_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workerId, t.document, t.version] }),
    check("worker_consents_doc_chk", oneOf("document", ["worker_terms", "safety_rules", "privacy_notice"])),
  ],
);

export const inviteCodes = pgTable("invite_codes", {
  id: text("id").primaryKey(),
  codeHash: bytea("code_hash").notNull().unique(),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: tsz("expires_at").notNull(),
});

// ---------- 3.6 claims ----------
export const claims = pgTable(
  "claims",
  {
    id: text("id").primaryKey(),
    verificationId: text("verification_id")
      .notNull()
      .references(() => verificationRequests.id),
    workerId: text("worker_id")
      .notNull()
      .references(() => workers.id),
    state: text("state").notNull(),
    attempts: smallint("attempts").notNull().default(0),
    acceptedAt: tsz("accepted_at").notNull().defaultNow(),
    expiresAt: tsz("expires_at").notNull(),
    closedAt: tsz("closed_at"),
    closeReason: text("close_reason"),
  },
  (t) => [
    check("claims_state_chk", oneOf("state", CLAIM_STATES)),
    unique("claims_one_per_worker_uq").on(t.verificationId, t.workerId),
    index("claims_task_state_idx").on(t.verificationId, t.state),
  ],
);

// ---------- 3.7 challenges ----------
export const challenges = pgTable(
  "challenges",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id),
    nonceHash: bytea("nonce_hash").notNull().unique(),
    state: text("state").notNull(),
    issuedAt: tsz("issued_at").notNull().defaultNow(),
    expiresAt: tsz("expires_at").notNull(),
    usedAt: tsz("used_at"),
  },
  (t) => [
    check("challenges_state_chk", oneOf("state", CHALLENGE_STATES)),
    uniqueIndex("one_issued_challenge_per_claim").on(t.claimId).where(sql`state = 'ISSUED'`),
  ],
);

// ---------- 3.8 uploads ----------
export const uploads = pgTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id),
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challenges.id),
    objectKey: text("object_key").notNull().unique(),
    state: text("state").notNull(),
    issuedAt: tsz("issued_at").notNull().defaultNow(),
  },
  (_t) => [check("uploads_state_chk", oneOf("state", UPLOAD_STATES))],
);

// ---------- 3.9 witness_submissions ----------
export const witnessSubmissions = pgTable(
  "witness_submissions",
  {
    id: text("id").primaryKey(),
    verificationId: text("verification_id")
      .notNull()
      .references(() => verificationRequests.id),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id),
    workerId: text("worker_id")
      .notNull()
      .references(() => workers.id),
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challenges.id)
      .unique(),
    answer: text("answer").notNull(),
    state: text("state").notNull(),
    firstFailedCheck: text("first_failed_check"),
    reasonCode: text("reason_code"),
    acceptedForConsensus: boolean("accepted_for_consensus").notNull().default(false),
    clientTimestamp: tsz("client_timestamp"),
    serverReceivedAt: tsz("server_received_at").notNull().defaultNow(),
    submissionHash: bytea("submission_hash"),
    idempotencyKeyHash: bytea("idempotency_key_hash").notNull(),
  },
  (t) => [
    check("ws_state_chk", oneOf("state", SUBMISSION_STATES)),
    unique("ws_idempotency_uq").on(t.claimId, t.idempotencyKeyHash),
    uniqueIndex("one_checking_submission_per_claim").on(t.claimId).where(sql`state = 'CHECKING'`),
    uniqueIndex("one_valid_submission_per_claim").on(t.claimId).where(sql`state = 'VALID'`),
  ],
);

// ---------- 3.10 evidence_objects ----------
export const evidenceObjects = pgTable(
  "evidence_objects",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => witnessSubmissions.id),
    uploadId: text("upload_id")
      .notNull()
      .references(() => uploads.id)
      .unique(),
    rawObjectKey: text("raw_object_key"),
    derivedObjectKey: text("derived_object_key"),
    mediaType: text("media_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: bytea("sha256").notNull(),
    dhash: bigint("dhash", { mode: "bigint" }),
    serverReceivedAt: tsz("server_received_at").notNull(),
    clientCaptureAt: tsz("client_capture_at"),
    rawMetadataEnc: bytea("raw_metadata_enc"),
    retentionClass: text("retention_class").notNull().default("raw_evidence"),
    deleteAfter: tsz("delete_after").notNull(),
    deletedAt: tsz("deleted_at"),
  },
  // Exact replay across ALL tasks (REQ-V-004). Rows outlive the files, so the guard persists after purge.
  (t) => [uniqueIndex("evidence_sha256_unique").on(t.sha256)],
);

// ---------- 3.11 location_observations ----------
export const locationObservations = pgTable("location_observations", {
  submissionId: text("submission_id")
    .primaryKey()
    .references(() => witnessSubmissions.id),
  coordsEnc: bytea("coords_enc"), // AES-256-GCM(lat,lng); null after 30 days
  accuracyM: real("accuracy_m").notNull(),
  distanceToTargetM: real("distance_to_target_m").notNull(),
  geofencePass: boolean("geofence_pass").notNull(),
  clientTimestamp: tsz("client_timestamp"),
  serverReceivedAt: tsz("server_received_at").notNull(),
  riskFlags: text("risk_flags").array().notNull().default(sql`'{}'`),
  deleteAfter: tsz("delete_after").notNull(),
});

// ---------- 3.12 evidence_checks ----------
export const evidenceChecks = pgTable(
  "evidence_checks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => witnessSubmissions.id),
    checkType: text("check_type").notNull(),
    status: text("status").notNull(),
    reasonCode: text("reason_code"),
    machineDetails: jsonb("machine_details").notNull().default({}),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("ec_status_chk", oneOf("status", ["pass", "fail", "warning", "not_run"])),
    unique("ec_one_per_type_uq").on(t.submissionId, t.checkType),
  ],
);

// ---------- 3.13 verification_results ----------
export const verificationResults = pgTable(
  "verification_results",
  {
    verificationId: text("verification_id")
      .primaryKey()
      .references(() => verificationRequests.id),
    outcome: text("outcome").notNull(),
    outcomeReason: text("outcome_reason"),
    finalAnswer: text("final_answer"),
    validWitnessCount: smallint("valid_witness_count").notNull(),
    requiredWitnesses: smallint("required_witnesses").notNull(),
    quorum: smallint("quorum").notNull(),
    consensusRatio: numeric("consensus_ratio", { precision: 5, scale: 4 }),
    answerCounts: jsonb("answer_counts").notNull(),
    acceptedSubmissionIds: text("accepted_submission_ids").array().notNull(),
    evidenceBundle: jsonb("evidence_bundle").notNull(),
    evidenceRoot: bytea("evidence_root").notNull(),
    resultHash: bytea("result_hash").notNull(),
    finalizedAt: tsz("finalized_at").notNull(), // set once by the app; no DB default (07 §5.2)
  },
  (_t) => [
    check("vres_outcome_chk", oneOf("outcome", OUTCOMES)),
    check(
      "vres_reason_chk",
      sql.raw(`outcome_reason is null or ${inList("outcome_reason", OUTCOME_REASONS)}`),
    ),
  ],
);

// ---------- 3.14 payment_records ----------
export const paymentRecords = pgTable(
  "payment_records",
  {
    id: text("id").primaryKey(),
    verificationId: text("verification_id")
      .notNull()
      .references(() => verificationRequests.id),
    kind: text("kind").notNull(),
    asset: text("asset").notNull(),
    amount: money("amount").notNull(),
    network: text("network").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastSignature: text("last_signature"),
    signatures: text("signatures").array().notNull().default(sql`'{}'`),
    recipients: jsonb("recipients"),
    lastError: text("last_error"),
    createdAt: tsz("created_at").notNull().defaultNow(),
    confirmedAt: tsz("confirmed_at"),
  },
  (t) => [
    check("pr_kind_chk", oneOf("kind", PAYMENT_KINDS)),
    check("pr_status_chk", oneOf("status", ["PENDING", "SUBMITTED", "CONFIRMED", "FAILED"])),
    unique("pr_task_kind_uq").on(t.verificationId, t.kind),
    // Settle XOR refund per task (A5, D9/D10) — holds even without the on-chain program (10 §4 fallback).
    uniqueIndex("settle_xor_refund")
      .on(t.verificationId)
      .where(sql`kind in ('FINALIZE_AND_SETTLE','REFUND')`),
  ],
);

// ---------- 3.15 audit_events (append-only trigger in 0001_custom.sql) ----------
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    verificationId: text("verification_id"),
    actorType: text("actor_type").notNull(),
    actorRef: text("actor_ref"),
    eventType: text("event_type").notNull(),
    beforeState: text("before_state"),
    afterState: text("after_state"),
    correlationId: text("correlation_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("audit_actor_chk", oneOf("actor_type", ACTOR_TYPES)),
    index("audit_verification_idx").on(t.verificationId, t.createdAt),
  ],
);

// ---------- 3.16 idempotency_keys ----------
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    scope: text("scope").notNull(),
    keyHash: bytea("key_hash").notNull(),
    endpoint: text("endpoint").notNull(),
    requestHash: bytea("request_hash").notNull(),
    state: text("state").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.endpoint, t.keyHash] }),
    check("idem_state_chk", oneOf("state", ["IN_PROGRESS", "COMPLETED"])),
  ],
);

// ---------- 3.17 outbox_jobs ----------
export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    payload: jsonb("payload").notNull(),
    state: text("state").notNull(),
    attempts: integer("attempts").notNull().default(0),
    runAfter: tsz("run_after").notNull().defaultNow(),
    lastError: text("last_error"),
    lockedUntil: tsz("locked_until"),
    lockedBy: text("locked_by"),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("outbox_kind_chk", oneOf("kind", OUTBOX_JOB_KINDS)),
    check("outbox_state_chk", oneOf("state", ["PENDING", "RUNNING", "DONE", "DEAD"])),
    index("outbox_state_run_after_idx").on(t.state, t.runAfter),
  ],
);

// ---------- 3.18 webhook_deliveries ----------
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id),
    verificationId: text("verification_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastStatus: integer("last_status"),
    deliveredAt: tsz("delivered_at"),
  },
  (t) => [unique("wd_once_uq").on(t.endpointId, t.verificationId, t.eventType)],
);

// ---------- 3.19 platform_flags / rate_limit_counters ----------
export const platformFlags = pgTable(
  "platform_flags",
  {
    key: text("key").primaryKey(),
    value: boolean("value").notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (_t) => [check("platform_flags_key_chk", oneOf("key", PLATFORM_FLAGS))],
);

export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    scope: text("scope").notNull(),
    windowStart: tsz("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.windowStart] })],
);
