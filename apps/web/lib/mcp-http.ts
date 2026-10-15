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
  handleCreateBatch,
  handleCreateSchedule,
  handleDispute,
  handleGet,
  handleList,
  handleListSchedules,
  handlePublicResult,
  handleQuote,
  handleStopSchedule,
} from "./handlers/requester";
import { route } from "./http";
import { publicBase, resourceMetadataUrl } from "./services/oauth-service";
import { publicAssets } from "./services/public-service";

type Kick = (dedupeKeys: string[]) => void;
type H = (app: AppContext, req: Request, id: string) => Promise<Response>;
// Follow-up job keys after a successful call: the same ones the app/v1 route files enqueue.
type Jobs = (res: Response, id: string) => Promise<string[]>;

const body = <T>(res: Response) => res.clone().json() as Promise<T>;
const none: Jobs = async () => [];

// Every SDK method an MCP tool calls must have a row here (test/mcp-http.test.ts calls all ten tools).
// batch comes before /v1/verifications/{id} so "batch" is never read as an id.
const TABLE: [string, RegExp, H, Jobs][] = [
  [
    "POST",
    /^\/v1\/verifications$/,
    (a, r) => handleCreate(a, r),
    async (res) =>
      res.status === 201
        ? [`FUND_TASK:${(await body<{ verification_id: string }>(res)).verification_id}`]
        : [],
  ],
  [
    "POST",
    /^\/v1\/verifications\/batch$/,
    (a, r) => handleCreateBatch(a, r),
    async (res) =>
      res.status === 201
        ? (await body<{ verifications: { verification_id: string }[] }>(res)).verifications.map(
            (v) => `FUND_TASK:${v.verification_id}`,
          )
        : [],
  ],
  ["POST", /^\/v1\/verifications\/quote$/, (a, r) => handleQuote(a, r), none],
  ["GET", /^\/v1\/verifications$/, (a, r) => handleList(a, r), none],
  ["GET", /^\/v1\/verifications\/([^/]+)$/, handleGet, none],
  [
    "POST",
    /^\/v1\/verifications\/([^/]+)\/cancel$/,
    handleCancel,
    async (res, id) => (res.ok ? [`REFUND_TASK:${id}`] : []),
  ],
  [
    "POST",
    /^\/v1\/verifications\/([^/]+)\/dispute$/,
    handleDispute,
    async (res) =>
      res.status === 201
        ? [`FUND_TASK:${(await body<{ recheck_verification_id: string }>(res)).recheck_verification_id}`]
        : [],
  ],
  ["GET", /^\/v1\/public\/verifications\/([^/]+)$/, handlePublicResult, none],
  ["GET", /^\/v1\/public\/assets$/, async (a) => Response.json(publicAssets(a)), none],
  ["POST", /^\/v1\/schedules$/, (a, r) => handleCreateSchedule(a, r), none],
  ["GET", /^\/v1\/schedules$/, (a, r) => handleListSchedules(a, r), none],
  ["DELETE", /^\/v1\/schedules\/([^/]+)$/, handleStopSchedule, none],
];

/** fetch that routes SDK requests to the REST handlers in this process (same auth, limits and idempotency). */
export function inProcessFetch(app: AppContext, kick: Kick = () => {}): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname;
    for (const [m, re, h, jobs] of TABLE) {
      const match = re.exec(path);
      if (req.method !== m || !match) continue;
      const id = decodeURIComponent(match[1] ?? "");
      const res = await route((r: Request) => h(app, r, id))(req, undefined);
      const keys = await jobs(res, id);
      if (keys.length) kick(keys);
      return res;
    }
    // A missing row is our bug, not a wrong id: say so instead of VERIFICATION_NOT_FOUND.
    console.error(`[mcp] no in-process route for ${req.method} ${path}`);
    return Response.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: `MCP has no route for ${req.method} ${path}`,
          retryable: false,
          details: {},
        },
      },
      { status: 500 },
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
