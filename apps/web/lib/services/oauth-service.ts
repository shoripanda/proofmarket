import "server-only";
// OAuth 2.1 authorization server for MCP clients such as the Claude and ChatGPT apps (05 §6.2).
// Public clients with PKCE (S256) only. The user proves ownership of an API key once; tokens stand for that key.
import { newId } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ACCESS_TOKEN_PREFIX, authenticateApiKey } from "../auth/requester";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { randomToken, sha256 } from "./crypto";
import { consumeRateLimit } from "./rate-limit";

const REFRESH_TOKEN_PREFIX = "pm_ort_";
const CODE_TTL_MS = 10 * 60_000;
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 30 * 86_400_000;

/** RFC 6749 §5.2 error, rendered as `{ error, error_description }`. */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
  }
  toResponse(): Response {
    return Response.json(
      { error: this.error, error_description: this.description },
      { status: this.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/** Public origin used in metadata and redirects. NEXT_PUBLIC_BASE_URL wins over the request's own origin. */
export function publicBase(req: Request): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
}

/** Metadata, registration and token calls carry no cookies, so any origin may make them (browser MCP clients). */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export const mcpResource = (base: string) => `${base}/mcp`;
export const resourceMetadataUrl = (base: string) => `${base}/.well-known/oauth-protected-resource`;

/** RFC 9728. */
export function protectedResourceMetadata(base: string) {
  return {
    resource: mcpResource(base),
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    resource_name: "ProofMarket",
  };
}

/** RFC 8414. */
export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    // RFC 9207: every authorization response, success or error, carries iss (checkAuthorize / approve). ChatGPT
    // then uses its stable redirect URI and client id instead of one per connection.
    authorization_response_iss_parameter_supported: true,
  };
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  );
}

function allowedRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

const RegisterBody = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(5),
  client_name: z.string().trim().min(1).max(100).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

