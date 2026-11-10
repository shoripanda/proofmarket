// Any URL with no page (UX pass F4, docs/ux/uix-pass-2026-11-10.md). Next's default page was English-only, had
// no header and no way back. notFound() inside (site) pages is handled by app/(site)/not-found.tsx instead.
import type { Metadata } from "next";
import { NotFoundBody } from "@/components/not-found-body";
import { SiteShell } from "@/components/site";
import { LangProvider } from "@/lib/client/lang";
import { pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: pick(lang, "ページが見つかりません | ProofMarket", "Page not found | ProofMarket"),
    robots: { index: false },
  };
}

export default async function NotFound() {
  const lang = await getLang();
  return (
    <LangProvider lang={lang}>
      <SiteShell lang={lang}>
        <NotFoundBody lang={lang} />
      </SiteShell>
    </LangProvider>
  );
}
