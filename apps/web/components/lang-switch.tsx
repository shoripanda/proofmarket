"use client";
import { usePathname } from "next/navigation";
// The header's language link: the SAME page in the other language, with ?lang= so the choice is remembered
// (proxy.ts sets the cookie and strips the parameter). A plain <a>, so the proxy sees the request.
import { useLang } from "@/lib/client/lang";
import { LANG_PARAM, langHref, splitLang } from "@/lib/lang";

export function LangSwitch() {
  const lang = useLang();
  const { path } = splitLang(usePathname() ?? "/");
  const other = lang === "ja" ? "en" : "ja";
  const href = `${langHref(other, path)}?${LANG_PARAM}=${other}`;
  return (
    <a
      href={href}
      className="rounded-full px-3 py-1.5 text-base font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-teal-700"
      lang={other}
      aria-label={other === "en" ? "Switch to English" : "日本語に切り替える"}
    >
      {other === "en" ? "English" : "日本語"}
    </a>
  );
}
