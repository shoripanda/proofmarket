// GET/POST /oauth/authorize — consent page where the user enters their API key once (05 §6.2).
import { ApiError } from "@proofmarket/core";
import { appContext } from "@/lib/context";
import { route } from "@/lib/http";
import { pick } from "@/lib/lang";
import { consentPage, errorPage, langFromAccept } from "@/lib/oauth-page";
import { approve, checkAuthorize, clientIp, publicBase } from "@/lib/services/oauth-service";
import { consumeRateLimit } from "@/lib/services/rate-limit";

// Response.redirect() has immutable headers, which route() needs to add X-Request-Id.
const redirect = (location: string, status: 302 | 303) =>
  new Response(null, { status, headers: { Location: location } });

export const GET = route(async (req) => {
  const lang = langFromAccept(req.headers.get("accept-language"));
  const check = await checkAuthorize(appContext(), publicBase(req), new URL(req.url).searchParams);
  if (check.kind === "fatal") return errorPage(check.message, lang);
  if (check.kind === "redirect") return redirect(check.location, 302);
  return consentPage({ ...check, lang });
});

export const POST = route(async (req) => {
  const lang = langFromAccept(req.headers.get("accept-language"));
  const app = appContext();
  const base = publicBase(req);
  const form = new URLSearchParams(await req.text());
  const check = await checkAuthorize(app, base, form);
  if (check.kind === "fatal") return errorPage(check.message, lang);
  if (check.kind === "redirect") return redirect(check.location, 303);
  try {
    await consumeRateLimit(app, `oauth-authorize:${clientIp(req)}`, 10);
    return redirect(await approve(app, base, check, form.get("api_key") ?? ""), 303);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    const message =
      e.code === "CREDENTIAL_SUSPENDED"
        ? pick(
            lang,
            "この API キーは停止されています。運営者に問い合わせてください。",
            "This API key has been suspended. Please contact the operator.",
          )
        : e.code === "RATE_LIMITED"
          ? pick(
              lang,
              "試行が多すぎます。1分ほど待ってからやり直してください。",
              "Too many attempts. Please wait a minute and try again.",
            )
          : pick(lang, "API キーが正しくありません。", "The API key is not valid.");
    return consentPage({ ...check, error: message, lang });
  }
});
