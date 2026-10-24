// Requester SDK (05 §1-2). Thin, typed wrapper over the REST API; no business logic.

export * from "./onchain.ts";

import type { ApiErrorBody } from "@proofmarket/core";
import type {
  CreateScheduleRequest,
  CreateVerificationBatchRequest,
  CreateVerificationRequest,
  GetVerificationResponse,
  ListVerificationsResponse,
  PublicAssets,
  QuoteResponse,
  Schedule,
} from "@proofmarket/core/schemas/api";

export type {
  CreateVerificationBatchRequest,
  CreateVerificationRequest,
  GetVerificationResponse,
  ListVerificationsResponse,
  QuoteResponse,
};
export type QuoteVerificationRequest = Omit<CreateVerificationRequest, "quote_id">;
export interface ListVerificationsQueryInput {
  /** Comma separated task statuses. */
  status?: string;
  created_after?: string;
  limit?: number;
  cursor?: string;
}

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

  /** POST /v1/verifications/batch — one template, many places or questions; all or nothing (01 §4.25). */
  async createVerificationBatch(
    body: CreateVerificationBatchRequest,
    idempotencyKey: string,
  ): Promise<{ verifications: Omit<CreateVerificationResult, "replayed">[]; replayed: boolean }> {
    const { json, res } = await this.request<{ verifications: Omit<CreateVerificationResult, "replayed">[] }>(
      "POST",
      "/v1/verifications/batch",
      { body, headers: { "idempotency-key": idempotencyKey } },
    );
    return { ...json, replayed: res.headers.get("idempotent-replayed") === "true" };
  }

  /** POST /v1/verifications/quote: cost and checks, nothing reserved (docs/architecture 04 §4.2). */
  async quoteVerification(body: QuoteVerificationRequest): Promise<QuoteResponse> {
    return (await this.request<QuoteResponse>("POST", "/v1/verifications/quote", { body })).json;
  }

  /** GET /v1/verifications: this key's verifications, newest first (docs/architecture 04 §4.1). */
  async listVerifications(q: ListVerificationsQueryInput = {}): Promise<ListVerificationsResponse> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined) params.set(k, String(v));
    const qs = params.toString();
    return (await this.request<ListVerificationsResponse>("GET", `/v1/verifications${qs ? `?${qs}` : ""}`))
      .json;
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

  /** POST /v1/verifications/{id}/dispute — once, within 24 h of the result; creates a recheck task (01 §4.12). */
  async disputeVerification(
    id: string,
    body: { reason?: string; assurance?: unknown; deadline_minutes?: number } = {},
  ): Promise<{ verification_id: string; recheck_verification_id: string }> {
    return (
      await this.request<{ verification_id: string; recheck_verification_id: string }>(
        "POST",
        `/v1/verifications/${encodeURIComponent(id)}/dispute`,
        { body },
      )
    ).json;
  }

  /** POST /v1/schedules — a recurring check or a watch (01 §4.23). */
  async createSchedule(body: CreateScheduleRequest): Promise<Schedule> {
    return (await this.request<Schedule>("POST", "/v1/schedules", { body })).json;
  }

  /** GET /v1/schedules */
  /** GET /v1/public/assets: the tokens this server accepts as `bounty.asset` (16 §3.2). */
  async listAssets(): Promise<PublicAssets> {
    return (await this.request<PublicAssets>("GET", "/v1/public/assets")).json;
  }

  async listSchedules(): Promise<{ schedules: Schedule[] }> {
    return (await this.request<{ schedules: Schedule[] }>("GET", "/v1/schedules")).json;
  }

  /** DELETE /v1/schedules/{id} */
  // ---------- general tasks (docs/architecture 13) ----------

  /** POST /v1/tasks. With `dry_run: true` nothing is created: the cost comes back. */
  async createTask(body: Record<string, unknown>, idempotencyKey?: string): Promise<Record<string, unknown>> {
    return (
      await this.request<Record<string, unknown>>("POST", "/v1/tasks", {
        body,
        ...(idempotencyKey ? { headers: { "idempotency-key": idempotencyKey } } : {}),
      })
    ).json;
  }

  async listTasks(): Promise<Record<string, unknown>> {
    return (await this.request<Record<string, unknown>>("GET", "/v1/tasks")).json;
  }

  async getTask(id: string): Promise<Record<string, unknown>> {
    return (await this.request<Record<string, unknown>>("GET", `/v1/tasks/${encodeURIComponent(id)}`)).json;
  }

  async cancelTask(id: string): Promise<Record<string, unknown>> {
    return (await this.request<Record<string, unknown>>("POST", `/v1/tasks/${encodeURIComponent(id)}/cancel`))
      .json;
  }

  async listTaskApplications(id: string): Promise<Record<string, unknown>> {
    return (
      await this.request<Record<string, unknown>>("GET", `/v1/tasks/${encodeURIComponent(id)}/applications`)
    ).json;
  }

  async decideTaskApplication(
    id: string,
    applicationId: string,
    action: "accept" | "reject",
    reason?: string,
  ): Promise<Record<string, unknown>> {
    return (
      await this.request<Record<string, unknown>>(
        "POST",
        `/v1/tasks/${encodeURIComponent(id)}/applications/${encodeURIComponent(applicationId)}/${action}`,
        { body: reason ? { reason } : {} },
      )
    ).json;
  }

  async decideTaskSeat(
    id: string,
    seatId: string,
    action: "release" | "request-changes" | "reject",
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return (
      await this.request<Record<string, unknown>>(
        "POST",
        `/v1/tasks/${encodeURIComponent(id)}/seats/${encodeURIComponent(seatId)}/${action}`,
        { body },
      )
    ).json;
  }

  /** Public worker profiles (docs/architecture 14 §3.4). */
  async searchWorkers(q: { skill?: string; city?: string; lang?: string; cursor?: string } = {}) {
    const qs = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => Boolean(e[1])));
    const path = `/v1/public/workers${qs.size ? `?${qs}` : ""}`;
    return (await this.request<Record<string, unknown>>("GET", path)).json;
  }

  async getWorkerProfile(publicId: string) {
    return (
      await this.request<Record<string, unknown>>("GET", `/v1/public/workers/${encodeURIComponent(publicId)}`)
    ).json;
  }

  /** Rate a released seat once, 1-5 (docs/architecture 14 §5). */
  async rateTaskSeat(id: string, seatId: string, body: { rating: number; comment?: string }) {
    return (
      await this.request<Record<string, unknown>>(
        "POST",
        `/v1/tasks/${encodeURIComponent(id)}/seats/${encodeURIComponent(seatId)}/review`,
        { body },
      )
    ).json;
  }

  /** Mark a worker as preferred or blocked, or clear it (docs/architecture 14 §4). */
  async setWorkerPreference(body: {
    worker: { public_id: string } | { task_id: string; worker_ref: string } | { pref_ref: string };
    kind: "prefer" | "block" | "clear";
  }): Promise<Record<string, unknown>> {
    return (await this.request<Record<string, unknown>>("POST", "/v1/worker-preferences", { body })).json;
  }

  async listWorkerPreferences(): Promise<Record<string, unknown>> {
    return (await this.request<Record<string, unknown>>("GET", "/v1/worker-preferences")).json;
  }

  async taskMessages(id: string, seatId: string): Promise<Record<string, unknown>> {
    return (
      await this.request<Record<string, unknown>>(
        "GET",
        `/v1/tasks/${encodeURIComponent(id)}/seats/${encodeURIComponent(seatId)}/messages`,
      )
    ).json;
  }

  async sendTaskMessage(id: string, seatId: string, body: string): Promise<Record<string, unknown>> {
    return (
      await this.request<Record<string, unknown>>(
        "POST",
        `/v1/tasks/${encodeURIComponent(id)}/seats/${encodeURIComponent(seatId)}/messages`,
        { body: { body } },
      )
    ).json;
  }

  async stopSchedule(id: string): Promise<Schedule> {
    return (await this.request<Schedule>("DELETE", `/v1/schedules/${encodeURIComponent(id)}`)).json;
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
