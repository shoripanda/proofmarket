import "server-only";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ApiError } from "@proofmarket/core";
import { createServer } from "@proofmarket/mcp";
import { ProofMarketClient } from "@proofmarket/sdk";
import { authenticateRequester } from "./auth/requester";
import type { AppContext } from "./context";
import {
  handleCancel,
  handleCreate,
  handleDispute,
  handleGet,
  handlePublicResult,
} from "./handlers/requester";
import { route } from "./http";
import { publicBase, resourceMetadataUrl } from "./services/oauth-service";

type Kick = (dedupeKeys: string[]) => void;
type H = (app: AppContext, req: Request, id: string) => Promise<Response>;

const TABLE: [string, RegExp, H][] = [
  ["POST", /^\/v1\/verifications$/, (a, r) => handleCreate(a, r)],
  ["GET", /^\/v1\/verifications\/([^/]+)$/, handleGet],
  ["POST", /^\/v1\/verifications\/([^/]+)\/cancel$/, handleCancel],
  ["POST", /^\/v1\/verifications\/([^/]+)\/dispute$/, handleDispute],
  ["GET", /^\/v1\/public\/verifications\/([^/]+)$/, handlePublicResult],
];

/** fetch that routes SDK requests to the REST handlers in this process (same auth, limits and idempotency). */
export function inProcessFetch(app: AppContext, kick: Kick = () => {}): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname;
    for (const [m, re, h] of TABLE) {
      const match = re.exec(path);
      if (req.method !== m || !match) continue;
      const res = await route((r: Request) => h(app, r, decodeURIComponent(match[1] ?? "")))(req, undefined);
      // Same follow-up jobs as app/v1/verifications/**/route.ts.
      if (m === "POST" && res.status === 201 && !match[1]) {
        const { verification_id } = (await res.clone().json()) as { verification_id: string };
        kick([`FUND_TASK:${verification_id}`]);
      } else if (m === "POST" && res.status === 201 && path.endsWith("/dispute")) {
        const { recheck_verification_id } = (await res.clone().json()) as { recheck_verification_id: string };
        kick([`FUND_TASK:${recheck_verification_id}`]);
      } else if (m === "POST" && res.ok && match[1]) {
        kick([`REFUND_TASK:${match[1]}`]);
      }
      return res;
    }
    return Response.json(
      { error: { code: "VERIFICATION_NOT_FOUND", message: "no route", retryable: false, details: {} } },
      { status: 404 },
    );
  }) as typeof fetch;
}

/** POST /mcp — MCP over Streamable HTTP, stateless, authenticated by an API key or OAuth access token (05 §6.1-6.2). */
export async function handleMcp(app: AppContext, req: Request, kick: Kick): Promise<Response> {
  let principalId: string;
  try {
    ({ principalId } = await authenticateRequester(app, req));
  } catch (e) {
    if (e instanceof ApiError && e.code === "UNAUTHENTICATED") {
      return Response.json(e.toBody(), {
        status: e.http,
        // Points OAuth clients (phone apps) at the metadata (05 §6.2).
        headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(publicBase(req))}"` },
      });
    }
    throw e;
  }
  // The SDK forwards this bearer to the REST handlers, which accept both forms.
  const apiKey = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const client = new ProofMarketClient({
    baseUrl: new URL(req.url).origin,
    apiKey,
    fetch: inProcessFetch(app, kick),
  });
  const server = createServer(client, { principalRef: principalId });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
