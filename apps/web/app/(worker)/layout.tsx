import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/client/auth";
import { Gate } from "./gate";

// Every worker screen requires login and onboarding (W-01 / W-02), handled by Gate.
export default function WorkerLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
