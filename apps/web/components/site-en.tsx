// English site chrome (/en/*): the same look as the Japanese site, for judges and developers abroad.
import Link from "next/link";
import type { ReactNode } from "react";

export const EN_NAV: { href: string; label: string }[] = [
  { href: "/en", label: "Home" },
  { href: "/try", label: "Live demo" },
  { href: "/en/developers", label: "Developers" },
  { href: "/stats", label: "Numbers" },
  { href: "/map", label: "Map" },
];

export function EnShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/en" className="mr-auto text-lg font-bold tracking-tight text-slate-900 sm:mr-0">
            ProofMarket
          </Link>
          <nav className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-x-6 overflow-x-auto whitespace-nowrap px-4 text-base font-semibold text-slate-700 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:px-0 sm:text-lg">
            {EN_NAV.filter((n) => n.href !== "/en").map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-teal-700">
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/" className="text-base font-semibold text-slate-600 hover:text-teal-700" lang="ja">
            日本語
          </Link>
          <Link
            href="/en/developers"
            className="rounded-full bg-teal-700 px-5 py-2 text-base font-semibold text-white hover:bg-teal-800"
          >
            Connect your agent
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-16 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl space-y-3 px-4 py-8 text-sm text-slate-500">
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            {EN_NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-teal-700">
                {n.label}
              </Link>
            ))}
            <Link href="/" className="hover:text-teal-700">
              Japanese site
            </Link>
          </nav>
          <p>
            Pilot in Tokyo. Settlement runs on Solana Devnet with test USDC; no real money moves. Worker app
            and legal pages are in Japanese, the language of the people doing the work.
          </p>
        </div>
      </footer>
    </div>
  );
}
