import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/client/auth";
import { LangProvider } from "@/lib/client/lang";
import { getLang } from "@/lib/lang-server";
import { Gate } from "./gate";

// Every worker screen requires login and onboarding (W-01 / W-02), handled by Gate.
// Rendered per request: these screens depend on the signed-in worker and must never be prerendered at build.
export const dynamic = "force-dynamic";

export default async function WorkerLayout({ children }: { children: ReactNode }) {
  const lang = await getLang();
  return (
    <LangProvider lang={lang}>
      <AuthProvider>
        <Gate>{children}</Gate>
      </AuthProvider>
    </LangProvider>
  );
}
