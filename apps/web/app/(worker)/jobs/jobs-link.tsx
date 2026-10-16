"use client";
// A way into general tasks from the verification list, shown only once the operator has opened them
// (the endpoint answers 404 TASKS_NOT_ENABLED until then).
import { useEffect, useState } from "react";
import { useApi } from "@/lib/client/api";
import { LLink, useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";

export function JobsLink() {
  const lang = useLang();
  const api = useApi();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    api<{ tasks: unknown[] }>("/v1/worker/market-tasks").then(
      (r) => setCount(r.tasks.length),
      () => setCount(null),
    );
  }, [api]);
  if (count === null) return null;
  return (
    <LLink
      href="/jobs"
      className="card-link flex items-center justify-between rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900"
    >
      <span>{pick(lang, `仕事の募集 ${count} 件`, `${count} open tasks`)}</span>
      <span className="arrow" aria-hidden="true">
        →
      </span>
    </LLink>
  );
}
