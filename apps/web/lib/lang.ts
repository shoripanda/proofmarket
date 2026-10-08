// Two languages, one set of pages. Japanese lives at "/", English at "/en/<same path>" (proxy.ts rewrites it).
// Safe to import from client and server code: no next/headers here (see lang-server.ts for getLang).

export type Lang = "ja" | "en";

/** Request header set by proxy.ts for /en/* so server components know which language to render. */
export const LANG_HEADER = "x-pm-lang";

/** "/tasks" → "/en/tasks" when the reader is on the English site. External and anchor links pass through. */
export function langHref(lang: Lang, href: string): string {
  if (lang === "ja" || !href.startsWith("/") || href.startsWith("/en/") || href === "/en") return href;
  return href === "/" ? "/en" : `/en${href}`;
}

/** "/en/tasks" → { lang: "en", path: "/tasks" }; "/tasks" → { lang: "ja", path: "/tasks" }. */
export function splitLang(pathname: string): { lang: Lang; path: string } {
  if (pathname === "/en") return { lang: "en", path: "/" };
  if (pathname.startsWith("/en/")) return { lang: "en", path: pathname.slice(3) };
  return { lang: "ja", path: pathname };
}

/** Pick one of two values by language. Keeps call sites short: pick(lang, "体験", "Try it"). */
export const pick = <T>(lang: Lang, ja: T, en: T): T => (lang === "en" ? en : ja);

/** Time zone and locale for dates shown to people. Everything in the pilot happens in Tokyo. */
export const dateLocale = (lang: Lang) => (lang === "en" ? "en-GB" : "ja-JP");
