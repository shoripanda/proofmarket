// Japanese labels for task types and answers, shared by the worker app (client) and the site (server).
import type { AnswerValue, TaskType } from "@proofmarket/core";

export const TASK_TYPE_JA: Record<TaskType, { name: string; howTo: string }> = {
  PLACE_STATUS_VERIFICATION: {
    name: "営業しているか",
    howTo: "店頭・看板・営業時間の掲示を写して、営業しているかを答えます。",
  },
  QUEUE_LENGTH: {
    name: "店の外の行列",
    howTo: "店の外に並んでいる人の数を見て答えます。行列は後ろから、顔が写らないように撮ってください。",
  },
  NOTICE_POSTED: {
    name: "店頭の掲示",
    howTo:
      "質問にある掲示（臨時休業のお知らせなど）が店頭に出ているかを見て答えます。掲示か入口を写してください。",
  },
  CROWD_LEVEL: {
    name: "混み具合",
    howTo: "その場所の混み具合を見て答えます。全体の様子が分かるように撮ってください。",
  },
  SEAT_AVAILABILITY: {
    name: "空席",
    howTo: "席が空いているかを見て答えます。客席の様子が分かるように撮ってください。",
  },
  PARKING_AVAILABILITY: {
    name: "駐車場の空き",
    howTo: "駐車場に空きがあるかを見て答えます。満空の表示か、駐車場の様子を写してください。",
  },
  STOCK_CHECK: {
    name: "在庫",
    howTo: "質問にある商品が売り場にあるかを見て答えます。売り場の棚を写してください。",
  },
  PRICE_CHECK: {
    name: "値段",
    howTo: "質問にある商品やサービスの値段を、値札やメニューで確かめて数字で答えます。値札を写してください。",
  },
  SIGN_TRANSCRIPTION: {
    name: "掲示・メニューの書き起こし",
    howTo:
      "看板・掲示・メニューなどに書かれている文字を、そのまま書き起こします。書き起こした物を写してください。",
  },
  SITE_REPORT: {
    name: "現地の様子の報告",
    howTo: "質問にある場所へ行き、見たことを文章で報告します。様子が分かる写真を1枚撮ってください。",
  },
  DOCUMENT_TRANSCRIPTION: {
    name: "本・紙資料の書き起こし",
    howTo: "質問にある本や紙の資料の指定された箇所を、そのまま書き起こします。そのページを写してください。",
  },
  DOCUMENT_QA: {
    name: "本・紙資料を読んで答える",
    howTo: "質問にある本や紙の資料を読み、質問に文章で答えます。根拠になったページを写してください。",
  },
  PRODUCT_INSPECTION: {
    name: "実物の確認",
    howTo:
      "質問にある実物を手に取り、ラベル・型番・表示などを確かめて文章で答えます。その部分を写してください。",
  },
  PHONE_INQUIRY: {
    name: "電話での問い合わせ",
    howTo:
      "質問にある相手に電話で問い合わせ、聞いた内容を文章で答えます。通話の記録の画面かメモを写してください。",
  },
  MEASUREMENT: {
    name: "計測",
    howTo: "質問にある物の長さ・重さなどを測って数字で答えます。測っているところを写してください。",
  },
  CUSTOM_CHOICE: {
    name: "選んで答える質問",
    howTo: "質問を読んで、当てはまる選択肢を選びます。判断の根拠になる写真を撮ってください。",
  },
  CUSTOM_TASK: {
    name: "その他の作業",
    howTo: "質問にある作業をして、結果を文章で報告します。作業の様子か結果が分かる写真を撮ってください。",
  },
};

export const ANSWER_JA: Record<AnswerValue, { label: string; tone: string }> = {
  OPEN: { label: "営業している", tone: "bg-emerald-600" },
  CLOSED: { label: "営業していない", tone: "bg-slate-700" },
  NO_QUEUE: { label: "並んでいない", tone: "bg-emerald-600" },
  SHORT_QUEUE: { label: "5人くらいまで", tone: "bg-sky-600" },
  LONG_QUEUE: { label: "6人以上", tone: "bg-slate-700" },
  POSTED: { label: "出ている", tone: "bg-emerald-600" },
  NOT_POSTED: { label: "出ていない", tone: "bg-slate-700" },
  EMPTY: { label: "空いている", tone: "bg-emerald-600" },
  MODERATE: { label: "ふつう", tone: "bg-sky-600" },
  CROWDED: { label: "混んでいる", tone: "bg-slate-700" },
  SEATS_AVAILABLE: { label: "空席あり", tone: "bg-emerald-600" },
  SPACES_AVAILABLE: { label: "空きあり", tone: "bg-emerald-600" },
  FULL: { label: "満席・満車", tone: "bg-slate-700" },
  IN_STOCK: { label: "ある", tone: "bg-emerald-600" },
  OUT_OF_STOCK: { label: "ない", tone: "bg-slate-700" },
  UNCLEAR: { label: "分からない", tone: "bg-amber-600" },
};

/** Fixed codes get their Japanese label; requester-defined choices, numbers and text are shown as written. */
export const answerJa = (v: string | null | undefined) =>
  v ? (ANSWER_JA[v as AnswerValue]?.label ?? v) : null;

export type AnswerSchemaView =
  | { type: "enum"; values: string[] }
  | { type: "number"; unit?: string; min?: number; max?: number }
  | { type: "text"; max_chars?: number };

/** One line telling the worker how to answer (01 §4.15). */
export function answerFormatJa(s: AnswerSchemaView | undefined): string {
  if (!s || s.type === "enum")
    return `選んで答える: ${(s?.values ?? []).map((v) => answerJa(v)).join(" / ")}`;
  if (s.type === "number") return `数字で答える${s.unit ? `（単位: ${s.unit}）` : ""}`;
  return `文章で答える${s.max_chars ? `（${s.max_chars}字まで）` : ""}`;
}
