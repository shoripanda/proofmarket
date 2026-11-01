// Labels for public worker profiles (docs/architecture 14 §3.1), shared by the worker editor and the public pages.
import type { ProfileLanguage } from "@proofmarket/core";
import type { Lang } from "./lang";

export const LANGUAGE_NAMES: Record<ProfileLanguage, { ja: string; en: string }> = {
  ja: { ja: "日本語", en: "Japanese" },
  en: { ja: "英語", en: "English" },
  zh: { ja: "中国語", en: "Chinese" },
  ko: { ja: "韓国語", en: "Korean" },
  es: { ja: "スペイン語", en: "Spanish" },
  fr: { ja: "フランス語", en: "French" },
  de: { ja: "ドイツ語", en: "German" },
  pt: { ja: "ポルトガル語", en: "Portuguese" },
  it: { ja: "イタリア語", en: "Italian" },
  ru: { ja: "ロシア語", en: "Russian" },
  vi: { ja: "ベトナム語", en: "Vietnamese" },
  th: { ja: "タイ語", en: "Thai" },
  id: { ja: "インドネシア語", en: "Indonesian" },
  tl: { ja: "タガログ語", en: "Tagalog" },
  hi: { ja: "ヒンディー語", en: "Hindi" },
  ne: { ja: "ネパール語", en: "Nepali" },
  ar: { ja: "アラビア語", en: "Arabic" },
  tr: { ja: "トルコ語", en: "Turkish" },
  uk: { ja: "ウクライナ語", en: "Ukrainian" },
  pl: { ja: "ポーランド語", en: "Polish" },
};

export const languageName = (code: string, lang: Lang) =>
  LANGUAGE_NAMES[code as ProfileLanguage]?.[lang] ?? code;

/** "4.6 (12 件)" or a note that ratings show from 3. */
export function ratingText(r: { average: number; count: number } | null, lang: Lang): string {
  if (!r) return lang === "ja" ? "評価はまだ表示されません" : "Not rated yet";
  return lang === "ja"
    ? `★ ${r.average.toFixed(1)}（${r.count} 件）`
    : `★ ${r.average.toFixed(1)} (${r.count})`;
}

export function completedText(n: number, lang: Lang): string {
  return lang === "ja" ? `完了 ${n} 件` : `${n} completed`;
}
