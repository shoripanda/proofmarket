"use client";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useApi } from "@/lib/client/api";
import { useSession } from "@/lib/client/auth";
import { useLang, useSitePath } from "@/lib/client/lang";
import { langHref, pick } from "@/lib/lang";

const PUBLIC = ["/login"];

/** Redirects to /login when signed out and to /onboarding until registration is complete. */
export function Gate({ children }: { children: ReactNode }) {
  const s = useSession();
  const api = useApi();
  const lang = useLang();
  const path = useSitePath();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!s.ready) return;
    const go = (p: string) => router.replace(langHref(lang, p));
    if (!s.authenticated) {
      if (!PUBLIC.includes(path)) go("/login");
      setChecked(true);
      return;
    }
    api<{ onboarded: boolean }>("/v1/worker/me")
      .then((me) => {
        if (!me.onboarded && path !== "/onboarding") go("/onboarding");
        else if (me.onboarded && (path === "/onboarding" || path === "/login")) go("/tasks");
      })
      .catch(() => go("/login"))
      .finally(() => setChecked(true));
  }, [s.ready, s.authenticated, path, api, router, lang]);

  if (!s.ready || !checked) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-slate-400">
        {pick(lang, "読み込み中…", "Loading…")}
      </div>
    );
  }
  return <>{children}</>;
}
