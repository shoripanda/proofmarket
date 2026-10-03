import "server-only";
import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { eq, type SQL } from "drizzle-orm";
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

/** OAuth access tokens issued to MCP clients (05 §6.2). */
export const ACCESS_TOKEN_PREFIX = "pm_oat_";

/** `Authorization: Bearer <API key | OAuth access token>` (05 §1.2, §6.2). */
export async function authenticateRequester(app: AppContext, req: Request): Promise<RequesterAuth> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token.startsWith(ACCESS_TOKEN_PREFIX)) return authenticateAccessToken(app, token);
  return authenticateApiKey(app, token);
}

/** `pm_test_<prefix>_<secret>` -> SHA-256(secret) compare. */
export async function authenticateApiKey(app: AppContext, raw: string): Promise<RequesterAuth> {
  const parsed = parseApiKey(raw);
  if (!parsed) throw new ApiError("UNAUTHENTICATED");
  const row = await loadCredential(app, eq(schema.requesterCredentials.keyPrefix, parsed.prefix));
  const expected = row?.cred.secretHash;
  const actual = sha256(parsed.secret);
  if (!row || !expected || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ApiError("UNAUTHENTICATED");
  }
  return toAuth(row);
}

/** A live access token stands for the API key that granted it; suspending or revoking the key stops it. */
async function authenticateAccessToken(app: AppContext, raw: string): Promise<RequesterAuth> {
  const [tok] = await app.db
    .select()
    .from(schema.oauthTokens)
    .where(eq(schema.oauthTokens.tokenHash, sha256(raw)));
  if (!tok || tok.kind !== "access" || tok.revokedAt || tok.expiresAt <= app.now()) {
    throw new ApiError("UNAUTHENTICATED");
  }
  const row = await loadCredential(app, eq(schema.requesterCredentials.id, tok.credentialId));
  if (!row) throw new ApiError("UNAUTHENTICATED");
  return toAuth(row);
}

async function loadCredential(app: AppContext, where: SQL) {
  const rows = await app.db
    .select({ cred: schema.requesterCredentials, principalStatus: schema.principals.status })
    .from(schema.requesterCredentials)
    .innerJoin(schema.principals, eq(schema.principals.id, schema.requesterCredentials.principalId))
    .where(where);
  return rows[0];
}

function toAuth(row: NonNullable<Awaited<ReturnType<typeof loadCredential>>>): RequesterAuth {
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

/** Auth for work done on a key's behalf without a request (scheduled checks, 04 §3.23). Same status rules. */
export async function credentialAuth(app: AppContext, credentialId: string): Promise<RequesterAuth> {
  const row = await loadCredential(app, eq(schema.requesterCredentials.id, credentialId));
  if (!row) throw new ApiError("UNAUTHENTICATED");
  return toAuth(row);
}
