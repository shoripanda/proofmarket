"use client";
import { useCallback } from "react";
import { type Lang, pick } from "@/lib/lang";
import { useSession } from "./auth";

export class ApiErr extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** fetch with the worker's bearer token; throws ApiErr with the spec error code. */
export function useApi() {
  const { getToken } = useSession();
  return useCallback(
    async <T>(path: string, init: { method?: string; body?: unknown; idem?: string } = {}): Promise<T> => {
      const token = await getToken();
      const res = await fetch(path, {
        method: init.method ?? "GET",
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(init.idem ? { "idempotency-key": init.idem } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: { code: string; message: string; details?: Record<string, unknown> };
      } | null;
      if (!res.ok) {
        throw new ApiErr(
          res.status,
          json?.error?.code ?? "INTERNAL_ERROR",
          json?.error?.message ?? `HTTP ${res.status}`,
          json?.error?.details ?? {},
        );
      }
      return json as T;
    },
    [getToken],
  );
}

/** Japanese text for API error codes a worker can hit (07 §6 + 05 §8). */
export const ERROR_JA: Record<string, string> = {
  UNAUTHENTICATED: "ログインし直してください。",
  WORKER_NOT_ONBOARDED: "最初に登録を済ませてください。",
  INVITE_INVALID: "招待コードが正しくないか、期限が切れています。",
  TASK_NOT_CLAIMABLE: "このタスクはもう引き受けられません。",
  NO_OPEN_SLOT: "ほかの人が先に引き受けました。",
  ALREADY_CLAIMED: "このタスクは引き受け済みです。",
  TASK_EXPIRED: "締切を過ぎました。",
  CLAIM_NOT_ACTIVE: "この引き受けは終了しています。",
  NONCE_EXPIRED: "撮影の受付時間を過ぎました。もう一度「撮影を始める」を押してください。",
  NONCE_INVALID: "撮影をやり直してください。",
  NONCE_USED: "この撮影はすでに送信済みです。",
  MEDIA_TYPE_UNSUPPORTED: "写真の形式に対応していません。撮り直してください。",
  MEDIA_TOO_LARGE: "写真が大きすぎます。撮り直してください。",
  RATE_LIMITED: "少し待ってからもう一度お試しください。",
  FEATURE_DISABLED: "現在この操作は止められています。しばらくお待ちください。",
};

const ERROR_EN: Record<string, string> = {
  UNAUTHENTICATED: "Please sign in again.",
  WORKER_NOT_ONBOARDED: "Please finish registration first.",
  INVITE_INVALID: "The invite code is wrong or has expired.",
  TASK_NOT_CLAIMABLE: "This task can no longer be claimed.",
  NO_OPEN_SLOT: "Someone else claimed it first.",
  ALREADY_CLAIMED: "You have already claimed this task.",
  TASK_EXPIRED: "The deadline has passed.",
  CLAIM_NOT_ACTIVE: "This claim has ended.",
  NONCE_EXPIRED: "The capture window has closed. Tap “Start capture” again.",
  NONCE_INVALID: "Please take the photo again.",
  NONCE_USED: "This capture has already been submitted.",
  MEDIA_TYPE_UNSUPPORTED: "That photo format is not supported. Please retake it.",
  MEDIA_TOO_LARGE: "The photo is too large. Please retake it.",
  RATE_LIMITED: "Please wait a moment and try again.",
  FEATURE_DISABLED: "This action is paused right now. Please try again later.",
};

export const errorText = (e: unknown, lang: Lang = "ja") => {
  if (e instanceof ApiErr) {
    const known = (lang === "en" ? ERROR_EN : ERROR_JA)[e.code];
    return known ?? pick(lang, `エラーが発生しました（${e.code}）`, `Something went wrong (${e.code}).`);
  }
  return pick(
    lang,
    "通信に失敗しました。電波の良い場所で再度お試しください。",
    "The connection failed. Please try again where the signal is better.",
  );
};
