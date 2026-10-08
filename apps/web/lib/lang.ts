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

/** Cookie that remembers the language the reader chose (or last read in). Set by proxy.ts, one year. */
export const LANG_COOKIE = "pm.lang";

/** Query parameter the language switch adds so the choice is remembered: /tasks?lang=en. */
export const LANG_PARAM = "lang";

export const isLang = (v: unknown): v is Lang => v === "ja" || v === "en";

/**
 * Where a request should go so the reader sees one language everywhere (13 §7, 2026-10-09).
 * - `?lang=` is an explicit choice: remember it and redirect to the same page in that language (without the param)
 * - /en/* is English: remember "en" and render as is
 * - anything else is Japanese, but a reader who chose English before is sent to /en/<path>
 * Pure, so it can be tested; proxy.ts turns it into a redirect / rewrite.
 */
export function resolveLangRoute(
  pathname: string,
  search: string,
  cookie: string | undefined,
): { lang: Lang; redirectTo?: string; setCookie?: Lang } {
  const params = new URLSearchParams(search);
  const chosen = params.get(LANG_PARAM);
  const { lang: pathLang, path } = splitLang(pathname);
  if (isLang(chosen)) {
    params.delete(LANG_PARAM);
    const q = params.toString();
    const target = langHref(chosen, path) + (q ? `?${q}` : "");
    return { lang: chosen, redirectTo: target, setCookie: chosen };
  }
  if (pathLang === "en") return { lang: "en", setCookie: cookie === "en" ? undefined : "en" };
  if (cookie === "en") return { lang: "en", redirectTo: langHref("en", path) + search };
  return { lang: "ja" };
}

/** Pick one of two values by language. Keeps call sites short: pick(lang, "体験", "Try it"). */
export const pick = <T>(lang: Lang, ja: T, en: T): T => (lang === "en" ? en : ja);

/** Time zone and locale for dates shown to people. Everything in the pilot happens in Tokyo. */
export const dateLocale = (lang: Lang) => (lang === "en" ? "en-GB" : "ja-JP");
