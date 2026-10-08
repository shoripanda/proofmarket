// Labels for task types and answers in both languages, shared by the worker app (client) and the site (server).
import type { AnswerValue, TaskType } from "@proofmarket/core";
import type { Lang } from "./lang";

type TypeText = { name: string; howTo: string };

export const TASK_TYPE_JA: Record<TaskType, TypeText> = {
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

export const TASK_TYPE_EN: Record<TaskType, TypeText> = {
  PLACE_STATUS_VERIFICATION: {
    name: "Open or closed",
    howTo: "Photograph the shop front, sign or opening-hours notice and answer whether it is open.",
  },
  QUEUE_LENGTH: {
    name: "Queue outside",
    howTo: "Count the people queuing outside and answer. Shoot the queue from behind so no faces show.",
  },
  NOTICE_POSTED: {
    name: "Notice at the entrance",
    howTo:
      "Check whether the notice in the question (a temporary-closure sign, for example) is posted. Photograph the notice or the entrance.",
  },
  CROWD_LEVEL: {
    name: "How crowded",
    howTo: "Judge how crowded the place is. Frame the shot so the overall scene is visible.",
  },
  SEAT_AVAILABILITY: {
    name: "Free seats",
    howTo: "Check whether seats are free. Frame the shot so the seating area is visible.",
  },
  PARKING_AVAILABILITY: {
    name: "Parking spaces",
    howTo: "Check whether the car park has space. Photograph the full/vacant sign or the car park itself.",
  },
  STOCK_CHECK: {
    name: "In stock",
    howTo: "Check whether the item in the question is on the shelf. Photograph the shelf.",
  },
  PRICE_CHECK: {
    name: "Price",
    howTo:
      "Check the price of the item or service on the price tag or menu and answer with a number. Photograph the tag.",
  },
  SIGN_TRANSCRIPTION: {
    name: "Transcribe a sign or menu",
    howTo: "Copy the text on the sign, notice or menu exactly as written. Photograph what you transcribed.",
  },
  SITE_REPORT: {
    name: "On-site report",
    howTo: "Go to the place in the question and describe what you see. Take one photo that shows the scene.",
  },
  DOCUMENT_TRANSCRIPTION: {
    name: "Transcribe a book or paper",
    howTo: "Copy the specified part of the book or paper document exactly as written. Photograph that page.",
  },
  DOCUMENT_QA: {
    name: "Answer from a book or paper",
    howTo:
      "Read the book or paper document in the question and answer in writing. Photograph the page you relied on.",
  },
  PRODUCT_INSPECTION: {
    name: "Inspect a physical item",
    howTo:
      "Pick up the item in the question, check the label, model number or markings, and describe them. Photograph that part.",
  },
  PHONE_INQUIRY: {
    name: "Phone inquiry",
    howTo:
      "Call the party in the question, ask, and write down what you were told. Photograph your call log or notes.",
  },
  MEASUREMENT: {
    name: "Measurement",
    howTo:
      "Measure the length, weight or similar of the item in the question and answer with a number. Photograph the measurement in progress.",
  },
  CUSTOM_CHOICE: {
    name: "Multiple choice",
    howTo: "Read the question and pick the option that applies. Take a photo that supports your choice.",
  },
  CUSTOM_TASK: {
    name: "Other task",
    howTo:
      "Do the task in the question and describe the result. Take a photo that shows the work or its result.",
  },
};

export const taskTypeText = (lang: Lang) => (lang === "en" ? TASK_TYPE_EN : TASK_TYPE_JA);

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

const ANSWER_EN_LABEL: Record<AnswerValue, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  NO_QUEUE: "No queue",
  SHORT_QUEUE: "Up to about 5",
  LONG_QUEUE: "6 or more",
  POSTED: "Posted",
  NOT_POSTED: "Not posted",
  EMPTY: "Empty",
  MODERATE: "Moderate",
  CROWDED: "Crowded",
  SEATS_AVAILABLE: "Seats available",
  SPACES_AVAILABLE: "Spaces available",
  FULL: "Full",
  IN_STOCK: "In stock",
  OUT_OF_STOCK: "Out of stock",
  UNCLEAR: "Can't tell",
};

/** Label and colour for a fixed answer code. */
export const answerText = (lang: Lang, v: AnswerValue) => ({
  label: lang === "en" ? ANSWER_EN_LABEL[v] : ANSWER_JA[v].label,
  tone: ANSWER_JA[v].tone,
});

/** Fixed codes get their label; requester-defined choices, numbers and text are shown as written. */
export const answerLabel = (lang: Lang, v: string | null | undefined) =>
  v ? (v in ANSWER_JA ? answerText(lang, v as AnswerValue).label : v) : null;
export const answerJa = (v: string | null | undefined) => answerLabel("ja", v);

/** One field of a form answer (01 §4.25), as the API returns it. */
export type FormFieldView =
  | { type: "enum"; key: string; label: string; values: string[]; required?: boolean }
  | {
      type: "number";
      key: string;
      label: string;
      unit?: string;
      min?: number;
      max?: number;
      required?: boolean;
    }
  | { type: "text"; key: string; label: string; max_chars?: number; required?: boolean }
  | {
      /** Sense index (13 §4): a whole number from `min` (1) to `max` (5 or 10). */
      type: "scale";
      key: string;
      label: string;
      min?: number;
      max: number;
      labels: [string, string];
      required?: boolean;
    };

export type AnswerSchemaView =
  | { type: "enum"; values: string[] }
  | { type: "number"; unit?: string; min?: number; max?: number }
  | { type: "text"; max_chars?: number }
  | { type: "form"; fields: FormFieldView[] };

/** One line telling the worker how to answer (01 §4.15). */
export function answerFormat(lang: Lang, s: AnswerSchemaView | undefined): string {
  const choices = (s?.type === "enum" ? s.values : []).map((v) => answerLabel(lang, v)).join(" / ");
  const labels = (s?.type === "form" ? s.fields : [])
    .map((f) => (f.type === "scale" ? `${f.label}${scaleFormat(lang, f)}` : f.label))
    .join(lang === "en" ? ", " : "、");
  if (lang === "en") {
    if (!s || s.type === "enum") return `Choose one: ${choices}`;
    if (s.type === "number") return `Answer with a number${s.unit ? ` (unit: ${s.unit})` : ""}`;
    if (s.type === "form") return `Fill in ${s.fields.length} fields: ${labels}`;
    return `Answer in text${s.max_chars ? ` (up to ${s.max_chars} characters)` : ""}`;
  }
  if (!s || s.type === "enum") return `選んで答える: ${choices}`;
  if (s.type === "number") return `数字で答える${s.unit ? `（単位: ${s.unit}）` : ""}`;
  if (s.type === "form") return `${s.fields.length} 項目に答える: ${labels}`;
  return `文章で答える${s.max_chars ? `（${s.max_chars}字まで）` : ""}`;
}
/** 13 §4: how a scale field is answered, e.g. "（尺度で答える 1〜5）". */
export const scaleFormat = (lang: Lang, f: { min?: number; max: number }) =>
  lang === "en" ? ` (on a scale of ${f.min ?? 1}-${f.max})` : `（尺度で答える ${f.min ?? 1}〜${f.max}）`;
export const answerFormatJa = (s: AnswerSchemaView | undefined) => answerFormat("ja", s);
