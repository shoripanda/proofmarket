import "server-only";
import { ApiError, jcs } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { sha256 } from "./crypto";

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export function requestHash(body: unknown): Buffer {
  return sha256(jcs(body));
}

/**
 * 05 §1.4. The idempotency row and the work commit in ONE transaction, so a concurrent duplicate blocks on the
 * unique key and then sees COMPLETED. Errors roll everything back (nothing stored; a retry re-evaluates).
 */
export async function withIdempotency<T>(
  app: AppContext,
  scope: string,
  endpoint: string,
  key: string,
  body: unknown,
  fn: (tx: Db) => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  if (!key || key.length > 255) throw new ApiError("VALIDATION_FAILED", { header: "Idempotency-Key" });
  const keyHash = sha256(key);
  const reqHash = requestHash(body);

  return app.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.idempotencyKeys)
      .values({ scope, endpoint, keyHash, requestHash: reqHash, state: "IN_PROGRESS" })
      .onConflictDoNothing()
      .returning({ scope: schema.idempotencyKeys.scope });

    if (inserted.length === 0) {
      const [row] = await tx
        .select()
        .from(schema.idempotencyKeys)
        .where(
          and(
            eq(schema.idempotencyKeys.scope, scope),
            eq(schema.idempotencyKeys.endpoint, endpoint),
            eq(schema.idempotencyKeys.keyHash, keyHash),
          ),
        );
      if (!row) throw new ApiError("IDEMPOTENCY_IN_PROGRESS");
      if (!row.requestHash.equals(reqHash)) throw new ApiError("IDEMPOTENCY_KEY_CONFLICT");
      if (row.state !== "COMPLETED") throw new ApiError("IDEMPOTENCY_IN_PROGRESS");
      return { status: row.responseStatus ?? 200, body: row.responseBody as T, replayed: true };
    }

    const out = await fn(tx);
    await tx
      .update(schema.idempotencyKeys)
      .set({ state: "COMPLETED", responseStatus: out.status, responseBody: out.body as object })
      .where(
        and(
          eq(schema.idempotencyKeys.scope, scope),
          eq(schema.idempotencyKeys.endpoint, endpoint),
          eq(schema.idempotencyKeys.keyHash, keyHash),
        ),
      );
    return { ...out, replayed: false };
  });
}
