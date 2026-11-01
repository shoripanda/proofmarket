// One public worker profile as a card (docs/architecture 14 §3.1). Server component.
import type { PublicWorkerProfile } from "@proofmarket/core/schemas/api";
import Link from "next/link";
import { type Lang, langHref } from "@/lib/lang";
import { completedText, languageName, ratingText } from "@/lib/profile-text";

type Profile = Omit<PublicWorkerProfile, "note">;

export function ProfileCard({ p, lang, link = true }: { p: Profile; lang: Lang; link?: boolean }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-lg font-bold">{p.display_name}</p>
        <p className="shrink-0 text-sm text-slate-500">
          {p.city ?? (lang === "ja" ? "地域は非公開" : "Area not shown")}
        </p>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {completedText(p.completed, lang)}
        {" · "}
        {ratingText(p.rating, lang)}
      </p>
      {p.skills.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {p.skills.map((s) => (
            <li key={s} className="rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-800">
              {s}
            </li>
          ))}
        </ul>
      ) : null}
      {p.languages.length ? (
        <p className="mt-2 text-sm text-slate-500">
          {p.languages.map((l) => languageName(l, lang)).join(" / ")}
        </p>
      ) : null}
    </>
  );
  return link ? (
    <Link
      href={langHref(lang, `/people/${p.public_id}`)}
      className="card-link block rounded-2xl border border-slate-200 p-4"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl border border-slate-200 p-4">{body}</div>
  );
}
