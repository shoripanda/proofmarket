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
