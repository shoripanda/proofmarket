// Numeric limits and defaults. Source: 01 §4.5, 05 §2.1, 07 §3, 04 §4.
// Values that operators may tune per environment are read from env in apps/web, with these as defaults.

export const LIMITS = {
  /** 1000 so a request can name a book, page and passage (01 §4.15). */
  question: { maxChars: 1000 },
  answer: { maxTextChars: 4000, maxChoiceChars: 40, maxChoices: 6 },
  radiusM: { min: 25, max: 500 },
  /** Up to an hour: transcribing or a phone call takes longer than a shop-front photo (01 §4.15). */
  freshnessMaxAgeS: { min: 60, max: 3600, default: 300 },
  deadlineFromNow: { minMinutes: 10, maxHours: 24 },
  witnesses: { max: 5 }, // also bounded by MAX_WITNESSES env (1 until PR-14)
  claimTtlS: 1800,
  attemptsPerClaim: 3,
  workerTaskSearchRadiusKm: { min: 1, max: 20, default: 5 },
  /** Places allowlist: request location must be within this distance of an active place (REQ-X-T-104). */
  placeMatchRadiusM: 30,
  geofence: { maxAccuracyM: 100 },
  clientClockSkewWarnS: 120,
  media: {
    contentType: "image/jpeg",
    maxBytes: 8 * 1024 * 1024,
    minShortEdgePx: 480,
    maxInputPixels: 40_000_000,
    derivedLongEdgePx: 1280,
  },
  duplicate: { maxHammingForMatch: 6, lookbackDays: 90 },
  uploadUrlTtlS: 120,
  evidenceUrlTtlS: 300,
  uploadDiscardAfterS: 3600,
  idempotencyRetentionH: 24,
  bountyDecimals: 6,
  /** Treasury/operator alerting (06 §5.2). */
  operatorMinSolBalance: 1,
} as const;

export const RETENTION_DAYS = {
  raw_evidence: 30,
  precise_location: 30,
  task_metadata: 365,
  payment: 365,
  audit: 365,
} as const;

export const OUTBOX_RETRY = {
  firstDelayS: 10,
  maxDelayS: 600,
  maxAttempts: 50,
  leaseS: 180,
} as const;

export const WEBHOOK_RETRY_DELAYS_S = [30, 120, 600, 1800, 3600, 7200] as const;
export const WEBHOOK_TIMEOUT_MS = 5000;
export const WEBHOOK_SIGNATURE_TOLERANCE_S = 300;

/** Timezone that defines the "day" for daily_spend_limit (01 §4.7). */
export const SPEND_LIMIT_TIMEZONE = "Asia/Tokyo";

/** Rate-limit window (04 §3.19). */
export const RATE_LIMIT_WINDOW_S = 60;
