"use client";
import { useCallback } from "react";
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
export const errorText = (e: unknown) =>
  e instanceof ApiErr
    ? (ERROR_JA[e.code] ?? `エラーが発生しました（${e.code}）`)
    : "通信に失敗しました。電波の良い場所で再度お試しください。";
