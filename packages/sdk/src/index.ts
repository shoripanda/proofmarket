// Requester SDK (05 §1-2). Thin, typed wrapper over the REST API; no business logic.

import type { ApiErrorBody } from "@proofmarket/core";
import type { CreateVerificationRequest, GetVerificationResponse } from "@proofmarket/core/schemas/api";

export type { CreateVerificationRequest, GetVerificationResponse };

export interface ProofMarketClientOptions {
  baseUrl: string;
  /** pm_test_<prefix>_<secret> */
  apiKey: string;
  fetch?: typeof fetch;
}

export class ProofMarketApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(`${body.error.code}: ${body.error.message}`);
    this.name = "ProofMarketApiError";
  }
  get code() {
    return this.body.error.code;
  }
  get retryable() {
    return this.body.error.retryable;
  }
}

export interface CreateVerificationResult {
  verification_id: string;
  status: "CREATED" | "VERIFIED";
  created_at: string;
  funding: { status: "PENDING" | "NONE" };
  /** true when the server replayed a stored response (Idempotent-Replayed header). */
  replayed: boolean;
  /** true when a recent shared result was returned instead of a new task (01 §4.9). */
  reused?: boolean;
  /** The final public result when `reused` is true. */
  result?: Record<string, unknown>;
}

const FINAL_TASK_STATUSES = new Set(["SETTLED", "REJECTED", "EXPIRED", "CANCELLED", "REFUNDED"]);

/** True once the verification has an outcome (or was cancelled) — the agent can act on it. */
export function isDecided(v: GetVerificationResponse): boolean {
  return v.result !== null || FINAL_TASK_STATUSES.has(v.status);
}

export class ProofMarketClient {
  private readonly f: typeof fetch;
  constructor(readonly options: ProofMarketClientOptions) {
    this.f = options.fetch ?? fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    init: { body?: unknown; headers?: Record<string, string> } = {},
  ) {
    const res = await this.f(new URL(path, this.options.baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const body =
        json && typeof json === "object" && "error" in json
          ? (json as ApiErrorBody)
          : ({
              error: {
                code: "INTERNAL_ERROR",
                message: `HTTP ${res.status}`,
                retryable: res.status >= 500,
                details: {},
              },
            } as ApiErrorBody);
      throw new ProofMarketApiError(res.status, body);
    }
    return { json: json as T, res };
  }

  /** POST /v1/verifications. idempotencyKey is required by the API (REQ-A-004). */
  async createVerification(
    body: CreateVerificationRequest,
    idempotencyKey: string,
  ): Promise<CreateVerificationResult> {
    const { json, res } = await this.request<Omit<CreateVerificationResult, "replayed">>(
      "POST",
      "/v1/verifications",
      {
        body,
        headers: { "idempotency-key": idempotencyKey },
      },
    );
    return { ...json, replayed: res.headers.get("idempotent-replayed") === "true" };
  }

  /** GET /v1/verifications/{id}. Side-effect free; safe to poll (REQ-N-005). */
  async getVerification(id: string): Promise<GetVerificationResponse> {
    return (await this.request<GetVerificationResponse>("GET", `/v1/verifications/${encodeURIComponent(id)}`))
      .json;
  }

  /** POST /v1/verifications/{id}/cancel */
  async cancelVerification(id: string): Promise<GetVerificationResponse> {
    return (
      await this.request<GetVerificationResponse>(
        "POST",
        `/v1/verifications/${encodeURIComponent(id)}/cancel`,
      )
    ).json;
  }

  /**
   * Poll until the verification is decided or timeoutMs elapses; returns the latest state either way.
   * Never fabricates completion.
   */
  async waitForResult(
    id: string,
    opts: { timeoutMs: number; intervalMs?: number; onUpdate?: (v: GetVerificationResponse) => void },
  ): Promise<GetVerificationResponse> {
    const deadline = Date.now() + opts.timeoutMs;
    let last = await this.getVerification(id);
    opts.onUpdate?.(last);
    while (!isDecided(last) && Date.now() < deadline) {
      await new Promise((r) =>
        setTimeout(r, Math.min(opts.intervalMs ?? 5000, Math.max(0, deadline - Date.now()))),
      );
      const next = await this.getVerification(id);
      if (next.status !== last.status || next.updated_at !== last.updated_at) opts.onUpdate?.(next);
      last = next;
    }
    return last;
  }
}
