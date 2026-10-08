import type { ReactNode } from "react";
import { SiteShell } from "@/components/site";
import { LangProvider } from "@/lib/client/lang";
import { getLang } from "@/lib/lang-server";

// Public explanation pages (no login). The worker app lives in (worker) and keeps its own shell.
// The same files serve /<path> in Japanese and /en/<path> in English (see proxy.ts).
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const lang = await getLang();
  return (
    <LangProvider lang={lang}>
      <SiteShell lang={lang}>{children}</SiteShell>
    </LangProvider>
  );
}
