// Prefixed, non-guessable, time-ordered IDs (04 §1): `<prefix>_<ULID>`.

import { monotonicFactory } from "ulid";

// Monotonic within a process, so IDs made in one go sort in the order they were made (the photos of one
// submission, 01 §4.18).
const ulid = monotonicFactory();

export const ID_PREFIXES = {
  principal: "prn",
  credential: "key",
  verification: "ver",
  worker: "wkr",
  claim: "clm",
  challenge: "chl",
  upload: "upl",
  submission: "sub",
  evidence: "evd",
  payment: "pay",
  place: "plc",
  webhookEndpoint: "whk",
  webhookEvent: "evt",
  invite: "inv",
  oauthClient: "ocl",
  oauthGrant: "ogr",
  participation: "par",
  removal: "rmv",
  pushSubscription: "psb",
  schedule: "sch",
  placeOwnerToken: "pot",
  placeStatusReport: "psr",
  consoleSession: "cse",
  /** 13 §3: a challenge of an optimistic answer (`challenge` is the photo nonce). */
  objection: "obj",
  payoutAdjustment: "pad",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;
type Brand<K extends IdKind> = `${(typeof ID_PREFIXES)[K]}_${string}` & { readonly __kind: K };

export type PrincipalId = Brand<"principal">;
export type CredentialId = Brand<"credential">;
export type VerificationId = Brand<"verification">;
export type WorkerId = Brand<"worker">;
export type ClaimId = Brand<"claim">;
export type ChallengeId = Brand<"challenge">;
export type UploadId = Brand<"upload">;
export type SubmissionId = Brand<"submission">;
export type EvidenceId = Brand<"evidence">;
export type PaymentId = Brand<"payment">;
export type PlaceId = Brand<"place">;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Generate a new ID: `<prefix>_<ULID>` (ULID = 48-bit time + 80-bit crypto randomness). */
export function newId<K extends IdKind>(kind: K): Brand<K> {
  return `${ID_PREFIXES[kind]}_${ulid()}` as Brand<K>;
}

/** Validate an incoming ID string of the given kind; null if malformed or of another kind. */
export function parseId<K extends IdKind>(kind: K, raw: string): Brand<K> | null {
  const prefix = `${ID_PREFIXES[kind]}_`;
  if (!raw.startsWith(prefix)) return null;
  return ULID_RE.test(raw.slice(prefix.length)) ? (raw as Brand<K>) : null;
}
