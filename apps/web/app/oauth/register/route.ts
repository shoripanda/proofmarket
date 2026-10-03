// POST /oauth/register — RFC 7591 dynamic client registration, public clients only (05 §6.2).
import { appContext } from "@/lib/context";
import { readJson, route } from "@/lib/http";
import { CORS, clientIp, OAuthError, registerClient } from "@/lib/services/oauth-service";

export const POST = route(async (req) => {
  try {
    const res = await registerClient(appContext(), await readJson(req), clientIp(req));
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  } catch (e) {
    if (e instanceof OAuthError) return e.toResponse();
    throw e;
  }
});
export const OPTIONS = async () => new Response(null, { status: 204, headers: CORS });
