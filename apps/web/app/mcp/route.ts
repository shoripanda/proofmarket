// POST /mcp — MCP over Streamable HTTP (05 §6.1). Auth: requester API key as Bearer. Stateless: GET/DELETE are 405.
import { appContext } from "@/lib/context";
import { route } from "@/lib/http";
import { kickAfter } from "@/lib/kick";
import { handleMcp } from "@/lib/mcp-http";

// get_reality_verification may wait up to 20 s.
export const maxDuration = 60;

// Bearer only, no cookies: opening CORS to any origin cannot borrow someone else's rights (as oauth-service's CORS).
const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

const withCors = (res: Response) => {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(MCP_CORS)) out.headers.set(k, v);
  return out;
};

const handle = route(async (req) => {
  const app = appContext();
  return handleMcp(app, req, (keys) => kickAfter(app, keys));
});

// Browser-based MCP clients (e.g. the web MCP Inspector) preflight first.
export const POST = async (req: Request) => withCors(await handle(req, undefined));
export const OPTIONS = async () => new Response(null, { status: 204, headers: MCP_CORS });

const notAllowed = async () =>
  new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...MCP_CORS } });
export const GET = notAllowed;
export const DELETE = notAllowed;
