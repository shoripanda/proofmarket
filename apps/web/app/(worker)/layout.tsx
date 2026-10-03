import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/client/auth";
import { Gate } from "./gate";

// Every worker screen requires login and onboarding (W-01 / W-02), handled by Gate.
// Rendered per request: these screens depend on the signed-in worker and must never be prerendered at build.
export const dynamic = "force-dynamic";

export default function WorkerLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
