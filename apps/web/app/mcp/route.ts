// POST /mcp — MCP over Streamable HTTP (05 §6.1). Auth: requester API key as Bearer. Stateless: GET/DELETE are 405.
import { appContext } from "@/lib/context";
import { route } from "@/lib/http";
import { kickAfter } from "@/lib/kick";
import { handleMcp } from "@/lib/mcp-http";

// get_reality_verification may wait up to 20 s.
export const maxDuration = 60;

export const POST = route(async (req) => {
  const app = appContext();
  return handleMcp(app, req, (keys) => kickAfter(app, keys));
});

const notAllowed = async () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
