"use client";
// Worker auth on the client. Production: Privy (email / Google, Solana embedded wallet created on login).
// DEV_MODE: a local name stored in localStorage becomes the token `dev:<name>`.
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export interface WorkerSession {
  ready: boolean;
  authenticated: boolean;
  getToken: () => Promise<string | null>;
  login: (devName?: string) => void;
  logout: () => Promise<void>;
  isDev: boolean;
}

const Ctx = createContext<WorkerSession | null>(null);
export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside AuthProvider");
  return s;
};

const DEV = process.env.NEXT_PUBLIC_DEV_MODE === "1";
const DEV_KEY = "pm.devName";

function DevBridge({ children }: { children: ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setName(window.localStorage.getItem(DEV_KEY));
    } catch {
      /* storage blocked */
    }
    setReady(true);
  }, []);
  const value = useMemo<WorkerSession>(
    () => ({
      ready,
      authenticated: !!name,
      isDev: true,
      getToken: async () => (name ? `dev:${name}` : null),
      login: (devName) => {
        const n = (devName ?? "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "");
        if (!n) return;
        try {
          window.localStorage.setItem(DEV_KEY, n);
        } catch {
          /* ignore */
        }
        setName(n);
      },
      logout: async () => {
        try {
          window.localStorage.removeItem(DEV_KEY);
        } catch {
          /* ignore */
        }
        setName(null);
      },
    }),
    [name, ready],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function PrivyBridge({ children }: { children: ReactNode }) {
  const p = usePrivy();
  const value = useMemo<WorkerSession>(
    () => ({
      ready: p.ready,
      authenticated: p.authenticated,
      isDev: false,
      getToken: () => p.getAccessToken(),
      login: () => p.login(),
      logout: () => p.logout(),
    }),
    [p],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (DEV) return <DevBridge>{children}</DevBridge>;
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""}
      config={{
        loginMethods: ["email", "google"],
        embeddedWallets: { solana: { createOnLogin: "users-without-wallets" } },
        appearance: { theme: "light", accentColor: "#0f766e", walletChainType: "solana-only" },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
