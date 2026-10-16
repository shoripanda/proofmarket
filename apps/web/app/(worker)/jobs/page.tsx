"use client";
// W-20 仕事 — general tasks next to verifications (docs/architecture 13 §8): open tasks, and the worker's own seats.
import { useEffect, useState } from "react";
import { Card, Notice, Shell, yen } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import { LLink, useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";
import { SEAT_TEXT } from "./seat-state";
import type { Job, MySeat } from "./types";

export default function JobsPage() {
  const lang = useLang();
  const api = useApi();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [seats, setSeats] = useState<MySeat[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ tasks: Job[] }>("/v1/worker/market-tasks").then(
      (r) => setJobs(r.tasks),
      (e) => setErr(errorText(e, lang)),
    );
    api<{ seats: MySeat[] }>("/v1/worker/market-seats").then(
      (r) => setSeats(r.seats),
      () => setSeats([]),
    );
  }, [api, lang]);

  const live = (seats ?? []).filter((s) => s.state === "ASSIGNED" || s.state === "IN_REVIEW");
  return (
    <Shell title={pick(lang, "仕事", "Tasks")} back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {live.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-500">{pick(lang, "あなたの仕事", "Your tasks")}</h2>
          {live.map((s) => (
            <LLink key={s.seat_id} href={`/jobs/seats/${s.seat_id}`} className="block">
              <Card>
                <p className="font-bold leading-snug">{s.title}</p>
                <p className="mt-1 text-sm text-teal-700">{SEAT_TEXT[lang][s.state]}</p>
              </Card>
            </LLink>
          ))}
        </section>
      ) : null}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-500">{pick(lang, "募集中", "Open")}</h2>
        {jobs && jobs.length === 0 ? (
          <Notice>{pick(lang, "いま募集中の仕事はありません。", "No open tasks right now.")}</Notice>
        ) : null}
        {jobs?.map((j) => (
          <LLink key={j.task_id} href={`/jobs/${j.task_id}`} className="block">
            <Card>
              <div className="flex items-start gap-3">
                <p className="flex-1 font-bold leading-snug">{j.title}</p>
                <p className="shrink-0 text-lg font-bold text-teal-700">
                  {yen(j.price.amount, lang, j.price.asset)}
                </p>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {j.remote_ok ? pick(lang, "どこからでも", "Anywhere") : j.area}
                {" · "}
                {pick(lang, `残り ${j.seats_open} 人`, `${j.seats_open} open`)}
                {" · "}
                {j.selection_mode === "first_come"
                  ? pick(lang, "先着", "First come")
                  : pick(lang, "応募して選ばれる", "Apply")}
              </p>
            </Card>
          </LLink>
        ))}
      </section>
    </Shell>
  );
}
