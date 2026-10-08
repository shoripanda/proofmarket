"use client";
// Language for client components. Layouts render <LangProvider lang={…}> from the request header; components
// read it with useLang() and build links with <LLink> so the reader stays on the English site.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentProps, createContext, type ReactNode, useContext } from "react";
import { type Lang, langHref, splitLang } from "@/lib/lang";

const LangContext = createContext<Lang>("ja");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** The path without the /en prefix, so a screen can compare it with its own route. */
export function useSitePath() {
  return splitLang(usePathname()).path;
}

/** next/link that prefixes /en on the English site. */
export function LLink({ href, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const lang = useLang();
  return <Link href={langHref(lang, href)} {...rest} />;
}
