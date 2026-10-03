"use client";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useApi } from "@/lib/client/api";
import { useSession } from "@/lib/client/auth";

const PUBLIC = ["/login"];

/** Redirects to /login when signed out and to /onboarding until registration is complete. */
export function Gate({ children }: { children: ReactNode }) {
  const s = useSession();
  const api = useApi();
  const path = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!s.ready) return;
    if (!s.authenticated) {
      if (!PUBLIC.includes(path)) router.replace("/login");
      setChecked(true);
      return;
    }
    api<{ onboarded: boolean }>("/v1/worker/me")
      .then((me) => {
        if (!me.onboarded && path !== "/onboarding") router.replace("/onboarding");
        else if (me.onboarded && (path === "/onboarding" || path === "/login")) router.replace("/tasks");
      })
      .catch(() => router.replace("/login"))
      .finally(() => setChecked(true));
  }, [s.ready, s.authenticated, path, api, router]);

  if (!s.ready || !checked) {
    return <div className="flex min-h-dvh items-center justify-center text-slate-400">読み込み中…</div>;
  }
  return <>{children}</>;
}
