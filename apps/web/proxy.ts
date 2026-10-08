import { type NextRequest, NextResponse } from "next/server";
import { LANG_COOKIE, LANG_HEADER, resolveLangRoute } from "@/lib/lang";

// One language everywhere (13 §7). English lives at /en/<path>, the same page as /<path> rendered in English.
// The proxy (a) remembers the reader's language in a cookie, (b) sends a reader who chose English to /en/<path>
// when a link, a push notification or a sign-in redirect lands them on a Japanese URL, and (c) rewrites /en/<path>
// to /<path> with a header so the server components know which language to render (lib/lang-server.ts).
// /en itself has its own file under app/(en) (the pitch for judges), so it passes through unchanged.
const OWN_PAGES = new Set(["/en"]);
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const r = resolveLangRoute(pathname, search, req.cookies.get(LANG_COOKIE)?.value);

  if (r.redirectTo) {
    const url = req.nextUrl.clone();
    const [p, q = ""] = r.redirectTo.split("?");
    url.pathname = p ?? "/";
    url.search = q ? `?${q}` : "";
    const res = NextResponse.redirect(url, 307);
    if (r.setCookie) setLangCookie(res, r.setCookie);
    return res;
  }

  if (r.lang === "ja") return NextResponse.next();

  const headers = new Headers(req.headers);
  headers.set(LANG_HEADER, "en");
  let res: NextResponse;
  if (OWN_PAGES.has(pathname)) {
    res = NextResponse.next({ request: { headers } });
  } else {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice("/en".length) || "/";
    res = NextResponse.rewrite(url, { request: { headers } });
  }
  if (r.setCookie) setLangCookie(res, r.setCookie);
  return res;
}

function setLangCookie(res: NextResponse, lang: string) {
  res.cookies.set(LANG_COOKIE, lang, { path: "/", maxAge: COOKIE_MAX_AGE_S, sameSite: "lax" });
}

// Pages only: the API (/v1, /mcp, /oauth, /.well-known, /api), Next's assets and files with an extension
// (sw.js, manifest, icons, audio) are never redirected.
export const config = {
  matcher: ["/((?!v1|mcp|oauth|api|_next|\\.well-known|audio|.*\\..*).*)"],
};
