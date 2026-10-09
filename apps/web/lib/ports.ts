import "server-only";
// External-service ports. Production adapters live in lib/adapters/*, test fakes in test/support/*.

/** Worker identity (Privy). */
export interface IdentityProvider {
  /** Verify a Privy ACCESS token; throws on invalid/expired. */
  verifyAccessToken(token: string): Promise<{ userId: string }>;
  /** Server-side lookup of the user's Solana embedded wallet address (never trust the client). */
  payoutAddress(userId: string): Promise<string | null>;
}

/** Evidence object storage (Supabase Storage). Buckets: evidence-raw (private), evidence-derived (private). */
export interface EvidenceStorage {
  createSignedUploadUrl(key: string): Promise<{ url: string; expiresInS: number }>;
  read(key: string): Promise<{ bytes: Buffer; createdAt: Date } | null>;
  putDerived(key: string, bytes: Buffer): Promise<void>;
  createSignedDownloadUrl(bucket: "evidence-derived", key: string, ttlS: number): Promise<string>;
  remove(bucket: "evidence-raw" | "evidence-derived", keys: string[]): Promise<void>;
}

/** Web Push (04 §3.22). `gone` = the endpoint no longer exists (404/410) and should be deleted. */
export interface PushSender {
  send(
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ): Promise<{ ok: true } | { ok: false; gone: boolean }>;
}

/** Transactional email (01 §4.28). `ok: false` = the provider refused it or could not be reached. */
export interface Mailer {
  send(m: {
    to: string;
    subject: string;
    text: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
}

/** What the reviewer is shown for one submission (01 §4.16). */
export interface ReviewInput {
  type: string;
  /** The requester's instruction, verbatim. Untrusted. */
  question: string;
  /** What the requester will accept (01 §4.25), verbatim. Untrusted. */
  acceptanceCriteria?: string;
  answerFormat: string;
  /** The worker's answer, verbatim. Untrusted. */
  answer: string;
  /** The EXIF-free derived JPEGs (long edge <= 1280 px), 1–4 in the order the worker sent them (01 §4.18). */
  images: Buffer[];
}

export interface ReviewOutput {
  /** pass: the work was done as asked. fail: clearly not. uncertain: cannot tell from what was sent. */
  verdict: "pass" | "fail" | "uncertain";
  /** One or two sentences in Japanese, shown to the worker on fail and to the requester always. */
  reason: string;
  /** What the photo shows, briefly. Requester-only. */
  observed: string;
  model: string;
}

/** AI review of whether a submission fulfils the request (01 §4.16). Null when no API key is configured. */
export interface SubmissionReviewer {
  review(input: ReviewInput): Promise<ReviewOutput>;
}
