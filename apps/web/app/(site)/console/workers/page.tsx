// S-B12 Preferred and blocked workers (requester console, docs/architecture 14 §4). Clearing a mark is one tap;
// workers are named only when they keep a public profile.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkerMarkButtons } from "@/components/console-actions";
import { Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { CONSOLE_COOKIE, consoleAuth } from "@/lib/services/console-service";
import { flagEnabled } from "@/lib/services/flags";
import { listWorkerPreferences } from "@/lib/services/prefs-service";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: pick(await getLang(), "推し・お断り | 依頼者の画面", "Preferred and blocked | Requester console"),
    robots: { index: false },
  };
}
export const dynamic = "force-dynamic";

export default async function ConsoleWorkersPage() {
  const lang = await getLang();
  const app = appContext();
  const auth = await consoleAuth(app, (await cookies()).get(CONSOLE_COOKIE)?.value);
  if (!auth) redirect(langHref(lang, "/console/login"));
  const enabled = await flagEnabled(app.db, "tasks_enabled");
  const marks = enabled ? (await listWorkerPreferences(app, auth)).workers : [];
  return (
    <>
      <p className="mx-auto max-w-5xl px-4 pt-8 text-sm">
        <Link href={langHref(lang, "/console/tasks")} className="font-semibold text-teal-700 underline">
          {pick(lang, "← 仕事", "← Tasks")}
        </Link>
      </p>
      <Section
        title={pick(lang, "推し・お断りにした worker", "Preferred and blocked workers")}
        lead={pick(
          lang,
          "推しにした人は応募の一覧で先頭に並び、「推しだけ」に出した仕事を見られます。お断りにした人には、あなたの仕事が表示されません。どちらも本人には知らされません。",
          "Preferred workers come first among applicants and can see tasks posted for preferred workers only. Blocked workers do not see your tasks. Neither is told.",
        )}
      >
        {!enabled ? (
          <p className="text-slate-600">
            {pick(lang, "仕事の受付はまだ始まっていません。", "Tasks are not open yet.")}
          </p>
        ) : marks.length === 0 ? (
          <p className="text-slate-600">
            {pick(
              lang,
              "まだいません。仕事の画面で、応募した人や担当した人に印をつけられます。",
              "None yet. Mark applicants or seat holders on the Tasks page.",
            )}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
            {marks.map((m) => (
              <li key={m.pref_ref} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <span>
                  <span
                    className={`mr-2 rounded px-1.5 font-semibold ${
                      m.kind === "prefer" ? "bg-teal-100 text-teal-900" : "bg-rose-100 text-rose-900"
                    }`}
                  >
                    {m.kind === "prefer" ? pick(lang, "推し", "Preferred") : pick(lang, "お断り", "Blocked")}
                  </span>
                  {m.public_id ? (
                    <Link
                      href={langHref(lang, `/people/${m.public_id}`)}
                      className="font-semibold text-teal-700 underline"
                    >
                      {m.display_name}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-slate-500">{m.pref_ref.slice(0, 18)}…</span>
                  )}
                </span>
                <WorkerMarkButtons worker={{ pref_ref: m.pref_ref }} kind={m.kind} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
