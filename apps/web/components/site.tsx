// Public site chrome (S-xx pages): header, footer and small building blocks. Server components only.
import Link from "next/link";
import type { ReactNode } from "react";

/** Pages listed in the header. Add a page here when it exists, never before. */
export const SITE_NAV: { href: string; label: string }[] = [{ href: "/", label: "トップ" }];

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
            ProofMarket
          </Link>
          <nav className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {SITE_NAV.filter((n) => n.href !== "/").map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-teal-700">
                {n.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/login"
            className="rounded-full bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            worker ログイン
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-16 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl space-y-3 px-4 py-8 text-sm text-slate-500">
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            {SITE_NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-teal-700">
                {n.label}
              </Link>
            ))}
          </nav>
          <p>東京で試験運用中です。決済は Solana Devnet のテスト資産で行い、実際のお金は動きません。</p>
        </div>
      </footer>
    </div>
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
