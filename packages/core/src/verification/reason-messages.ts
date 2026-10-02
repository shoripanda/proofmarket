// Worker-facing rejection messages (07 §6). Japanese first; English is P1.
// Placeholders: {n} minutes, {a} accuracy m, {d} distance m, {r} radius m.

import type { CheckReasonCode } from "../domain/enums.ts";

type Message = { ja: string; en?: string };

export const REASON_MESSAGES: Partial<Record<CheckReasonCode | "NONCE_EXPIRED", Message>> = {
  EVIDENCE_STALE: { ja: "撮影の受付時間（{n} 分）を過ぎました。もう一度「撮影を始める」を押してください。" },
  LOCATION_ACCURACY_TOO_LOW: {
    ja: "位置の精度が足りません（誤差 {a} m）。屋外の空が見える場所で、少し待ってから撮り直してください。",
  },
  EVIDENCE_OUTSIDE_GEOFENCE: {
    ja: "店舗から {d} m 離れた位置で撮影されています。{r} m 以内に近づいて撮り直してください。",
  },
  MEDIA_DECODE_FAILED: { ja: "写真を読み込めませんでした。撮り直してください。" },
  EVIDENCE_REPLAYED: { ja: "以前に使われた写真と同じファイルです。このタスクは終了しました。" },
  EVIDENCE_NEAR_DUPLICATE: { ja: "ほかの提出とほぼ同じ写真です。このタスクは終了しました。" },
  NONCE_EXPIRED: { ja: "撮影の受付時間を過ぎました。もう一度「撮影を始める」を押してください。" },
};
