import "server-only";
import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { sha256 } from "../services/crypto";

export interface RequesterAuth {
  credentialId: string;
  principalId: string;
  keyPrefix: string;
  allowedTaskTypes: string[];
  limits: {
    maxTaskAmount: string;
    dailySpendLimit: string;
    rateLimitPerMin: number;
    allowedBbox: number[] | null;
  };
}

/** pm_test_<8 hex prefix>_<base64url secret> */
const KEY_RE = /^pm_test_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$/;

export function parseApiKey(raw: string): { prefix: string; secret: string } | null {
  const m = KEY_RE.exec(raw);
  return m?.[1] && m[2] ? { prefix: m[1], secret: m[2] } : null;
}

/** `Authorization: Bearer pm_test_<prefix>_<secret>` -> SHA-256(secret) compare (05 §1.2). */
export async function authenticateRequester(app: AppContext, req: Request): Promise<RequesterAuth> {
  const header = req.headers.get("authorization") ?? "";
  const parsed = parseApiKey(header.replace(/^Bearer\s+/i, ""));
  if (!parsed) throw new ApiError("UNAUTHENTICATED");

  const rows = await app.db
    .select({ cred: schema.requesterCredentials, principalStatus: schema.principals.status })
    .from(schema.requesterCredentials)
    .innerJoin(schema.principals, eq(schema.principals.id, schema.requesterCredentials.principalId))
    .where(eq(schema.requesterCredentials.keyPrefix, parsed.prefix));
  const row = rows[0];
  const expected = row?.cred.secretHash;
  const actual = sha256(parsed.secret);
  if (!row || !expected || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ApiError("UNAUTHENTICATED");
  }
  if (row.cred.status !== "active" || row.cred.revokedAt || row.principalStatus !== "active") {
    throw new ApiError("CREDENTIAL_SUSPENDED");
  }
  return {
    credentialId: row.cred.id,
    principalId: row.cred.principalId,
    keyPrefix: row.cred.keyPrefix,
    allowedTaskTypes: row.cred.allowedTaskTypes,
    limits: {
      maxTaskAmount: row.cred.maxTaskAmount,
      dailySpendLimit: row.cred.dailySpendLimit,
      rateLimitPerMin: row.cred.rateLimitPerMin,
      allowedBbox: row.cred.allowedBbox,
    },
  };
}
