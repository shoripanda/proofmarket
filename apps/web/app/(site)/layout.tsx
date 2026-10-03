import type { ReactNode } from "react";
import { SiteShell } from "@/components/site";

// Public explanation pages (no login). The worker app lives in (worker) and keeps its own shell.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
