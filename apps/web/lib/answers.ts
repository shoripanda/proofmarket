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
};

export const ANSWER_JA: Record<AnswerValue, { label: string; tone: string }> = {
  OPEN: { label: "営業している", tone: "bg-emerald-600" },
  CLOSED: { label: "営業していない", tone: "bg-slate-700" },
  NO_QUEUE: { label: "並んでいない", tone: "bg-emerald-600" },
  SHORT_QUEUE: { label: "5人くらいまで", tone: "bg-sky-600" },
  LONG_QUEUE: { label: "6人以上", tone: "bg-slate-700" },
  POSTED: { label: "出ている", tone: "bg-emerald-600" },
  NOT_POSTED: { label: "出ていない", tone: "bg-slate-700" },
  UNCLEAR: { label: "分からない", tone: "bg-amber-600" },
};

export const answerJa = (v: string | null | undefined) =>
  v ? (ANSWER_JA[v as AnswerValue]?.label ?? v) : null;
