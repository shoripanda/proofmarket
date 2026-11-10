// The body of the 404 page (UX pass F4, docs/ux/uix-pass-2026-11-10.md): what happened and three ways on.
// app/not-found.tsx wraps it in the site chrome; app/(site)/not-found.tsx uses it bare, because the (site) layout
// already draws the chrome around notFound() from its pages.
import Link from "next/link";
import { type Lang, langHref, pick } from "@/lib/lang";

export function NotFoundBody({ lang }: { lang: Lang }) {
  const h = (p: string) => langHref(lang, p);
  const ways = [
    { href: "/how-it-works", label: pick(lang, "仕組みを読む", "How it works") },
    { href: "/demo", label: pick(lang, "結果の見本を見る", "See a sample result") },
    { href: "/connect", label: pick(lang, "エージェントをつなぐ", "Connect your agent") },
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 lg:px-8 py-16 sm:py-24">
      <p className="text-sm font-semibold tracking-wide text-teal-700">404</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
        {pick(lang, "このページは見つかりませんでした", "We could not find this page")}
      </h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-slate-600">
        {pick(
          lang,
          "URL が変わったか、入力が違っているかもしれません。トップか、下のページからたどってください。",
          "The address may have changed or been mistyped. Start from the home page or one of the pages below.",
        )}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={h("/")}
          className="inline-flex min-h-11 items-center rounded-full bg-teal-700 px-6 font-semibold text-white hover:bg-teal-800"
        >
          {pick(lang, "トップへ戻る", "Back to the home page")}
        </Link>
        {ways.map((w) => (
          <Link
            key={w.href}
            href={h(w.href)}
            className="inline-flex min-h-11 items-center rounded-full px-5 font-semibold text-teal-800 ring-1 ring-teal-700 hover:bg-teal-50"
          >
            {w.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
