// OAuth for MCP clients (05 §6.2): registration, consent with an API key, PKCE, rotation, and key-bound tokens.
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { beforeEach, describe, expect, it } from "vitest";
import { handleGet } from "../lib/handlers/requester";
import { handleMcp } from "../lib/mcp-http";
import { consentPage } from "../lib/oauth-page";
import { suspendCredential } from "../lib/services/admin-service";
import {
  approve,
  authorizationServerMetadata,
  checkAuthorize,
  exchangeToken,
  OAuthError,
  protectedResourceMetadata,
  registerClient,
} from "../lib/services/oauth-service";
import { call, createTestApp, jsonReq } from "./support/app";

const BASE = "http://pm.test";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "v".repeat(64);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});

async function register(redirect_uris = [REDIRECT]) {
  const res = await registerClient(t.app, { client_name: "Claude", redirect_uris }, "1.2.3.4");
  return (await res.json()) as { client_id: string };
}

function authorizeParams(clientId: string, o: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "st-1",
    resource: `${BASE}/mcp`,
    ...o,
  });
}

async function codeFor(clientId: string) {
  const check = await checkAuthorize(t.app, BASE, authorizeParams(clientId));
  if (check.kind !== "ok") throw new Error(check.kind);
  const loc = new URL(await approve(t.app, BASE, check, t.apiKey));
  expect(loc.searchParams.get("state")).toBe("st-1");
  expect(loc.searchParams.get("iss")).toBe(BASE);
  return loc.searchParams.get("code") ?? "";
}

async function token(form: Record<string, string>) {
  try {
    return {
      status: 200,
      body: (await (await exchangeToken(t.app, new URLSearchParams(form))).json()) as Record<string, string>,
    };
  } catch (e) {
    if (e instanceof OAuthError)
      return { status: e.status, body: { error: e.error } as Record<string, string> };
    throw e;
  }
}

async function connectFlow() {
  const { client_id } = await register();
  const code = await codeFor(client_id);
  const r = await token({
    grant_type: "authorization_code",
    client_id,
    code,
    redirect_uri: REDIRECT,
    code_verifier: VERIFIER,
  });
  expect(r.status).toBe(200);
  return { client_id, code, access: r.body.access_token ?? "", refresh: r.body.refresh_token ?? "" };
}

