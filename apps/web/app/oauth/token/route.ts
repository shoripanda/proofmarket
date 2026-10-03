// POST /oauth/token — authorization_code (PKCE) and refresh_token grants (05 §6.2).
import { appContext } from "@/lib/context";
import { route } from "@/lib/http";
import { CORS, exchangeToken, OAuthError } from "@/lib/services/oauth-service";

export const POST = route(async (req) => {
  let res: Response;
  try {
    res = await exchangeToken(appContext(), new URLSearchParams(await req.text()));
  } catch (e) {
    if (!(e instanceof OAuthError)) throw e;
    res = e.toResponse();
  }
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});
export const OPTIONS = async () => new Response(null, { status: 204, headers: CORS });
