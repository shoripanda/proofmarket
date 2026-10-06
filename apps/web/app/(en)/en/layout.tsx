import type { ReactNode } from "react";
import { EnShell } from "@/components/site-en";

// English pages for judges and developers abroad. The worker app stays Japanese.
export default function EnLayout({ children }: { children: ReactNode }) {
  return <EnShell>{children}</EnShell>;
}