describe("metadata and registration", () => {
  it("advertises the MCP resource, the endpoints and S256 only", () => {
    expect(protectedResourceMetadata(BASE)).toMatchObject({
      resource: `${BASE}/mcp`,
      authorization_servers: [BASE],
    });
    expect(authorizationServerMetadata(BASE)).toMatchObject({
      registration_endpoint: `${BASE}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  it("accepts https and localhost redirects, rejects plain http elsewhere and confidential clients", async () => {
    expect((await register([REDIRECT, "http://localhost:6274/cb"])).client_id).toMatch(/^ocl_/);
    await expect(register(["http://evil.example/cb"])).rejects.toMatchObject({
      error: "invalid_redirect_uri",
    });
    await expect(
      registerClient(
        t.app,
        { redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" },
        "1.2.3.4",
      ),
    ).rejects.toMatchObject({ error: "invalid_client_metadata" });
  });
});

describe("authorize", () => {
  it("never redirects to an unregistered redirect_uri; requires PKCE S256 and the right resource", async () => {
    const { client_id } = await register();
    expect(await checkAuthorize(t.app, BASE, authorizeParams("ocl_nope"))).toMatchObject({ kind: "fatal" });
    expect(
      await checkAuthorize(
        t.app,
        BASE,
        authorizeParams(client_id, { redirect_uri: "https://evil.example/cb" }),
      ),
    ).toMatchObject({ kind: "fatal" });
    const noPkce = await checkAuthorize(
      t.app,
      BASE,
      authorizeParams(client_id, { code_challenge_method: "plain" }),
    );
    expect(noPkce.kind === "redirect" && new URL(noPkce.location).searchParams.get("error")).toBe(
      "invalid_request",
    );
    const wrongResource = await checkAuthorize(
      t.app,
      BASE,
      authorizeParams(client_id, { resource: "https://x/mcp" }),
    );
    expect(
      wrongResource.kind === "redirect" && new URL(wrongResource.location).searchParams.get("error"),
    ).toBe("invalid_target");
  });

  it("consent page names the client and the return host, and escapes them", async () => {
    const res = consentPage({
      clientName: '<script>alert("x")</script>',
      redirectUri: REDIRECT,
      params: authorizeParams("ocl_x"),
    });
    const html = await res.text();
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("claude.ai");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("a wrong API key is refused", async () => {
    const { client_id } = await register();
    const check = await checkAuthorize(t.app, BASE, authorizeParams(client_id));
    if (check.kind !== "ok") throw new Error(check.kind);
    await expect(approve(t.app, BASE, check, "pm_test_00000000_" + "x".repeat(43))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("tokens", () => {
  it("code is single-use and bound to client, redirect and verifier", async () => {
    const { client_id } = await register();
    const code = await codeFor(client_id);
    const base = { grant_type: "authorization_code", client_id, code, redirect_uri: REDIRECT };
    expect((await token({ ...base, code_verifier: "w".repeat(64) })).body.error).toBe("invalid_grant");
    // The failed attempt above consumed the code: a stolen code cannot be retried with guesses.
    expect((await token({ ...base, code_verifier: VERIFIER })).body.error).toBe("invalid_grant");

    const code2 = await codeFor(client_id);
    const ok = await token({ ...base, code: code2, code_verifier: VERIFIER });
    expect(ok.body).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect(ok.body.access_token).toMatch(/^pm_oat_/);
    expect((await token({ ...base, code: code2, code_verifier: VERIFIER })).body.error).toBe("invalid_grant");
  });

  it("access token works on REST and /mcp, and expires after an hour", async () => {
    const { access } = await connectFlow();
    const notFound = await call(
      (r) => handleGet(t.app, r, "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1"),
      jsonReq("GET", "/x", { key: access }),
    );
    expect(notFound.status).toBe(404); // authenticated, just not ours

    const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        handleMcp(t.app, new Request(input, init), () => {})) as typeof fetch,
      requestInit: { headers: { Authorization: `Bearer ${access}` } },
    });
    const mcp = new Client({ name: "phone-app", version: "1" });
    await mcp.connect(transport);
    expect((await mcp.listTools()).tools).toHaveLength(3);

    t.advance(3601_000);
    const res = await handleMcp(
      t.app,
      new Request(`${BASE}/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
        body: "{}",
      }),
      () => {},
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      'resource_metadata="http://pm.test/.well-known/oauth-protected-resource"',
    );
  });

  it("refresh rotates; replaying an old refresh token revokes the whole connection", async () => {
    const { client_id, refresh } = await connectFlow();
    const r1 = await token({ grant_type: "refresh_token", client_id, refresh_token: refresh });
    expect(r1.body.refresh_token).toMatch(/^pm_ort_/);
    expect(r1.body.refresh_token).not.toBe(refresh);

    expect((await token({ grant_type: "refresh_token", client_id, refresh_token: refresh })).body.error).toBe(
      "invalid_grant",
    );
    const after = await call(
      (r) => handleGet(t.app, r, "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1"),
      jsonReq("GET", "/x", { key: r1.body.access_token }),
    );
    expect(after.status).toBe(401);
    expect(
      (await token({ grant_type: "refresh_token", client_id, refresh_token: r1.body.refresh_token ?? "" }))
        .body.error,
    ).toBe("invalid_grant");
  });

  it("suspending the API key stops its tokens at once", async () => {
    const { client_id, access, refresh } = await connectFlow();
    await suspendCredential(t.db, t.credentialId, "test");
    const res = await call(
      (r) => handleGet(t.app, r, "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1"),
      jsonReq("GET", "/x", { key: access }),
    );
    expect((await res.json()).error.code).toBe("CREDENTIAL_SUSPENDED");
    expect((await token({ grant_type: "refresh_token", client_id, refresh_token: refresh })).body.error).toBe(
      "invalid_grant",
    );
  });
});
