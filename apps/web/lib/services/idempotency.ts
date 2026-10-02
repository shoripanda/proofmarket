import "server-only";

/**
 * 05 §1.4: insert IN_PROGRESS (scope, endpoint, sha256(key)); run fn in the same transaction; store response.
 * Existing row: different request_hash -> IDEMPOTENCY_KEY_CONFLICT; COMPLETED -> replay (+ Idempotent-Replayed);
 * IN_PROGRESS -> IDEMPOTENCY_IN_PROGRESS. request_hash = sha256(JCS(body)). PR-04.
 */
export async function withIdempotency<T>(
  _scope: string,
  _endpoint: string,
  _key: string,
  _body: unknown,
  _fn: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replayed: boolean }> {
  throw new Error("NOT_IMPLEMENTED: withIdempotency (PR-04)");
}
