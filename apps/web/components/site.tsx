// Public site chrome (S-xx pages): header, footer and small building blocks. Server components only
// (the plain-words switch is a client island). Every label exists in Japanese and English.
import Link from "next/link";
import type { ReactNode } from "react";
import { PlainProvider, PlainToggle } from "@/lib/client/plain";
import { type Lang, langHref, pick } from "@/lib/lang";

type NavItem = { href: string; label: string };

/** Pages listed in the footer. Add a page here when it exists, never before. */
export const siteNav = (lang: Lang): NavItem[] => [
  { href: "/", label: pick(lang, "トップ", "Home") },
  { href: "/how-it-works", label: pick(lang, "仕組み", "How it works") },
  { href: "/try", label: pick(lang, "体験", "Try it") },
  { href: "/demo", label: pick(lang, "結果の見本", "Sample results") },
  { href: "/stats", label: pick(lang, "実績", "Numbers") },
  { href: "/map", label: pick(lang, "地図", "Map") },
  { href: "/data", label: pick(lang, "データ", "Data") },
  { href: "/developers", label: pick(lang, "開発者向け", "Developers") },
  { href: "/pricing", label: pick(lang, "料金", "Pricing") },
  { href: "/workers", label: pick(lang, "worker 向け", "For workers") },
  { href: "/rules", label: pick(lang, "決まり", "Rules") },
  { href: "/faq", label: pick(lang, "よくある質問", "FAQ") },
  { href: "/join", label: pick(lang, "申し込み", "Sign up") },
  { href: "/console", label: pick(lang, "依頼者の画面", "Requester console") },
];

/** The five the header shows, large. Everything else stays reachable from the footer. */
export const headerNav = (lang: Lang): NavItem[] => [
  { href: "/try", label: pick(lang, "体験", "Try it") },
  { href: "/how-it-works", label: pick(lang, "仕組み", "How it works") },
  { href: "/stats", label: pick(lang, "実績", "Numbers") },
  { href: "/developers", label: pick(lang, "開発者向け", "Developers") },
  { href: "/workers", label: pick(lang, "worker 向け", "For workers") },
];

export function SiteShell({ lang, children }: { lang: Lang; children: ReactNode }) {
  const h = (href: string) => langHref(lang, href);
  return (
    <PlainProvider>
      <div className="min-h-dvh bg-white">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <Link href={h("/")} className="mr-auto text-lg font-bold tracking-tight text-slate-900 sm:mr-0">
              ProofMarket
            </Link>
            <nav className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-x-6 overflow-x-auto whitespace-nowrap px-4 text-base font-semibold text-slate-700 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:px-0 sm:text-lg">
              {headerNav(lang).map((n) => (
                <Link
                  key={n.href}
                  href={h(n.href)}
                  className="py-1 underline-offset-8 hover:text-teal-700 hover:underline"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <PlainToggle />
            {lang === "ja" ? (
              <Link
                href="/en"
                className="text-base font-semibold text-slate-600 hover:text-teal-700"
                lang="en"
              >
                English
              </Link>
            ) : (
              <Link href="/" className="text-base font-semibold text-slate-600 hover:text-teal-700" lang="ja">
                日本語
              </Link>
            )}
            <Link
              href={h("/login")}
              className="rounded-full bg-teal-700 px-5 py-2 text-base font-semibold text-white hover:bg-teal-800"
            >
              {pick(lang, "worker ログイン", "Worker login")}
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-16 border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-5xl space-y-3 px-4 py-8 text-sm text-slate-500">
            <nav className="flex flex-wrap gap-x-4 gap-y-1">
              {siteNav(lang).map((n) => (
                <Link
                  key={n.href}
                  href={h(n.href)}
                  className="underline-offset-8 hover:text-teal-700 hover:underline"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Link href={h("/legal/worker-terms")} className="hover:text-teal-700">
                {pick(lang, "worker 参加規約", "Worker terms")}
              </Link>
              <Link href={h("/legal/requester-terms")} className="hover:text-teal-700">
                {pick(lang, "依頼者規約", "Requester terms")}
              </Link>
              <Link href={h("/legal/privacy")} className="hover:text-teal-700">
                {pick(lang, "プライバシーポリシー", "Privacy policy")}
              </Link>
              <Link href={h("/legal/operator")} className="hover:text-teal-700">
                {pick(lang, "運営者情報", "Operator")}
              </Link>
            </nav>
            <p>
              {pick(
                lang,
                "東京で試験運用中です。決済は Solana Devnet のテスト資産で行い、実際のお金は動きません。",
                "Pilot in Tokyo. Payments use test assets on Solana Devnet; no real money moves.",
              )}
            </p>
          </div>
        </footer>
      </div>
    </PlainProvider>
  );
}

export function Section({
  title,
  lead,
  children,
  id,
}: {
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mx-auto max-w-5xl px-4 py-10">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {lead ? <p className="mt-2 max-w-3xl leading-relaxed text-slate-600">{lead}</p> : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}

export function PageHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 bg-gradient-to-b from-teal-50 to-white">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <p className="text-sm font-semibold tracking-wide text-teal-700">{eyebrow}</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {title}
        </h1>
        {children ? <div className="mt-4 max-w-3xl leading-relaxed text-slate-600">{children}</div> : null}
      </div>
    </div>
  );
}

export function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}
