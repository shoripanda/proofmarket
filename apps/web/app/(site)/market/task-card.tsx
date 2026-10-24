// One open public task as a card (docs/architecture 14 §6). Server component.
import type { PublicMarketTask } from "@proofmarket/core/schemas/api";
import Link from "next/link";
import { dateLocale, type Lang, langHref, pick } from "@/lib/lang";

type Task = Omit<PublicMarketTask, "note">;

export const closes = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(dateLocale(lang), {
    timeZone: "Asia/Tokyo",
    month: lang === "en" ? "short" : "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function marketFacts(t: Task, lang: Lang): string[] {
  return [
    t.remote_ok ? pick(lang, "どこからでも", "Anywhere") : (t.area ?? ""),
    pick(lang, `残り ${t.seats_open} 人`, `${t.seats_open} open`),
    t.selection_mode === "first_come"
      ? pick(lang, "先着", "First come")
      : pick(lang, "応募して選ばれる", "Apply"),
    pick(
      lang,
      `引き受けてから ${t.completion_window_hours} 時間以内`,
      `${t.completion_window_hours} h to deliver`,
    ),
    t.release_mode === "auto"
      ? pick(lang, "提出したら支払い", "Paid on delivery")
      : pick(lang, "依頼者の承認で支払い（24 時間で自動）", "Paid on approval (automatic after 24 h)"),
  ].filter(Boolean);
}

export function MarketTaskCard({ t, lang }: { t: Task; lang: Lang }) {
  return (
    <Link
      href={langHref(lang, `/market/${t.task_id}`)}
      className="card-link block rounded-2xl border border-slate-200 p-4"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 font-bold leading-snug">{t.title}</p>
        <p className="shrink-0 text-lg font-bold text-teal-700">
          {t.price.amount} {t.price.asset}
        </p>
      </div>
      <p className="mt-1 text-sm text-slate-500">{marketFacts(t, lang).slice(0, 3).join(" · ")}</p>
      <p className="mt-1 text-xs text-slate-500">
        {pick(lang, "締切 ", "Closes ")}
        {closes(t.deadline, lang)}
      </p>
    </Link>
  );
}
