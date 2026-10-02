import type { ReactNode } from "react";

// PR-05: wrap with PrivyProvider (client component) configured with
// embeddedWallets.solana.createOnLogin = "users-without-wallets" and email/Google login only.
export default function WorkerLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
