import type { ReactNode } from "react";
import { SiteShell } from "@/components/site";
import { LangProvider } from "@/lib/client/lang";

// /en and /en/developers have their own English pages; every other /en/<path> is the Japanese page rendered in
// English (proxy.ts). Both use the same site chrome.
export default function EnLayout({ children }: { children: ReactNode }) {
  return (
    <LangProvider lang="en">
      <SiteShell lang="en">{children}</SiteShell>
    </LangProvider>
  );
}
