// Requester SDK (05 §1-2). Thin, typed wrapper over the REST API; no business logic.

import type { ApiErrorBody } from "@proofmarket/core";
import type { CreateVerificationRequest, GetVerificationResponse } from "@proofmarket/core/schemas/api";

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
  }
}

export interface CreateVerificationResult {
  verification_id: string;
  status: "CREATED";
  created_at: string;
  funding: { status: "PENDING" };
  /** true when the server replayed a stored response (Idempotent-Replayed header). */
  replayed: boolean;
}

export class ProofMarketClient {
  constructor(readonly options: ProofMarketClientOptions) {}

  /** POST /v1/verifications. idempotencyKey is required by the API (REQ-A-004). */
  createVerification(
    _body: CreateVerificationRequest,
    _idempotencyKey: string,
  ): Promise<CreateVerificationResult> {
    throw new Error("NOT_IMPLEMENTED: createVerification (PR-12/13)");
  }

  /** GET /v1/verifications/{id}. Side-effect free; safe to poll (REQ-N-005). */
  getVerification(_id: string): Promise<GetVerificationResponse> {
    throw new Error("NOT_IMPLEMENTED: getVerification (PR-12/13)");
  }

  /**
   * Poll until result.status is VERIFIED / REJECTED / EXPIRED or the task is CANCELLED/REFUNDED,
   * or until timeoutMs elapses (returns the latest state; never fabricates completion).
   */
  waitForResult(
    _id: string,
    _opts: { timeoutMs: number; intervalMs?: number },
  ): Promise<GetVerificationResponse> {
    throw new Error("NOT_IMPLEMENTED: waitForResult (PR-12)");
  }

  /** POST /v1/verifications/{id}/cancel */
  cancelVerification(_id: string): Promise<GetVerificationResponse> {
    throw new Error("NOT_IMPLEMENTED: cancelVerification (PR-13)");
  }
}
