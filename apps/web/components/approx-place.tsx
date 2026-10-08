// 13 §9 PR 7: shown wherever a public surface carries a place the requester asked to keep coarse.
import { type Lang, pick } from "@/lib/lang";

/** "Approximate location (about 1 km)" with a magnifier line icon (24×24, stroke only). */
export function ApproxPlace({ precisionM, lang }: { precisionM: number; lang: Lang }) {
  const km = Math.max(1, Math.round(precisionM / 1000));
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 21 21" />
      </svg>
      {pick(lang, `おおよその場所（約 ${km} km）`, `Approximate location (about ${km} km)`)}
    </span>
  );
}
