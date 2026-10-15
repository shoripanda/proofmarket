// Public site chrome (S-xx pages): header, footer and small building blocks. Server components only
// (the language switch is a client island). Every label exists in Japanese and English.
import Link from "next/link";
import type { ReactNode } from "react";
import { LangSwitch } from "@/components/lang-switch";
import { PlainProvider } from "@/lib/client/plain";
import { clusterText } from "@/lib/cluster-public";
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
  { href: "/connect", label: pick(lang, "エージェントをつなぐ", "Connect your agent") },
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

/** The app icon (public/icon-*.png: a white check on teal), drawn as SVG so it stays sharp at header size. */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="11" className="fill-teal-700" />
      <path
        d="M13 25.5l7.5 7.5L35.5 16"
        fill="none"
        stroke="white"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteShell({ lang, children }: { lang: Lang; children: ReactNode }) {
  const h = (href: string) => langHref(lang, href);
  const ct = clusterText();
  return (
    <PlainProvider>
      <div className="min-h-dvh bg-white">
        {/* Two rows so every header item is visible at once (2026-10-16: the one-row header cut the menu off at
            desktop width and hid it behind a sideways scroll on phones). Sticky from tablet up only: on a phone
            the two rows would cover a quarter of the screen. */}
        <header className="z-10 border-b border-slate-200 bg-white/95 backdrop-blur sm:sticky sm:top-0">
          <div className="mx-auto max-w-5xl space-y-3 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <Link
                href={h("/")}
                className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
              >
                <LogoMark className="h-11 w-11 shrink-0 sm:h-14 sm:w-14" />
                ProofMarket
              </Link>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                <Link
                  href={h("/login")}
                  className="whitespace-nowrap rounded-full px-2.5 py-2 text-[13px] font-semibold text-teal-800 ring-1 ring-teal-700 hover:bg-teal-50 sm:px-4 sm:text-base"
                >
                  {pick(lang, "worker ログイン", "Worker login")}
                </Link>
                {/* The one action the site asks of an agent builder, on every page (13 §7 /connect). */}
                <Link
                  href={h("/connect")}
                  className="whitespace-nowrap rounded-full bg-teal-700 px-2.5 py-2 text-[13px] font-semibold text-white hover:bg-teal-800 sm:px-5 sm:text-base"
                >
                  {pick(lang, "エージェントをつなぐ", "Connect your agent")}
                </Link>
                <LangSwitch />
              </div>
            </div>
            <nav className="grid grid-cols-3 gap-2 text-sm font-semibold text-slate-700 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-1 sm:text-lg">
              {headerNav(lang).map((n) => (
                <Link
                  key={n.href}
                  href={h(n.href)}
                  className="rounded-lg bg-slate-50 px-2 py-2 text-center ring-1 ring-slate-200 hover:text-teal-700 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-1 sm:ring-0 sm:underline-offset-8 sm:hover:underline"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
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
                `拠点は東京。決済は ${ct.chain} で行います。`,
                `Based in Tokyo. Payments are settled on ${ct.chain}.`,
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
