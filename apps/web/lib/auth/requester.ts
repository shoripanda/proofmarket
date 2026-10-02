import "server-only";

export interface RequesterAuth {
  credentialId: string;
  principalId: string;
  keyPrefix: string;
  limits: {
    maxTaskAmount: string;
    dailySpendLimit: string;
    rateLimitPerMin: number;
    allowedBbox: number[] | null;
  };
}

/**
 * `Authorization: Bearer pm_test_<prefix>_<secret>` -> SHA-256(secret) lookup (05 §1.2).
 * Fails UNAUTHENTICATED / CREDENTIAL_SUSPENDED (also when the principal is suspended). PR-04.
 */
export async function authenticateRequester(_req: Request): Promise<RequesterAuth> {
  throw new Error("NOT_IMPLEMENTED: authenticateRequester (PR-04)");
}