/** RFC 7591 dynamic client registration. */
export async function registerClient(app: AppContext, body: unknown, ip: string): Promise<Response> {
  await consumeRateLimit(app, `oauth-register:${ip}`, 10);
  const parsed = RegisterBody.safeParse(body);
  if (!parsed.success) throw new OAuthError("invalid_client_metadata", "redirect_uris (1-5) is required");
  // Every client is public here (PKCE, no secret). A client that asks for a secret-based method (ChatGPT's
  // registration may) is registered anyway; the response says "none", which RFC 7591 lets the server choose.
  const { redirect_uris, client_name } = parsed.data;
  if (!redirect_uris.every(allowedRedirect)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be https, or http on localhost");
  }
  const id = newId("oauthClient");
  const clientName = client_name ?? "MCP client";
  await app.db.insert(schema.oauthClients).values({ id, clientName, redirectUris: redirect_uris });
  return Response.json(
    {
      client_id: id,
      client_name: clientName,
      redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(app.now().getTime() / 1000),
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export type AuthorizeCheck =
  | { kind: "ok"; clientName: string; redirectUri: string; params: URLSearchParams }
  /** client_id / redirect_uri cannot be trusted: show the error, never redirect. */
  | { kind: "fatal"; message: string }
  | { kind: "redirect"; location: string };

const withQuery = (uri: string, q: Record<string, string | undefined>) => {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(q)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
};

export async function checkAuthorize(
  app: AppContext,
  base: string,
  params: URLSearchParams,
): Promise<AuthorizeCheck> {
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const [client] = await app.db
    .select()
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.id, clientId));
  if (!client) return { kind: "fatal", message: "unknown client_id" };
  if (!client.redirectUris.includes(redirectUri))
    return { kind: "fatal", message: "redirect_uri is not registered" };

  const state = params.get("state") ?? undefined;
  const fail = (error: string, error_description: string): AuthorizeCheck => ({
    kind: "redirect",
    location: withQuery(redirectUri, { error, error_description, state, iss: base }),
  });
  if (params.get("response_type") !== "code")
    return fail("unsupported_response_type", "response_type must be code");
  if (!params.get("code_challenge") || params.get("code_challenge_method") !== "S256") {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
  }
  const resource = params.get("resource");
  if (resource && resource.replace(/\/$/, "") !== mcpResource(base)) {
    return fail("invalid_target", "resource must be the ProofMarket MCP endpoint");
  }
  return { kind: "ok", clientName: client.clientName, redirectUri, params };
}

/** The user entered an API key on the consent page. Returns where to send the browser. Throws ApiError on a bad key. */
export async function approve(
  app: AppContext,
  base: string,
  check: Extract<AuthorizeCheck, { kind: "ok" }>,
  apiKey: string,
): Promise<string> {
  const auth = await authenticateApiKey(app, apiKey.trim());
  const code = randomToken(32);
  const clientId = check.params.get("client_id") ?? "";
  await app.db.transaction(async (tx) => {
    await tx.insert(schema.oauthCodes).values({
      codeHash: sha256(code),
      clientId,
      credentialId: auth.credentialId,
      redirectUri: check.redirectUri,
      codeChallenge: check.params.get("code_challenge") ?? "",
      expiresAt: new Date(app.now().getTime() + CODE_TTL_MS),
    });
    await appendAudit(tx, {
      verificationId: null,
      actorType: "requester",
      actorRef: auth.credentialId,
      eventType: "oauth_granted",
      beforeState: null,
      afterState: null,
      correlationId: clientId,
      metadata: { key_prefix: auth.keyPrefix, client_id: clientId, client_name: check.clientName },
    });
  });
  return withQuery(check.redirectUri, { code, state: check.params.get("state") ?? undefined, iss: base });
}

async function issueTokens(app: AppContext, grantId: string, clientId: string, credentialId: string) {
  const access = `${ACCESS_TOKEN_PREFIX}${randomToken(32)}`;
  const refresh = `${REFRESH_TOKEN_PREFIX}${randomToken(32)}`;
  const now = app.now().getTime();
  await app.db.insert(schema.oauthTokens).values([
    {
      tokenHash: sha256(access),
      kind: "access",
      grantId,
      clientId,
      credentialId,
      expiresAt: new Date(now + ACCESS_TTL_S * 1000),
    },
    {
      tokenHash: sha256(refresh),
      kind: "refresh",
      grantId,
      clientId,
      credentialId,
      expiresAt: new Date(now + REFRESH_TTL_MS),
    },
  ]);
  return Response.json(
    { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function revokeGrant(app: AppContext, grantId: string) {
  await app.db
    .update(schema.oauthTokens)
    .set({ revokedAt: app.now() })
    .where(and(eq(schema.oauthTokens.grantId, grantId), isNull(schema.oauthTokens.revokedAt)));
}

async function credentialActive(app: AppContext, credentialId: string): Promise<boolean> {
  const [c] = await app.db
    .select({ status: schema.requesterCredentials.status, revokedAt: schema.requesterCredentials.revokedAt })
    .from(schema.requesterCredentials)
    .where(eq(schema.requesterCredentials.id, credentialId));
  return !!c && c.status === "active" && !c.revokedAt;
}

const b64urlSha256 = (s: string) => sha256(s).toString("base64url");

/** POST /oauth/token (application/x-www-form-urlencoded). */
export async function exchangeToken(app: AppContext, form: URLSearchParams): Promise<Response> {
  const grantType = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";
  const now = app.now();

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    // Single use: only the first exchange flips used_at.
    const [row] = await app.db
      .update(schema.oauthCodes)
      .set({ usedAt: now })
      .where(and(eq(schema.oauthCodes.codeHash, sha256(code)), isNull(schema.oauthCodes.usedAt)))
      .returning();
    if (!row || row.expiresAt <= now || row.clientId !== clientId) {
      throw new OAuthError("invalid_grant", "code is invalid, expired or already used");
    }
    if (row.redirectUri !== form.get("redirect_uri"))
      throw new OAuthError("invalid_grant", "redirect_uri mismatch");
    if (b64urlSha256(form.get("code_verifier") ?? "") !== row.codeChallenge) {
      throw new OAuthError("invalid_grant", "code_verifier does not match");
    }
    return issueTokens(app, newId("oauthGrant"), clientId, row.credentialId);
  }

  if (grantType === "refresh_token") {
    const hash = sha256(form.get("refresh_token") ?? "");
    const [tok] = await app.db
      .select()
      .from(schema.oauthTokens)
      .where(eq(schema.oauthTokens.tokenHash, hash));
    if (
      !tok ||
      tok.kind !== "refresh" ||
      tok.clientId !== clientId ||
      tok.revokedAt ||
      tok.expiresAt <= now
    ) {
      throw new OAuthError("invalid_grant", "refresh_token is invalid or expired");
    }
    const [fresh] = await app.db
      .update(schema.oauthTokens)
      .set({ usedAt: now })
      .where(and(eq(schema.oauthTokens.tokenHash, hash), isNull(schema.oauthTokens.usedAt)))
      .returning();
    if (!fresh) {
      // A rotated-out refresh token came back: assume it leaked and end the whole connection.
      await revokeGrant(app, tok.grantId);
      throw new OAuthError(
        "invalid_grant",
        "refresh_token was already used; the connection has been revoked",
      );
    }
    if (!(await credentialActive(app, tok.credentialId))) {
      await revokeGrant(app, tok.grantId);
      throw new OAuthError("invalid_grant", "the API key behind this connection is suspended or revoked");
    }
    return issueTokens(app, tok.grantId, clientId, tok.credentialId);
  }

  throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
}
