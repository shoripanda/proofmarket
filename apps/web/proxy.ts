import { type NextRequest, NextResponse } from "next/server";
import { LANG_HEADER } from "@/lib/lang";

// English site: /en/<path> is the same page as /<path>, rendered in English. The proxy rewrites the URL and
// tells the server components which language to use (lib/lang-server.ts reads the header). /en itself has its
// own file under app/(en) (the pitch for judges), so it passes through unchanged.
const OWN_PAGES = new Set(["/en"]);

export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(LANG_HEADER, "en");
  const { pathname } = req.nextUrl;
  if (OWN_PAGES.has(pathname)) return NextResponse.next({ request: { headers } });
  const url = req.nextUrl.clone();
  url.pathname = pathname.slice("/en".length) || "/";
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = { matcher: ["/en", "/en/:path*"] };
