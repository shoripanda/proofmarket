// GET /r/{id}/badge.svg — one-line "a human checked this" badge an agent can embed next to its answer
// (01 §4.21). Same public-safe facts as the page; a missing or unfinished result reads 確認中 / pending.
// ?lang=en gives the English wording (the badge is an image, so the page language cannot reach it).
import { ApiError } from "@proofmarket/core";
import { appContext } from "@/lib/context";
import { type IdParams, route } from "@/lib/http";
import { badgeMessage } from "@/lib/proof-text";
import { publicResult } from "@/lib/services/public-service";

export const dynamic = "force-dynamic";

// Control characters cannot appear in XML at all; the rest is escaped as numeric references.
const esc = (s: string) =>
  [...s]
    .filter((c) => (c.codePointAt(0) ?? 0) >= 0x20 && c !== "\u007f")
    .map((c) => ("&<>\"'".includes(c) ? `&#${c.charCodeAt(0)};` : c))
    .join("");
// Rough advance widths at 12px: full-width characters take the em, the rest about 7px.
const width = (s: string) => [...s].reduce((n, c) => n + ((c.codePointAt(0) ?? 0) > 0xff ? 12 : 7), 0) + 16;

export const GET = route<IdParams>(async (req, { params }) => {
  const { id } = await params;
  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "ja";
  const facts = await publicResult(appContext(), id).catch((e) => {
    if (e instanceof ApiError && e.code === "VERIFICATION_NOT_FOUND") return null;
    throw e;
  });
  const { label, message, ok } = badgeMessage(facts, lang);
  const short = [...message].length > 40 ? `${[...message].slice(0, 39).join("")}…` : message;
  const lw = width(label);
  const mw = width(short);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + mw}" height="24" role="img" aria-label="${esc(`${label}: ${short}`)}">
<title>${esc(`${label}: ${short}`)}</title>
<clipPath id="r"><rect width="${lw + mw}" height="24" rx="6"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="24" fill="#334155"/><rect x="${lw}" width="${mw}" height="24" fill="${ok ? "#0f766e" : "#64748b"}"/></g>
<g fill="#fff" font-family="system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif" font-size="12" text-anchor="middle">
<text x="${lw / 2}" y="16">${esc(label)}</text><text x="${lw + mw / 2}" y="16">${esc(short)}</text></g></svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
});
