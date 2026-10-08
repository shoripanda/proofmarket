// 13 §7: a yen hint next to every USDC amount on the worker screens. A fixed display rate, never used to trade
// or settle anything; the screens say it is an estimate ("目安").
import { type Lang, pick } from "@/lib/lang";

export const YEN_PER_USDC = 150;

/** "約 45 円" / "about ¥45". Below one yen it says so rather than showing "約 0 円". */
export function yenHint(usdc: string | number, lang: Lang = "ja"): string {
  const n = Number(usdc) * YEN_PER_USDC;
  if (!Number.isFinite(n)) return "";
  if (n > 0 && n < 1) return pick(lang, "1 円未満", "under ¥1");
  const y = Math.round(n).toLocaleString("ja-JP");
  return pick(lang, `約 ${y} 円`, `about ¥${y}`);
}

/** The note shown once per screen that carries yen hints. */
export const rateNote = (lang: Lang) =>
  pick(
    lang,
    `円は 1 USDC = ${YEN_PER_USDC} 円で計算した目安です。`,
    `Yen figures are an estimate at 1 USDC = ¥${YEN_PER_USDC}.`,
  );
