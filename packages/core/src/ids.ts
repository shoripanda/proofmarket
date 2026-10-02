// Prefixed, non-guessable, time-ordered IDs (04 §1): `<prefix>_<ULID>`.

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

/** Generate a new ID. Implementation: PR-02 (ulid). */
export function newId<K extends IdKind>(_kind: K): Brand<K> {
  throw new Error("NOT_IMPLEMENTED: newId (PR-02)");
}

/** Parse and validate an incoming ID string of the given kind. Implementation: PR-02. */
export function parseId<K extends IdKind>(_kind: K, _raw: string): Brand<K> | null {
  throw new Error("NOT_IMPLEMENTED: parseId (PR-02)");
}
